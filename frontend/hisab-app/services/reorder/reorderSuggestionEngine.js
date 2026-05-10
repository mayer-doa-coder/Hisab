import {
  fetchMarkovEnsembleDecision,
  fetchMarkovForecastForReorder,
} from '../markovClient.js';

const DEFAULT_RULE_CONFIG = {
  windowDays: 30,
  leadTimeDays: 3,
  reviewPeriodDays: 7,
  safetyDays: 2,
  minOrderQuantity: 1,
};

const EID_UL_FITR_BY_YEAR = Object.freeze({
  2024: '2024-04-10',
  2025: '2025-03-31',
  2026: '2026-03-20',
  2027: '2027-03-10',
  2028: '2028-02-27',
  2029: '2029-02-15',
  2030: '2030-02-05',
  2031: '2031-01-26',
  2032: '2032-01-14',
});

export const PREDICTOR_TYPES = {
  RULE_BASED: 'rule-based',
  MARKOV_CHAIN: 'markov-chain',
};

const normalizePositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.max(1, Math.trunc(numeric));
};

const addDaysUtc = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next;
};

const toUtcStartDate = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    0,
    0,
    0,
    0
  ));
};

const resolveHolidayDemandContext = (asOf = new Date()) => {
  const date = toUtcStartDate(asOf) || toUtcStartDate(new Date());
  const fallback = {
    seasonKey: 'NORMAL',
    label: 'Normal demand',
    demandMultiplier: 1,
    regime: 'NORMAL',
    isHolidayWindow: false,
    asOfIso: (date || new Date()).toISOString(),
    eidFitrDate: null,
    ramadanStartDate: null,
  };
  if (!date) {
    return fallback;
  }

  const year = date.getUTCFullYear();
  const eidRaw = EID_UL_FITR_BY_YEAR[year] || null;
  const dayOfWeek = date.getUTCDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday/Saturday

  if (!eidRaw) {
    if (isWeekend) {
      return {
        ...fallback,
        seasonKey: 'HOLIDAY_WEEKEND',
        label: 'Weekend holiday demand',
        demandMultiplier: 1.08,
        regime: 'HOLIDAY',
        isHolidayWindow: true,
      };
    }
    return fallback;
  }

  const eidDate = toUtcStartDate(`${eidRaw}T00:00:00.000Z`);
  if (!eidDate) {
    return fallback;
  }

  const ramadanStart = addDaysUtc(eidDate, -30);
  const preRamadanStart = addDaysUtc(ramadanStart, -14);
  const eidHolidayEnd = addDaysUtc(eidDate, 5);
  const postEidEnd = addDaysUtc(eidDate, 35);

  let seasonKey = 'NORMAL';
  let label = 'Normal demand';
  let demandMultiplier = 1;
  let regime = 'NORMAL';
  let isHolidayWindow = false;

  if (date >= preRamadanStart && date < ramadanStart) {
    seasonKey = 'PRE_RAMADAN';
    label = 'Pre-Ramadan stocking period';
    demandMultiplier = 1.22;
    regime = 'FESTIVAL';
    isHolidayWindow = true;
  } else if (date >= ramadanStart && date < eidDate) {
    seasonKey = 'RAMADAN';
    label = 'Ramadan demand uplift';
    demandMultiplier = 1.35;
    regime = 'FESTIVAL';
    isHolidayWindow = true;
  } else if (date >= eidDate && date < eidHolidayEnd) {
    seasonKey = 'EID_UL_FITR_HOLIDAY';
    label = 'Eid-ul-Fitr holiday spike';
    demandMultiplier = 1.55;
    regime = 'FESTIVAL';
    isHolidayWindow = true;
  } else if (date >= eidHolidayEnd && date < postEidEnd) {
    seasonKey = 'POST_EID_COOLDOWN';
    label = 'Post-Eid demand normalization';
    demandMultiplier = 0.88;
    regime = 'NORMAL';
    isHolidayWindow = true;
  } else if (isWeekend) {
    seasonKey = 'HOLIDAY_WEEKEND';
    label = 'Weekend holiday demand';
    demandMultiplier = 1.08;
    regime = 'HOLIDAY';
    isHolidayWindow = true;
  }

  return {
    seasonKey,
    label,
    demandMultiplier,
    regime,
    isHolidayWindow,
    asOfIso: date.toISOString(),
    eidFitrDate: eidDate.toISOString(),
    ramadanStartDate: ramadanStart.toISOString(),
  };
};

const normalizeNonNegativeInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Math.max(0, Math.trunc(numeric));
};

export const normalizeRuleConfig = (config = {}) => {
  const base = { ...DEFAULT_RULE_CONFIG, ...config };

  return {
    windowDays: normalizePositiveInt(base.windowDays, DEFAULT_RULE_CONFIG.windowDays),
    leadTimeDays: normalizePositiveInt(base.leadTimeDays, DEFAULT_RULE_CONFIG.leadTimeDays),
    reviewPeriodDays: normalizePositiveInt(base.reviewPeriodDays, DEFAULT_RULE_CONFIG.reviewPeriodDays),
    safetyDays: normalizeNonNegativeInt(base.safetyDays, DEFAULT_RULE_CONFIG.safetyDays),
    minOrderQuantity: normalizePositiveInt(base.minOrderQuantity, DEFAULT_RULE_CONFIG.minOrderQuantity),
  };
};

const buildSalesStatsByProduct = (salesRows, windowDays) => {
  const statsMap = new Map();

  for (const row of salesRows || []) {
    const productId = Number(row.product_id);
    const unitsSold = Math.max(0, Number(row.units_sold || 0));

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(unitsSold)) {
      continue;
    }

    const existing = statsMap.get(productId) || {
      totalUnitsSold: 0,
      salesDays: 0,
    };

    existing.totalUnitsSold += unitsSold;
    existing.salesDays += unitsSold > 0 ? 1 : 0;
    statsMap.set(productId, existing);
  }

  for (const [productId, stats] of statsMap.entries()) {
    statsMap.set(productId, {
      totalUnitsSold: stats.totalUnitsSold,
      salesDays: stats.salesDays,
      dailySalesRate: stats.totalUnitsSold / windowDays,
    });
  }

  return statsMap;
};

const buildSalesHistoryByProduct = (salesRows = []) => {
  const byProduct = new Map();

  for (const row of salesRows || []) {
    const productId = Number(row?.product_id);
    const unitsSold = Math.max(0, Number(row?.units_sold || 0));
    const saleDate = String(row?.sale_date || '').trim();
    if (!Number.isInteger(productId) || productId <= 0 || !saleDate || !Number.isFinite(unitsSold)) {
      continue;
    }

    const list = byProduct.get(productId) || [];
    list.push({
      sale_date: saleDate,
      units_sold: unitsSold,
    });
    byProduct.set(productId, list);
  }

  for (const [productId, rows] of byProduct.entries()) {
    byProduct.set(
      productId,
      rows.sort((left, right) => String(left.sale_date).localeCompare(String(right.sale_date)))
    );
  }

  return byProduct;
};

const roundToTwo = (value) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Math.round(value * 100) / 100;
};

const roundToSix = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(6));
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeSuggestionHorizon = (value) => {
  const token = String(value || '').trim().toUpperCase();
  return token === '1M' ? '1M' : '1W';
};

const normalizeEnsembleRationale = (rationale, diagnostics = {}) => {
  const text = String(rationale || '').trim();
  if (!text) {
    return '';
  }

  if (text.includes('ensemble_feature_disabled')) {
    return 'Advanced ensemble mode is temporarily paused, so the threshold baseline model is being used.';
  }
  if (text.includes('baseline_only_mode_enabled')) {
    return 'System is currently running in baseline-only mode for stable stock suggestions.';
  }
  if (text.includes('subject_not_in_rollout_segment')) {
    return 'This item is currently in the baseline segment while ensemble rollout is in progress.';
  }
  if (text.includes('baseline_fallback_disabled')) {
    return 'Advanced ensemble mode is unavailable and fallback is disabled; no reorder was recommended.';
  }
  if (Boolean(diagnostics?.fallback_applied) && text.startsWith('Ensemble disabled')) {
    return 'Advanced ensemble mode is currently unavailable, and a safe baseline decision was used.';
  }

  return text;
};

const buildReasonText = ({ reorderByDays, reorderByStock, dailySalesRate, daysRemaining }) => {
  if (reorderByDays && reorderByStock) {
    return 'Low projected days remaining and stock below reorder point.';
  }

  if (reorderByDays) {
    return 'Projected stockout before lead time ends.';
  }

  if (reorderByStock) {
    return 'Current stock is below reorder point.';
  }

  if (dailySalesRate <= 0) {
    return 'No recent sales trend detected.';
  }

  if (!Number.isFinite(daysRemaining)) {
    return 'Stable stock level based on current trend.';
  }

  return 'Stock level is currently healthy.';
};

export const buildRuleBasedReorderSuggestions = ({ products, salesRows, config }) => {
  const normalizedConfig = normalizeRuleConfig(config);
  const statsByProduct = buildSalesStatsByProduct(salesRows, normalizedConfig.windowDays);
  const holidayContext = resolveHolidayDemandContext(config?.asOfDate || new Date());

  return (products || [])
    .map((product) => {
      const productId = Number(product.id);
      const quantity = Math.max(0, Math.trunc(Number(product.quantity || 0)));
      const threshold = Math.max(0, Math.trunc(Number(product.low_stock_threshold || 5)));
      const stats = statsByProduct.get(productId) || {
        totalUnitsSold: 0,
        salesDays: 0,
        dailySalesRate: 0,
      };

      const baselineDailySalesRate = Math.max(0, Number(stats.dailySalesRate || 0));
      const adjustedDailySalesRate = Math.max(0, baselineDailySalesRate * Number(holidayContext.demandMultiplier || 1));
      const safetyStockUnits = Math.max(threshold, Math.ceil(adjustedDailySalesRate * normalizedConfig.safetyDays));
      const reorderPoint = Math.max(threshold, Math.ceil(adjustedDailySalesRate * normalizedConfig.leadTimeDays) + safetyStockUnits);
      const targetLevel = Math.max(
        reorderPoint,
        Math.ceil(adjustedDailySalesRate * (normalizedConfig.leadTimeDays + normalizedConfig.reviewPeriodDays)) + safetyStockUnits
      );

      const daysRemaining = adjustedDailySalesRate > 0 ? quantity / adjustedDailySalesRate : Number.POSITIVE_INFINITY;
      const reorderByStock = quantity <= reorderPoint;
      const reorderByDays = adjustedDailySalesRate > 0 && daysRemaining <= normalizedConfig.leadTimeDays;
      const shouldReorder = reorderByStock || reorderByDays;

      let suggestedOrderQuantity = 0;
      if (shouldReorder) {
        suggestedOrderQuantity = Math.max(
          normalizedConfig.minOrderQuantity,
          Math.ceil(targetLevel - quantity)
        );
      }

      if (!shouldReorder && adjustedDailySalesRate <= 0 && quantity <= threshold) {
        suggestedOrderQuantity = Math.max(normalizedConfig.minOrderQuantity, threshold * 2 - quantity);
      }

      const urgencyScore = shouldReorder
        ? reorderByDays
          ? 3
          : quantity <= threshold
            ? 2
            : 1
        : 0;

      const reasonBase = buildReasonText({
        reorderByDays,
        reorderByStock,
        dailySalesRate: adjustedDailySalesRate,
        daysRemaining,
      });
      const holidayReason = holidayContext.isHolidayWindow
        ? `${reasonBase} Holiday window applied (${holidayContext.label}, x${roundToTwo(holidayContext.demandMultiplier)}).`
        : reasonBase;

      return {
        productId,
        productName: String(product.name || ''),
        quantity,
        threshold,
        totalUnitsSold: Math.trunc(stats.totalUnitsSold || 0),
        salesDays: Math.trunc(stats.salesDays || 0),
        dailySalesRate: roundToTwo(adjustedDailySalesRate),
        baselineDailySalesRate: roundToTwo(baselineDailySalesRate),
        daysRemaining: Number.isFinite(daysRemaining) ? roundToTwo(daysRemaining) : null,
        reorderPoint,
        targetLevel,
        shouldReorder,
        suggestedOrderQuantity: Math.max(0, Math.trunc(suggestedOrderQuantity)),
        urgencyScore,
        reason: holidayReason,
        holidayContext,
      };
    })
    .sort((a, b) => {
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }

      if (a.shouldReorder !== b.shouldReorder) {
        return a.shouldReorder ? -1 : 1;
      }

      return a.productName.localeCompare(b.productName);
    });
};

const resolveProductSymbol = (product) => {
  const raw = product?.symbol || product?.sku || product?.code || product?.name || `PRODUCT_${product?.id || 'UNKNOWN'}`;
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
};

const normalizeModelVotes = ({ markov = 0, ema = 0, threshold = 0 }) => {
  const safeMarkov = Math.max(0, Number(markov || 0));
  const safeEma = Math.max(0, Number(ema || 0));
  const safeThreshold = Math.max(0, Number(threshold || 0));
  const sum = safeMarkov + safeEma + safeThreshold;

  if (sum <= 0) {
    return {
      markov: 0,
      ema: 0,
      threshold: 1,
    };
  }

  return {
    markov: roundToSix(safeMarkov / sum),
    ema: roundToSix(safeEma / sum),
    threshold: roundToSix(safeThreshold / sum),
  };
};

const estimateThresholdConfidence = (thresholdSuggestion) => {
  const urgency = Number(thresholdSuggestion?.urgencyScore || 0);
  const base = thresholdSuggestion?.shouldReorder ? 0.55 : 0.45;
  return clamp(base + (0.1 * clamp(urgency, 0, 3)), 0.1, 0.95);
};

const estimateMarkovCurrentState = ({ thresholdSuggestion, config }) => {
  const dailySalesRate = Math.max(0, Number(thresholdSuggestion?.dailySalesRate || 0));
  const threshold = Math.max(0, Number(thresholdSuggestion?.threshold || 0));
  const daysRemaining = Number(thresholdSuggestion?.daysRemaining);
  const leadTimeDays = Math.max(1, Number(config?.leadTimeDays || 3));

  if (!Number.isFinite(dailySalesRate) || dailySalesRate <= 0) {
    return 'SIDEWAYS_STABLE';
  }

  if (Number.isFinite(daysRemaining) && daysRemaining <= leadTimeDays) {
    return 'DOWNTREND';
  }

  const strongThreshold = threshold > 0 ? threshold / leadTimeDays : 2;
  if (dailySalesRate >= (strongThreshold * 1.5)) {
    return 'STRONG_UPTREND';
  }
  if (dailySalesRate >= strongThreshold) {
    return 'WEAK_UPTREND';
  }

  return 'SIDEWAYS_STABLE';
};

const buildMarkovFeaturePayload = ({ product, thresholdSuggestion, config, holidayContext = null }) => {
  const quantity = Math.max(0, Math.trunc(Number(product?.quantity || 0)));
  const threshold = Math.max(0, Math.trunc(Number(product?.low_stock_threshold || thresholdSuggestion?.threshold || 0)));
  const leadTimeDays = Math.max(1, Math.trunc(Number(config?.leadTimeDays || 3)));
  const dailySalesRate = Math.max(0, Number(thresholdSuggestion?.dailySalesRate || 0));

  return {
    current_inventory: quantity,
    lead_time_days: leadTimeDays,
    historical_average_sales_velocity: dailySalesRate,
    minimum_safe_stock_level: threshold,
    queue_features: {
      backlog_orders: Math.max(0, Number(product?.backlog_orders || 0)),
      pending_demand: Math.max(0, Number(thresholdSuggestion?.targetLevel || 0) - quantity),
      supply_capacity: Math.max(1, Number(product?.supply_capacity || 1)),
    },
    holiday_context: holidayContext && typeof holidayContext === 'object'
      ? {
        season_key: holidayContext.seasonKey || 'NORMAL',
        label: holidayContext.label || 'Normal demand',
        demand_multiplier: Number(holidayContext.demandMultiplier || 1),
        is_holiday_window: Boolean(holidayContext.isHolidayWindow),
      }
      : null,
    seasonal_demand_multiplier: Number(holidayContext?.demandMultiplier || 1),
  };
};

const resolveDecisionFromSignals = ({
  thresholdSuggestion,
  markovDistribution,
  markovConfidence,
}) => {
  const highDemandProbability = Number(markovDistribution?.HIGH_DEMAND || 0);
  const lowDemandProbability = Number(markovDistribution?.LOW_DEMAND || 0);

  let decision = thresholdSuggestion.shouldReorder ? 'BUY_NOW' : 'HOLD';
  let multiplier = 1;

  if (highDemandProbability >= 0.5 && markovConfidence >= 0.55) {
    decision = 'BUY_NOW';
    multiplier = 1.1 + (0.35 * highDemandProbability);
  } else if (lowDemandProbability >= 0.55 && markovConfidence >= 0.6) {
    decision = thresholdSuggestion.shouldReorder ? 'WATCH' : 'HOLD';
    multiplier = 0.6;
  } else if (!thresholdSuggestion.shouldReorder && highDemandProbability >= 0.4) {
    decision = 'WATCH';
    multiplier = 1;
  }

  return {
    decision,
    multiplier,
  };
};

const toUrgencyScore = (decision, confidence) => {
  if (decision === 'BUY_NOW') {
    if (confidence >= 0.75) {
      return 3;
    }
    if (confidence >= 0.55) {
      return 2;
    }
    return 1;
  }

  if (decision === 'WATCH') {
    return 1;
  }

  return 0;
};

const normalizeEnsembleDecision = (value, thresholdSuggestion) => {
  const token = String(value || '').trim().toUpperCase();

  if (token === 'BUY_NOW' || token === 'WATCH' || token === 'HOLD') {
    return token;
  }

  if (token === 'REORDER') {
    return 'BUY_NOW';
  }

  if (token === 'NO_REORDER') {
    return thresholdSuggestion?.shouldReorder ? 'WATCH' : 'HOLD';
  }

  return thresholdSuggestion?.shouldReorder ? 'WATCH' : 'HOLD';
};

const buildIntegratedRationale = ({
  thresholdSuggestion,
  markovState,
  markovConfidence,
  uncertainty,
  decision,
}) => {
  const fragments = [thresholdSuggestion.reason];

  fragments.push(`Markov regime: ${markovState}.`);

  if (decision === 'BUY_NOW') {
    fragments.push('Transition probabilities indicate elevated near-term demand.');
  } else if (decision === 'WATCH') {
    fragments.push('Demand signal is mixed; monitor stock closely.');
  } else {
    fragments.push('Demand outlook does not justify immediate reorder.');
  }

  fragments.push(`Confidence ${roundToTwo(markovConfidence)} with uncertainty ${roundToTwo(uncertainty)}.`);

  return fragments.join(' ').trim();
};

const buildIntegratedSuggestionRow = ({
  product,
  thresholdSuggestion,
  markovSignal,
  horizon,
  config,
  ensembleErrorMessage = null,
}) => {
  const markovDistribution = markovSignal?.next_state_distribution || {
    HIGH_DEMAND: 0,
    LOW_DEMAND: 0,
    STABLE: 0,
  };

  const markovConfidence = clamp(Number(markovSignal?.confidence || 0), 0, 1);
  const uncertainty = clamp(Number(markovSignal?.uncertainty || 1), 0, 1);
  const emaScore = clamp(Number(markovSignal?.ema?.score || 0), 0, 1);
  const thresholdConfidence = estimateThresholdConfidence(thresholdSuggestion);

  const { decision, multiplier } = resolveDecisionFromSignals({
    thresholdSuggestion,
    markovDistribution,
    markovConfidence,
  });

  const thresholdQuantity = Math.max(0, Math.trunc(Number(thresholdSuggestion?.suggestedOrderQuantity || 0)));
  const minOrderQuantity = Math.max(1, Math.trunc(Number(config?.minOrderQuantity || 1)));
  const rawQuantity = Math.ceil(thresholdQuantity * multiplier);
  const buyQuantity = decision === 'BUY_NOW'
    ? Math.max(minOrderQuantity, rawQuantity || minOrderQuantity)
    : 0;

  const uncertaintyPenalty = clamp(uncertainty - 0.65, 0, 0.35);
  const confidence = clamp(
    ((0.45 * thresholdConfidence) + (0.45 * markovConfidence) + (0.1 * emaScore)) - uncertaintyPenalty,
    0.05,
    0.99
  );

  const modelVotes = normalizeModelVotes({
    markov: markovConfidence,
    ema: emaScore,
    threshold: thresholdConfidence,
  });

  const markovState = String(markovSignal?.diagnostics?.markov_state || 'STABLE').trim().toUpperCase() || 'STABLE';
  const baseRationale = buildIntegratedRationale({
    thresholdSuggestion,
    markovState,
    markovConfidence,
    uncertainty,
    decision,
  });
  const rationale = ensembleErrorMessage
    ? `${baseRationale} Ensemble endpoint unavailable (${ensembleErrorMessage}); using local blend.`
    : baseRationale;

  const urgencyScore = toUrgencyScore(decision, confidence);

  return {
    symbol: resolveProductSymbol(product),
    buy_quantity: Math.max(0, Math.trunc(buyQuantity)),
    confidence: roundToSix(confidence),
    horizon,
    decision,
    model_votes: modelVotes,
    model_breakdown: modelVotes,
    weights: modelVotes,
    rationale,
    diagnostics: {
      markov_state: markovState,
      uncertainty: roundToSix(uncertainty),
      confidence: roundToSix(markovConfidence),
      holiday_context: thresholdSuggestion?.holidayContext || null,
      ensemble: {
        used: false,
        fallback_to_local_blend: true,
        error: ensembleErrorMessage || null,
      },
      distribution: {
        HIGH_DEMAND: roundToSix(markovDistribution.HIGH_DEMAND),
        LOW_DEMAND: roundToSix(markovDistribution.LOW_DEMAND),
        STABLE: roundToSix(markovDistribution.STABLE),
      },
    },
    productId: Number(product?.id || thresholdSuggestion?.productId || 0),
    productName: String(product?.name || thresholdSuggestion?.productName || ''),
    quantity: Math.max(0, Math.trunc(Number(product?.quantity || thresholdSuggestion?.quantity || 0))),
    threshold: Math.max(0, Math.trunc(Number(product?.low_stock_threshold || thresholdSuggestion?.threshold || 0))),
    totalUnitsSold: Math.max(0, Math.trunc(Number(thresholdSuggestion?.totalUnitsSold || 0))),
    salesDays: Math.max(0, Math.trunc(Number(thresholdSuggestion?.salesDays || 0))),
    dailySalesRate: roundToTwo(Number(thresholdSuggestion?.dailySalesRate || 0)),
    daysRemaining: Number.isFinite(Number(thresholdSuggestion?.daysRemaining))
      ? roundToTwo(Number(thresholdSuggestion.daysRemaining))
      : null,
    reorderPoint: Math.max(0, Math.trunc(Number(thresholdSuggestion?.reorderPoint || 0))),
    targetLevel: Math.max(0, Math.trunc(Number(thresholdSuggestion?.targetLevel || 0))),
    shouldReorder: decision === 'BUY_NOW',
    suggestedOrderQuantity: Math.max(0, Math.trunc(buyQuantity)),
    urgencyScore,
    reason: rationale,
    holidayContext: thresholdSuggestion?.holidayContext || null,
  };
};

const buildThresholdFallbackRow = ({
  product,
  thresholdSuggestion,
  horizon,
  errorMessage,
  isRateLimited = false,
}) => {
  const fallbackConfidence = clamp(estimateThresholdConfidence(thresholdSuggestion) * 0.75, 0.05, 0.95);
  const modelVotes = normalizeModelVotes({
    markov: 0.05,
    ema: 0.05,
    threshold: 0.9,
  });

  const baseDecision = thresholdSuggestion?.shouldReorder ? 'BUY_NOW' : 'HOLD';
  const fallbackDecision = fallbackConfidence < 0.35 && baseDecision === 'BUY_NOW'
    ? 'WATCH'
    : baseDecision;

  const fallbackQuantity = fallbackDecision === 'BUY_NOW'
    ? Math.max(0, Math.trunc(Number(thresholdSuggestion?.suggestedOrderQuantity || 0)))
    : 0;

  const markovFailureNote = isRateLimited
    ? ' Forecast service is busy; using local baseline.'
    : errorMessage
      ? ` Markov forecast unavailable (${errorMessage}).`
      : ' Markov forecast unavailable.';

  const rationale = `${thresholdSuggestion.reason}${markovFailureNote} Using threshold-only fallback.`.trim();
  const urgencyScore = toUrgencyScore(fallbackDecision, fallbackConfidence);

  return {
    symbol: resolveProductSymbol(product),
    buy_quantity: fallbackQuantity,
    confidence: roundToSix(fallbackConfidence),
    horizon,
    decision: fallbackDecision,
    model_votes: modelVotes,
    model_breakdown: modelVotes,
    weights: modelVotes,
    rationale,
    diagnostics: {
      markov_state: 'UNAVAILABLE',
      uncertainty: 1,
      confidence: 0,
      holiday_context: thresholdSuggestion?.holidayContext || null,
      ensemble: {
        used: false,
        fallback_to_threshold_only: true,
      },
      distribution: {
        HIGH_DEMAND: 0,
        LOW_DEMAND: 0,
        STABLE: 0,
      },
    },
    productId: Number(product?.id || thresholdSuggestion?.productId || 0),
    productName: String(product?.name || thresholdSuggestion?.productName || ''),
    quantity: Math.max(0, Math.trunc(Number(product?.quantity || thresholdSuggestion?.quantity || 0))),
    threshold: Math.max(0, Math.trunc(Number(product?.low_stock_threshold || thresholdSuggestion?.threshold || 0))),
    totalUnitsSold: Math.max(0, Math.trunc(Number(thresholdSuggestion?.totalUnitsSold || 0))),
    salesDays: Math.max(0, Math.trunc(Number(thresholdSuggestion?.salesDays || 0))),
    dailySalesRate: roundToTwo(Number(thresholdSuggestion?.dailySalesRate || 0)),
    daysRemaining: Number.isFinite(Number(thresholdSuggestion?.daysRemaining))
      ? roundToTwo(Number(thresholdSuggestion.daysRemaining))
      : null,
    reorderPoint: Math.max(0, Math.trunc(Number(thresholdSuggestion?.reorderPoint || 0))),
    targetLevel: Math.max(0, Math.trunc(Number(thresholdSuggestion?.targetLevel || 0))),
    shouldReorder: fallbackDecision === 'BUY_NOW',
    suggestedOrderQuantity: fallbackQuantity,
    urgencyScore,
    reason: rationale,
    holidayContext: thresholdSuggestion?.holidayContext || null,
  };
};

const isRateLimitedError = (error) => {
  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim().toLowerCase();
  return status === 429 || code === 'RATE_LIMITED' || message.includes('too many requests');
};

const buildEnsembleDecisionPayload = ({
  product,
  thresholdSuggestion,
  markovSignal,
  config,
  horizon,
}) => {
  const thresholdConfidence = estimateThresholdConfidence(thresholdSuggestion);
  const salesDays = Math.max(0, Number(thresholdSuggestion?.salesDays || 0));
  const minSparseDays = Math.max(3, Math.round(Number(config?.windowDays || 30) * 0.15));
  const emaStrength = clamp(Number(markovSignal?.ema?.strength || 0), 0, 1);
  const uncertainty = clamp(Number(markovSignal?.uncertainty || 1), 0, 1);

  return {
    symbol: resolveProductSymbol(product),
    horizon,
    decision_mode: 'BUY_NOW_WATCH_HOLD',
    suggested_order_quantity: Math.max(1, Math.trunc(Number(thresholdSuggestion?.suggestedOrderQuantity || 1))),
    ema: {
      ema_score: clamp(Number(markovSignal?.ema?.score || 0.5), 0, 1),
      trend: String(markovSignal?.ema?.trend || 'NEUTRAL').trim().toUpperCase() || 'NEUTRAL',
      strength: emaStrength,
    },
    threshold: {
      decision: thresholdSuggestion?.shouldReorder ? 'REORDER' : 'NO_REORDER',
      confidence: roundToSix(thresholdConfidence),
    },
    markov: {
      confidence: roundToSix(clamp(Number(markovSignal?.confidence || 0), 0, 1)),
      uncertainty: roundToSix(uncertainty),
      next_state_distribution: markovSignal?.next_state_distribution || {
        HIGH_DEMAND: 0,
        LOW_DEMAND: 0,
        STABLE: 0,
      },
    },
    context: {
      data_sparse: salesDays < minSparseDays,
      strong_trend: emaStrength >= 0.7,
      high_volatility: uncertainty >= 0.7,
    },
  };
};

const buildEnsembleSuggestionRow = ({
  product,
  thresholdSuggestion,
  markovSignal,
  ensembleDecision,
  horizon,
}) => {
  const decision = normalizeEnsembleDecision(ensembleDecision?.decision, thresholdSuggestion);
  const confidence = clamp(Number(ensembleDecision?.confidence || markovSignal?.confidence || 0.05), 0.05, 0.99);
  const fallbackQuantity = Math.max(1, Math.trunc(Number(thresholdSuggestion?.suggestedOrderQuantity || 1)));
  const buyQuantity = decision === 'BUY_NOW'
    ? Math.max(1, Math.trunc(Number(ensembleDecision?.buy_quantity || fallbackQuantity)))
    : 0;

  const modelVotes = normalizeModelVotes({
    markov: ensembleDecision?.model_votes?.markov ?? ensembleDecision?.weights?.markov ?? markovSignal?.confidence,
    ema: ensembleDecision?.model_votes?.ema ?? ensembleDecision?.weights?.ema ?? markovSignal?.ema?.score,
    threshold: ensembleDecision?.model_votes?.threshold ?? ensembleDecision?.weights?.threshold ?? estimateThresholdConfidence(thresholdSuggestion),
  });

  const modelBreakdown = {
    ema: roundToSix(Number(ensembleDecision?.model_breakdown?.ema || 0)),
    threshold: roundToSix(Number(ensembleDecision?.model_breakdown?.threshold || 0)),
    markov: roundToSix(Number(ensembleDecision?.model_breakdown?.markov || 0)),
  };

  const weights = {
    ema: roundToSix(Number(ensembleDecision?.weights?.ema || modelVotes.ema)),
    threshold: roundToSix(Number(ensembleDecision?.weights?.threshold || modelVotes.threshold)),
    markov: roundToSix(Number(ensembleDecision?.weights?.markov || modelVotes.markov)),
  };

  const urgencyScore = toUrgencyScore(decision, confidence);
  const rationale = normalizeEnsembleRationale(
    ensembleDecision?.rationale || thresholdSuggestion?.reason || '',
    ensembleDecision?.diagnostics
  );

  return {
    symbol: resolveProductSymbol(product),
    buy_quantity: Math.max(0, Math.trunc(buyQuantity)),
    confidence: roundToSix(confidence),
    horizon,
    decision,
    model_votes: modelVotes,
    model_breakdown: modelBreakdown,
    weights,
    rationale,
    diagnostics: {
      markov_state: String(markovSignal?.diagnostics?.markov_state || 'STABLE').trim().toUpperCase() || 'STABLE',
      uncertainty: roundToSix(Number(markovSignal?.uncertainty || 1)),
      confidence: roundToSix(Number(markovSignal?.confidence || 0)),
      holiday_context: thresholdSuggestion?.holidayContext || null,
      ensemble: {
        used: true,
        score: roundToSix(Number(ensembleDecision?.diagnostics?.score || 0)),
        agreement: roundToSix(Number(ensembleDecision?.diagnostics?.agreement || 0)),
        fallback_applied: Boolean(ensembleDecision?.diagnostics?.fallback_applied),
        fallback_notes: Array.isArray(ensembleDecision?.diagnostics?.fallback_notes)
          ? ensembleDecision.diagnostics.fallback_notes
          : [],
      },
      distribution: {
        HIGH_DEMAND: roundToSix(Number(markovSignal?.next_state_distribution?.HIGH_DEMAND || 0)),
        LOW_DEMAND: roundToSix(Number(markovSignal?.next_state_distribution?.LOW_DEMAND || 0)),
        STABLE: roundToSix(Number(markovSignal?.next_state_distribution?.STABLE || 0)),
      },
    },
    productId: Number(product?.id || thresholdSuggestion?.productId || 0),
    productName: String(product?.name || thresholdSuggestion?.productName || ''),
    quantity: Math.max(0, Math.trunc(Number(product?.quantity || thresholdSuggestion?.quantity || 0))),
    threshold: Math.max(0, Math.trunc(Number(product?.low_stock_threshold || thresholdSuggestion?.threshold || 0))),
    totalUnitsSold: Math.max(0, Math.trunc(Number(thresholdSuggestion?.totalUnitsSold || 0))),
    salesDays: Math.max(0, Math.trunc(Number(thresholdSuggestion?.salesDays || 0))),
    dailySalesRate: roundToTwo(Number(thresholdSuggestion?.dailySalesRate || 0)),
    daysRemaining: Number.isFinite(Number(thresholdSuggestion?.daysRemaining))
      ? roundToTwo(Number(thresholdSuggestion.daysRemaining))
      : null,
    reorderPoint: Math.max(0, Math.trunc(Number(thresholdSuggestion?.reorderPoint || 0))),
    targetLevel: Math.max(0, Math.trunc(Number(thresholdSuggestion?.targetLevel || 0))),
    shouldReorder: decision === 'BUY_NOW',
    suggestedOrderQuantity: Math.max(0, Math.trunc(buyQuantity)),
    urgencyScore,
    reason: rationale,
    holidayContext: thresholdSuggestion?.holidayContext || null,
  };
};

const buildMarkovIntegratedReorderSuggestions = async ({
  products,
  salesRows,
  config,
  accessToken,
  horizon,
  backendEnabled,
}) => {
  const normalizedConfig = normalizeRuleConfig(config);
  const normalizedHorizon = normalizeSuggestionHorizon(horizon);
  const holidayContext = resolveHolidayDemandContext(config?.asOfDate || new Date());
  const salesHistoryByProduct = buildSalesHistoryByProduct(salesRows);

  const thresholdSuggestions = buildRuleBasedReorderSuggestions({
    products,
    salesRows,
    config: normalizedConfig,
  });

  const productById = new Map(
    (products || [])
      .map((product) => [Number(product?.id), product])
      .filter(([productId]) => Number.isInteger(productId) && productId > 0)
  );

  if (!backendEnabled) {
    return thresholdSuggestions.map((thresholdSuggestion) => {
      const product = productById.get(Number(thresholdSuggestion.productId)) || {
        id: thresholdSuggestion.productId,
        name: thresholdSuggestion.productName,
      };
      return buildThresholdFallbackRow({
        product,
        thresholdSuggestion,
        horizon: normalizedHorizon,
        errorMessage: 'backend disabled',
      });
    });
  }

  const suggestions = [];
  let rateLimited = false;

  for (const thresholdSuggestion of thresholdSuggestions) {
    const product = productById.get(Number(thresholdSuggestion.productId)) || {
      id: thresholdSuggestion.productId,
      name: thresholdSuggestion.productName,
    };

    if (rateLimited) {
      suggestions.push(buildThresholdFallbackRow({
        product,
        thresholdSuggestion,
        horizon: normalizedHorizon,
        errorMessage: null,
        isRateLimited: true,
      }));
      continue;
    }

    try {
      const markovSignal = await fetchMarkovForecastForReorder({
        accessToken,
        product,
        thresholdSuggestion,
        config: normalizedConfig,
        salesHistoryRows: salesHistoryByProduct.get(Number(thresholdSuggestion.productId)) || [],
        horizon: normalizedHorizon,
        regime: holidayContext.regime,
        holidayContext,
        currentState: estimateMarkovCurrentState({
          thresholdSuggestion,
          config: normalizedConfig,
        }),
        features: buildMarkovFeaturePayload({
          product,
          thresholdSuggestion,
          config: normalizedConfig,
          holidayContext,
        }),
      });

      try {
        const ensembleDecision = await fetchMarkovEnsembleDecision({
          accessToken,
          payload: buildEnsembleDecisionPayload({
            product,
            thresholdSuggestion,
            markovSignal,
            config: normalizedConfig,
            horizon: normalizedHorizon,
          }),
        });

        suggestions.push(buildEnsembleSuggestionRow({
          product,
          thresholdSuggestion,
          markovSignal,
          ensembleDecision,
          horizon: normalizedHorizon,
        }));
      } catch (ensembleError) {
        suggestions.push(buildIntegratedSuggestionRow({
          product,
          thresholdSuggestion,
          markovSignal,
          horizon: normalizedHorizon,
          config: normalizedConfig,
          ensembleErrorMessage: ensembleError?.message || 'ensemble decision failed',
        }));
      }
    } catch (error) {
      const hitRateLimit = isRateLimitedError(error);
      if (hitRateLimit) {
        rateLimited = true;
      }

      suggestions.push(buildThresholdFallbackRow({
        product,
        thresholdSuggestion,
        horizon: normalizedHorizon,
        errorMessage: hitRateLimit ? null : (error?.message || 'markov forecast failed'),
        isRateLimited: hitRateLimit,
      }));
    }
  }

  return suggestions.sort((a, b) => {
    if (b.urgencyScore !== a.urgencyScore) {
      return b.urgencyScore - a.urgencyScore;
    }

    if (a.shouldReorder !== b.shouldReorder) {
      return a.shouldReorder ? -1 : 1;
    }

    return String(a.productName || '').localeCompare(String(b.productName || ''));
  });
};

const createRuleBasedPredictor = () => ({
  type: PREDICTOR_TYPES.RULE_BASED,
  predict: ({ products, salesRows, config }) =>
    buildRuleBasedReorderSuggestions({ products, salesRows, config }),
});

const createMarkovChainPredictor = (options = {}) => ({
  type: PREDICTOR_TYPES.MARKOV_CHAIN,
  predict: async ({ products, salesRows, config, accessToken = null, horizon = '1W' } = {}) => {
    return buildMarkovIntegratedReorderSuggestions({
      products,
      salesRows,
      config,
      accessToken: accessToken || options?.accessToken || null,
      horizon,
      backendEnabled: options?.backendEnabled !== false,
    });
  },
});

export const createReorderPredictor = (type = PREDICTOR_TYPES.RULE_BASED, options = {}) => {
  if (type === PREDICTOR_TYPES.MARKOV_CHAIN) {
    return createMarkovChainPredictor(options);
  }

  return createRuleBasedPredictor();
};
