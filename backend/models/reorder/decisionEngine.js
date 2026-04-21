const {
  calculateSafetyStock,
  calculateROP,
  calculateDaysRemaining,
} = require('./reorderCalculator');
const { RISK_LEVELS, evaluateRisk } = require('./riskEvaluator');

const REORDER_DECISIONS = Object.freeze({
  REORDER: 'REORDER',
  NO_REORDER: 'NO_REORDER',
});

const REORDER_REASON_CODES = Object.freeze({
  LOW_STOCK_BELOW_REORDER_POINT: 'LOW_STOCK_BELOW_REORDER_POINT',
  HIGH_STOCKOUT_RISK: 'HIGH_STOCKOUT_RISK',
  MEDIUM_STOCKOUT_RISK: 'MEDIUM_STOCKOUT_RISK',
  SUFFICIENT_STOCK: 'SUFFICIENT_STOCK',
  NO_SALES_HISTORY: 'NO_SALES_HISTORY',
  ZERO_STOCK_FORCE_REORDER: 'ZERO_STOCK_FORCE_REORDER',
  OVERSTOCK: 'OVERSTOCK',
  SPARSE_DATA: 'SPARSE_DATA',
  FALLBACK_VELOCITY_USED: 'FALLBACK_VELOCITY_USED',
});

const REORDER_DECISION_CONTRACT = Object.freeze({
  contract_name: 'reorder_threshold_decision_output',
  contract_version: 'reorder_threshold_decision_output_v1',
  locked: true,
  schema: {
    decision: 'REORDER | NO_REORDER',
    confidence: 'number',
    reason_codes: 'string[]',
    metrics: {
      reorder_point: 'number',
      days_remaining: 'number',
      stockout_risk: 'LOW | MEDIUM | HIGH',
    },
  },
});

const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return Number(Number(value).toFixed(6));
};

const uniqueCodes = (codes = []) => {
  const seen = new Set();
  const result = [];

  for (const code of Array.isArray(codes) ? codes : []) {
    const token = String(code || '').trim().toUpperCase();
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }

  return result;
};

const calculateConfidence = ({
  decision,
  stockPosition,
  reorderPoint,
  stockoutRisk,
  volatility,
  salesVelocity,
  noSalesHistory,
  sparseData,
  overstock,
} = {}) => {
  const safeStock = Math.max(0, toNumber(stockPosition, 0));
  const safeRop = Math.max(0, toNumber(reorderPoint, 0));
  const safeVolatility = Math.max(0, toNumber(volatility, 0));
  const safeVelocity = Math.max(0, toNumber(salesVelocity, 0));

  const distanceRatio = clamp(
    Math.abs(safeStock - safeRop) / Math.max(1, safeRop),
    0,
    1
  );

  const volatilityPenalty = clamp(
    safeVolatility / Math.max(1, safeVelocity * 4),
    0,
    0.25
  );

  let confidence = 0.55 + (0.35 * distanceRatio) - volatilityPenalty;

  if (decision === REORDER_DECISIONS.REORDER) {
    if (stockoutRisk === RISK_LEVELS.HIGH) {
      confidence += 0.08;
    } else if (stockoutRisk === RISK_LEVELS.MEDIUM) {
      confidence += 0.03;
    }
  } else {
    if (overstock) {
      confidence += 0.1;
    }
    if (stockoutRisk === RISK_LEVELS.HIGH) {
      confidence -= 0.15;
    } else if (stockoutRisk === RISK_LEVELS.MEDIUM) {
      confidence -= 0.05;
    }
  }

  if (noSalesHistory) {
    confidence = Math.min(confidence, 0.45);
  }

  if (sparseData) {
    confidence *= 0.75;
  }

  return roundSix(clamp(confidence, 0.05, 0.99));
};

const makeDecision = (features = {}, options = {}) => {
  const safeFeatures = features && typeof features === 'object' ? features : {};

  const z = Math.max(0, toNumber(options.z ?? options.serviceLevelFactor, 1.65));
  const defaultSalesVelocity = Math.max(0.0001, toNumber(options.defaultSalesVelocity, 0.1));
  const sparseDataMinDays = Math.max(1, Math.trunc(toNumber(options.sparseDataMinDays, 14)));
  const overstockMultiplier = Math.max(1.1, toNumber(options.overstockMultiplier, 1.5));

  const stockPositionRaw = toNumber(safeFeatures.stock_position, NaN);
  const leadTimeRaw = toNumber(safeFeatures.lead_time, NaN);
  const salesVelocityRaw = toNumber(safeFeatures.sales_velocity, NaN);
  const volatilityRaw = toNumber(safeFeatures.volatility, NaN);

  const sampleDays = Math.max(0, Math.trunc(toNumber(
    safeFeatures.sample_days
    ?? safeFeatures.sales_history_days
    ?? options.sampleDays,
    0
  )));

  const reasonCodes = [];

  const stockPosition = Number.isFinite(stockPositionRaw)
    ? Math.max(0, stockPositionRaw)
    : 0;

  const leadTime = Number.isFinite(leadTimeRaw)
    ? Math.max(0, leadTimeRaw)
    : 0;

  const noSalesHistory = !Number.isFinite(salesVelocityRaw) || salesVelocityRaw <= 0;
  const salesVelocity = noSalesHistory
    ? defaultSalesVelocity
    : Math.max(0, salesVelocityRaw);

  if (noSalesHistory) {
    reasonCodes.push(REORDER_REASON_CODES.NO_SALES_HISTORY);
    reasonCodes.push(REORDER_REASON_CODES.FALLBACK_VELOCITY_USED);
  }

  const volatility = Number.isFinite(volatilityRaw)
    ? Math.max(0, volatilityRaw)
    : 0;

  const sparseData = sampleDays > 0 && sampleDays < sparseDataMinDays;
  if (sparseData) {
    reasonCodes.push(REORDER_REASON_CODES.SPARSE_DATA);
  }

  const safetyStock = calculateSafetyStock({
    z,
    volatility,
    leadTime,
  });

  const reorderPoint = calculateROP({
    salesVelocity,
    leadTime,
    safetyStock,
  });

  const daysRemaining = calculateDaysRemaining({
    stockPosition,
    salesVelocity,
  });

  const risk = evaluateRisk({
    daysRemaining,
    leadTime,
  });

  if (risk.stockout_risk === RISK_LEVELS.HIGH) {
    reasonCodes.push(REORDER_REASON_CODES.HIGH_STOCKOUT_RISK);
  } else if (risk.stockout_risk === RISK_LEVELS.MEDIUM) {
    reasonCodes.push(REORDER_REASON_CODES.MEDIUM_STOCKOUT_RISK);
  }

  let decision = stockPosition <= reorderPoint
    ? REORDER_DECISIONS.REORDER
    : REORDER_DECISIONS.NO_REORDER;

  if (stockPosition <= 0) {
    decision = REORDER_DECISIONS.REORDER;
    reasonCodes.push(REORDER_REASON_CODES.ZERO_STOCK_FORCE_REORDER);
  }

  const overstock = stockPosition >= (reorderPoint * overstockMultiplier);
  if (overstock && decision === REORDER_DECISIONS.NO_REORDER) {
    reasonCodes.push(REORDER_REASON_CODES.OVERSTOCK);
  }

  if (decision === REORDER_DECISIONS.REORDER) {
    reasonCodes.push(REORDER_REASON_CODES.LOW_STOCK_BELOW_REORDER_POINT);
  } else {
    reasonCodes.push(REORDER_REASON_CODES.SUFFICIENT_STOCK);
  }

  const confidence = calculateConfidence({
    decision,
    stockPosition,
    reorderPoint,
    stockoutRisk: risk.stockout_risk,
    volatility,
    salesVelocity,
    noSalesHistory,
    sparseData,
    overstock,
  });

  return {
    decision,
    confidence,
    reason_codes: uniqueCodes(reasonCodes),
    metrics: {
      reorder_point: roundSix(Math.max(0, reorderPoint)),
      days_remaining: roundSix(Math.max(0, daysRemaining)),
      stockout_risk: risk.stockout_risk,
    },
    diagnostics: {
      safety_stock: roundSix(Math.max(0, safetyStock)),
      sales_velocity_used: roundSix(Math.max(0, salesVelocity)),
      stock_position_used: roundSix(Math.max(0, stockPosition)),
      lead_time_used: roundSix(Math.max(0, leadTime)),
      volatility_used: roundSix(Math.max(0, volatility)),
      sparse_data: sparseData,
      no_sales_history: noSalesHistory,
      overstock,
      service_level_factor: roundSix(z),
    },
  };
};

module.exports = {
  REORDER_DECISIONS,
  REORDER_REASON_CODES,
  REORDER_DECISION_CONTRACT,
  makeDecision,
};
