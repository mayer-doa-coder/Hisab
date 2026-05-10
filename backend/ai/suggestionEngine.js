const {
  HORIZON_DAYS,
  normalizeHorizons,
  deriveSalesFeaturesFromSeries,
  buildSalesFeatureSetForUser,
} = require('./featureBuilder');
const {
  computeModelAgreement,
  computeConfidenceBand,
} = require('./confidenceCalculator');
const {
  buildSuggestionExplanation,
} = require('./explanationEngine');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => Number(toNumber(value, 0).toFixed(6));

const mean = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + toNumber(value, 0), 0);
  return total / values.length;
};

const stdDev = (values = [], baseMean = null) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const mu = baseMean === null ? mean(values) : toNumber(baseMean, 0);
  const squared = values.reduce((sum, value) => {
    const delta = toNumber(value, 0) - mu;
    return sum + (delta * delta);
  }, 0);

  return Math.sqrt(squared / values.length);
};

const toUtcStartOfDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addUtcDays = (date, days) => {
  const base = toUtcStartOfDay(date);
  if (!base) {
    return null;
  }

  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + Math.trunc(toNumber(days, 0)));
  return shifted;
};

const daysBetweenUtc = (left, right) => {
  const start = toUtcStartOfDay(left);
  const end = toUtcStartOfDay(right);
  if (!start || !end) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

const resolveHolidayBaseMultiplier = (name = '') => {
  const token = String(name || '').trim().toLowerCase();
  if (!token) {
    return 1.08;
  }
  if (token.includes('ramadan') || token.includes('রমজান')) {
    return 1.18;
  }
  if (token.includes('eid') || token.includes('ঈদ')) {
    return 1.26;
  }
  if (token.includes('holiday') || token.includes('ছুটি')) {
    return 1.12;
  }
  return 1.1;
};

const resolveHolidayContextForHorizon = ({
  horizonToken = '7D',
  asOf = null,
  manualHolidays = [],
  holidayImpactScale = 1,
} = {}) => {
  const horizonDays = Math.max(1, Math.trunc(toNumber(HORIZON_DAYS[horizonToken], 7)));
  const anchor = toUtcStartOfDay(asOf) || toUtcStartOfDay(new Date());
  const endDate = addUtcDays(anchor, horizonDays);
  const impactScale = clamp(toNumber(holidayImpactScale, 1), 0, 2);

  const matched = [];
  let strongestBaseMultiplier = 1;

  for (const item of Array.isArray(manualHolidays) ? manualHolidays : []) {
    const date = toUtcStartOfDay(item?.date);
    if (!date || !endDate) {
      continue;
    }

    const daysAway = daysBetweenUtc(anchor, date);
    if (daysAway < 0 || daysAway > horizonDays) {
      continue;
    }

    const name = String(item?.name || 'Holiday').trim() || 'Holiday';
    const baseMultiplier = clamp(
      toNumber(item?.multiplier, resolveHolidayBaseMultiplier(name)),
      0.85,
      1.6
    );
    strongestBaseMultiplier = Math.max(strongestBaseMultiplier, baseMultiplier);
    matched.push({
      name,
      date: date.toISOString(),
      days_away: daysAway,
      base_multiplier: roundSix(baseMultiplier),
    });
  }

  const adjustedMultiplier = clamp(
    1 + ((strongestBaseMultiplier - 1) * impactScale),
    0.85,
    1.6
  );

  return {
    multiplier: roundSix(adjustedMultiplier),
    applied: matched.length > 0 && adjustedMultiplier !== 1,
    matched_holidays: matched.sort((left, right) => left.days_away - right.days_away),
    as_of: anchor ? anchor.toISOString() : null,
    window_end: endDate ? endDate.toISOString() : null,
  };
};

const DEFAULT_ENGINE_CONFIG = Object.freeze({
  leadTimeDays: 7,
  reviewDays: 7,
  safetyDays: 3,
  lookbackDays: 120,
  minTrainDays: 35,
  maxBacktestWindows: 24,
  backtestStepDays: 7,
});

const normalizeEngineConfig = (config = {}) => {
  const merged = {
    ...DEFAULT_ENGINE_CONFIG,
    ...(config && typeof config === 'object' ? config : {}),
  };

  return {
    leadTimeDays: Math.max(1, Math.trunc(toNumber(merged.leadTimeDays, DEFAULT_ENGINE_CONFIG.leadTimeDays))),
    reviewDays: Math.max(1, Math.trunc(toNumber(merged.reviewDays, DEFAULT_ENGINE_CONFIG.reviewDays))),
    safetyDays: Math.max(0, Math.trunc(toNumber(merged.safetyDays, DEFAULT_ENGINE_CONFIG.safetyDays))),
    lookbackDays: Math.max(30, Math.min(365, Math.trunc(toNumber(merged.lookbackDays, DEFAULT_ENGINE_CONFIG.lookbackDays)))),
    minTrainDays: Math.max(21, Math.trunc(toNumber(merged.minTrainDays, DEFAULT_ENGINE_CONFIG.minTrainDays))),
    maxBacktestWindows: Math.max(3, Math.trunc(toNumber(merged.maxBacktestWindows, DEFAULT_ENGINE_CONFIG.maxBacktestWindows))),
    backtestStepDays: Math.max(1, Math.trunc(toNumber(merged.backtestStepDays, DEFAULT_ENGINE_CONFIG.backtestStepDays))),
  };
};

const resolveModelWeights = (features = {}) => {
  const weights = {
    ema: 0.33,
    threshold: 0.34,
    markov: 0.33,
  };

  const sampleDays = Math.max(0, Math.trunc(toNumber(features.sample_days, 0)));
  const activeSalesDays = Math.max(0, Math.trunc(toNumber(features.active_sales_days, 0)));
  const markovUncertainty = clamp(toNumber(features?.markov?.uncertainty, 1), 0, 1);

  if (sampleDays < 21) {
    weights.threshold += 0.15;
    weights.ema -= 0.05;
    weights.markov -= 0.1;
  }

  if (activeSalesDays < 10) {
    weights.threshold += 0.1;
    weights.ema -= 0.04;
    weights.markov -= 0.06;
  }

  if (markovUncertainty > 0.65) {
    weights.threshold *= 1.2;
    weights.markov *= 0.7;
  }

  const sum = Math.max(0.000001, weights.ema + weights.threshold + weights.markov);

  return {
    ema: roundSix(weights.ema / sum),
    threshold: roundSix(weights.threshold / sum),
    markov: roundSix(weights.markov / sum),
  };
};

const buildThresholdSignal = ({ features = {}, horizonToken = '1W', config = DEFAULT_ENGINE_CONFIG } = {}) => {
  const horizonDays = HORIZON_DAYS[horizonToken] || 7;
  const seasonality = clamp(toNumber(features?.seasonality_factors?.[horizonToken], 1), 0.6, 1.4);
  const dailyVelocity = Math.max(0, toNumber(features.base_daily_velocity, 0));
  const leadTimeDays = Math.max(1, Math.trunc(toNumber(features.lead_time_days, config.leadTimeDays)));
  const inventory = Math.max(0, toNumber(features.current_inventory, 0));
  const reorderLevel = Math.max(0, toNumber(features.reorder_level, 0));

  const leadDemand = dailyVelocity * seasonality * leadTimeDays;
  const reviewDemand = dailyVelocity * seasonality * Math.max(1, Math.trunc(config.reviewDays));
  const safetyStock = Math.max(reorderLevel, dailyVelocity * Math.max(1, Math.trunc(config.safetyDays)));

  const reorderPoint = leadDemand + safetyStock;
  const targetStock = leadDemand + reviewDemand + safetyStock;
  const expectedDemand = dailyVelocity * seasonality * horizonDays;

  const demandGap = expectedDemand - inventory;
  const propensity = clamp(0.5 + (demandGap / Math.max(1, expectedDemand + inventory)), 0, 1);
  const shouldReorder = inventory <= reorderPoint;

  const margin = Math.abs(reorderPoint - inventory) / Math.max(1, reorderPoint);
  const confidence = clamp(0.45 + (0.35 * margin), 0.05, 0.95);

  return {
    expected_demand: roundSix(expectedDemand),
    propensity: roundSix(propensity),
    confidence: roundSix(confidence),
    target_stock: roundSix(targetStock),
    reorder_point: roundSix(reorderPoint),
    should_reorder: shouldReorder,
  };
};

const buildEmaSignal = ({ features = {}, horizonToken = '1W' } = {}) => {
  const horizonDays = HORIZON_DAYS[horizonToken] || 7;
  const seasonality = clamp(toNumber(features?.seasonality_factors?.[horizonToken], 1), 0.6, 1.4);
  const inventory = Math.max(0, toNumber(features.current_inventory, 0));

  const emaShort = Math.max(0, toNumber(features.ema_short_daily, 0));
  const emaLong = Math.max(0, toNumber(features.ema_long_daily, emaShort));
  const trendPct = clamp(toNumber(features.trend_pct, 0), -0.35, 0.35);
  const volatility = Math.max(0, toNumber(features.volatility_daily_std, 0));

  const blendedDaily = (0.65 * emaShort) + (0.35 * emaLong);
  const trendAdjusted = blendedDaily * (1 + trendPct);
  const expectedDemand = Math.max(0, trendAdjusted * seasonality * horizonDays);

  const demandGap = expectedDemand - inventory;
  const propensity = clamp(0.5 + (demandGap / Math.max(1, expectedDemand + inventory)), 0, 1);

  const volatilityRatio = blendedDaily > 0 ? clamp(volatility / blendedDaily, 0, 2) : 1;
  const confidence = clamp(
    0.3 + (0.35 * (1 - (volatilityRatio / 2))) + (0.2 * Math.abs(trendPct)),
    0.05,
    0.95
  );

  return {
    expected_demand: roundSix(expectedDemand),
    propensity: roundSix(propensity),
    confidence: roundSix(confidence),
    trend: trendPct >= 0.08 ? 'UP' : trendPct <= -0.08 ? 'DOWN' : 'NEUTRAL',
  };
};

const buildMarkovSignal = ({ features = {}, horizonToken = '1W' } = {}) => {
  const horizonDays = HORIZON_DAYS[horizonToken] || 7;
  const seasonality = clamp(toNumber(features?.seasonality_factors?.[horizonToken], 1), 0.6, 1.4);
  const dailyVelocity = Math.max(0, toNumber(features.base_daily_velocity, 0));
  const inventory = Math.max(0, toNumber(features.current_inventory, 0));

  const distribution = features?.markov?.next_state_distribution || {
    HIGH_DEMAND: 0,
    LOW_DEMAND: 0,
    STABLE: 1,
  };

  const high = clamp(toNumber(distribution.HIGH_DEMAND, 0), 0, 1);
  const low = clamp(toNumber(distribution.LOW_DEMAND, 0), 0, 1);
  const stable = clamp(toNumber(distribution.STABLE, 0), 0, 1);

  const multiplier = (1.3 * high) + (1 * stable) + (0.72 * low);
  const expectedDemand = Math.max(0, dailyVelocity * seasonality * horizonDays * multiplier);

  const demandGap = expectedDemand - inventory;
  const propensity = clamp(0.5 + (demandGap / Math.max(1, expectedDemand + inventory)), 0, 1);

  const uncertainty = clamp(toNumber(features?.markov?.uncertainty, 1), 0, 1);
  const confidence = clamp((0.7 * (1 - uncertainty)) + (0.2 * high) + 0.1, 0.05, 0.95);

  return {
    expected_demand: roundSix(expectedDemand),
    propensity: roundSix(propensity),
    confidence: roundSix(confidence),
    uncertainty: roundSix(uncertainty),
    current_state: String(features?.markov?.current_state || 'STABLE').trim().toUpperCase(),
    next_state_distribution: {
      HIGH_DEMAND: roundSix(high),
      LOW_DEMAND: roundSix(low),
      STABLE: roundSix(stable),
    },
  };
};

const deriveDecision = ({
  inventory = 0,
  reorderLevel = 0,
  confidenceBand = {},
  thresholdSignal = {},
  ensemblePropensity = 0,
} = {}) => {
  const safeInventory = Math.max(0, toNumber(inventory, 0));
  const safeReorderLevel = Math.max(0, toNumber(reorderLevel, 0));

  const targetStock = Math.max(
    toNumber(confidenceBand.upper, 0) + (safeReorderLevel * 0.5),
    toNumber(thresholdSignal.target_stock, 0)
  );

  const rawBuyQuantity = Math.max(0, Math.ceil(targetStock - safeInventory));
  const confidence = clamp(toNumber(confidenceBand.confidence, 0), 0, 1);
  const propensity = clamp(toNumber(ensemblePropensity, 0), 0, 1);

  if (rawBuyQuantity > 0 && (confidence >= 0.68 || propensity >= 0.6)) {
    return {
      decision: 'BUY_NOW',
      buy_quantity: rawBuyQuantity,
      target_stock: roundSix(targetStock),
    };
  }

  const upper = toNumber(confidenceBand.upper, 0);
  if (upper > (safeInventory * 0.8) || propensity >= 0.52) {
    return {
      decision: 'WATCH',
      buy_quantity: 0,
      target_stock: roundSix(targetStock),
    };
  }

  return {
    decision: 'HOLD',
    buy_quantity: 0,
    target_stock: roundSix(targetStock),
  };
};

const resolveUrgency = ({ decision = 'HOLD', confidence = 0 }) => {
  const token = String(decision || '').trim().toUpperCase();
  const score = clamp(toNumber(confidence, 0), 0, 1);

  if (token === 'BUY_NOW') {
    return score >= 0.75 ? 'high' : 'medium';
  }
  if (token === 'WATCH') {
    return 'medium';
  }
  return 'low';
};

const computeSuggestionForFeatureRow = ({
  row = {},
  horizonToken = '7D',
  config = DEFAULT_ENGINE_CONFIG,
  holidayContext = null,
} = {}) => {
  const features = row.features || {};
  const weights = resolveModelWeights(features);

  const thresholdSignal = buildThresholdSignal({ features, horizonToken, config });
  const emaSignal = buildEmaSignal({ features, horizonToken });
  const markovSignal = buildMarkovSignal({ features, horizonToken });

  const agreement = computeModelAgreement({
    emaScore: emaSignal.propensity,
    thresholdScore: thresholdSignal.propensity,
    markovScore: markovSignal.propensity,
  });

  let expectedDemand =
    (weights.threshold * thresholdSignal.expected_demand)
    + (weights.ema * emaSignal.expected_demand)
    + (weights.markov * markovSignal.expected_demand);

  let ensemblePropensity =
    (weights.threshold * thresholdSignal.propensity)
    + (weights.ema * emaSignal.propensity)
    + (weights.markov * markovSignal.propensity);

  const holidayMultiplier = clamp(
    toNumber(holidayContext?.multiplier, 1),
    0.85,
    1.6
  );
  const holidayApplied = Boolean(holidayContext?.applied) && holidayMultiplier !== 1;
  if (holidayApplied) {
    expectedDemand *= holidayMultiplier;
    ensemblePropensity = clamp(
      ensemblePropensity + ((holidayMultiplier - 1) * 0.25),
      0,
      1
    );
  }

  const confidenceBand = computeConfidenceBand({
    expectedDemand,
    series: row.series,
    horizonDays: HORIZON_DAYS[horizonToken] || 7,
    sampleDays: features.sample_days,
    stateUncertainty: markovSignal.uncertainty,
    modelAgreement: agreement,
    trendVolatility: features.volatility_daily_std,
  });

  const adjustedConfidenceBand = holidayApplied
    ? {
      ...confidenceBand,
      expected: roundSix(toNumber(confidenceBand.expected, 0) * holidayMultiplier),
      lower: roundSix(toNumber(confidenceBand.lower, 0) * holidayMultiplier),
      upper: roundSix(toNumber(confidenceBand.upper, 0) * holidayMultiplier),
      confidence: roundSix(
        clamp(
          toNumber(confidenceBand.confidence, 0) + ((holidayMultiplier - 1) * 0.08),
          0.05,
          0.99
        )
      ),
    }
    : confidenceBand;

  const decisionPayload = deriveDecision({
    inventory: features.current_inventory,
    reorderLevel: features.reorder_level,
    confidenceBand: adjustedConfidenceBand,
    thresholdSignal,
    ensemblePropensity,
  });

  const weightedConfidence =
    (weights.threshold * thresholdSignal.confidence)
    + (weights.ema * emaSignal.confidence)
    + (weights.markov * markovSignal.confidence);

  const finalConfidence = clamp(
    (0.65 * adjustedConfidenceBand.confidence) + (0.35 * weightedConfidence),
    0.05,
    0.99
  );

  const adjustedBuyQuantity = decisionPayload.decision === 'BUY_NOW'
    ? Math.max(
      0,
      Math.ceil(toNumber(decisionPayload.buy_quantity, 0) * (holidayApplied ? holidayMultiplier : 1))
    )
    : 0;

  const modelBreakdown = {
    ema: roundSix(weights.ema),
    threshold: roundSix(weights.threshold),
    markov: roundSix(weights.markov),
  };

  const explanation = buildSuggestionExplanation({
    horizon: horizonToken,
    decision: decisionPayload.decision,
    buyQuantity: adjustedBuyQuantity,
    confidenceBand: adjustedConfidenceBand,
    features,
    modelBreakdown,
  });

  const holidaySummary = holidayApplied
    ? ` Holiday-adjusted demand (+${Math.round((holidayMultiplier - 1) * 100)}%) applied from manual holiday dates.`
    : '';

  return {
    symbol: row.symbol,
    product_id: row.product_id,
    product_name: row.product_name,
    category: 'General',
    horizon: horizonToken,
    decision: decisionPayload.decision,
    buy_quantity: adjustedBuyQuantity,
    confidence: roundSix(finalConfidence),
    model_breakdown: modelBreakdown,
    model_votes: modelBreakdown,
    weights: modelBreakdown,
    confidence_band: {
      expected: adjustedConfidenceBand.expected,
      lower: adjustedConfidenceBand.lower,
      upper: adjustedConfidenceBand.upper,
      confidence: adjustedConfidenceBand.confidence,
      width: adjustedConfidenceBand.band_width,
    },
    explanation,
    rationale: `${explanation.summary}${holidaySummary}`.trim(),
    urgency: resolveUrgency({
      decision: decisionPayload.decision,
      confidence: finalConfidence,
    }),
    diagnostics: {
      target_stock: decisionPayload.target_stock,
      model_signals: {
        threshold: thresholdSignal,
        ema: emaSignal,
        markov: markovSignal,
      },
      model_agreement: agreement,
      inventory_snapshot: {
        current_inventory: roundSix(toNumber(features.current_inventory, 0)),
        reorder_level: roundSix(toNumber(features.reorder_level, 0)),
        inventory_coverage_days: features.inventory_coverage_days,
      },
      holiday_adjustment: {
        applied: holidayApplied,
        multiplier: roundSix(holidayMultiplier),
        matched_holidays: Array.isArray(holidayContext?.matched_holidays)
          ? holidayContext.matched_holidays
          : [],
      },
    },
  };
};

const sortSuggestions = (rows = []) => {
  const priority = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...rows].sort((left, right) => {
    const urgencyDelta = (priority[right.urgency] || 0) - (priority[left.urgency] || 0);
    if (urgencyDelta !== 0) {
      return urgencyDelta;
    }

    const confidenceDelta = toNumber(right.confidence, 0) - toNumber(left.confidence, 0);
    if (Math.abs(confidenceDelta) > 0.00001) {
      return confidenceDelta;
    }

    const symbolA = String(left.symbol || '');
    const symbolB = String(right.symbol || '');
    return symbolA.localeCompare(symbolB);
  });
};

const safeDivide = (numerator, denominator) => {
  const top = toNumber(numerator, 0);
  const bottom = toNumber(denominator, 0);
  if (bottom <= 0) {
    return 0;
  }
  return top / bottom;
};

const runSalesWalkForwardBacktest = ({
  featureRows = [],
  horizons = ['7D', '1D'],
  config = DEFAULT_ENGINE_CONFIG,
} = {}) => {
  const safeRows = Array.isArray(featureRows) ? featureRows : [];
  const safeConfig = normalizeEngineConfig(config);
  const horizonTokens = normalizeHorizons(horizons);

  const byHorizon = {};

  for (const horizonToken of horizonTokens) {
    const horizonDays = HORIZON_DAYS[horizonToken] || 7;

    let truePositiveModel = 0;
    let predictedPositiveModel = 0;
    let truePositiveBaseline = 0;
    let predictedPositiveBaseline = 0;

    let modelStockoutUnits = 0;
    let baselineStockoutUnits = 0;
    let modelOverstockUnits = 0;
    let baselineOverstockUnits = 0;

    let totalWindows = 0;
    let decisionFlips = 0;
    let decisionTransitions = 0;

    const confidenceSeries = [];
    const bandWidthSeries = [];

    for (const row of safeRows) {
      const fullSeries = Array.isArray(row.series) ? row.series : [];
      if (fullSeries.length < (safeConfig.minTrainDays + horizonDays)) {
        continue;
      }

      let previousDecision = null;
      let windowsForRow = 0;

      for (
        let splitIndex = safeConfig.minTrainDays;
        splitIndex + horizonDays <= fullSeries.length && windowsForRow < safeConfig.maxBacktestWindows;
        splitIndex += safeConfig.backtestStepDays
      ) {
        const trainSeries = fullSeries.slice(0, splitIndex);
        const futureSeries = fullSeries.slice(splitIndex, splitIndex + horizonDays);

        const trainUnits = trainSeries.map((point) => Math.max(0, toNumber(point?.units, 0)));
        const trainMean = mean(trainUnits);

        const inventoryProxy = Math.max(
          1,
          Math.round(toNumber(row.reorder_level, 0) + (trainMean * safeConfig.leadTimeDays))
        );

        const trainFeatures = deriveSalesFeaturesFromSeries({
          series: trainSeries,
          inventory: inventoryProxy,
          reorderLevel: row.reorder_level,
          leadTimeDays: safeConfig.leadTimeDays,
          horizons: [horizonToken],
          anchorDate: trainSeries[trainSeries.length - 1]?.date,
        });

        const prediction = computeSuggestionForFeatureRow({
          row: {
            ...row,
            series: trainSeries,
            features: trainFeatures,
          },
          horizonToken,
          config: safeConfig,
        });

        const futureDemand = futureSeries.reduce((sum, point) => sum + Math.max(0, toNumber(point?.units, 0)), 0);

        const baselineTargetStock = Math.max(
          toNumber(row.reorder_level, 0),
          (trainMean * (safeConfig.leadTimeDays + safeConfig.reviewDays)) + toNumber(row.reorder_level, 0)
        );

        const modelTargetStock = Math.max(0, toNumber(prediction?.diagnostics?.target_stock, 0));

        const truthReorder = futureDemand > inventoryProxy;
        const modelPredReorder = String(prediction.decision || '').trim().toUpperCase() === 'BUY_NOW';
        const baselinePredReorder = baselineTargetStock > inventoryProxy;

        if (modelPredReorder) {
          predictedPositiveModel += 1;
          if (truthReorder) {
            truePositiveModel += 1;
          }
        }

        if (baselinePredReorder) {
          predictedPositiveBaseline += 1;
          if (truthReorder) {
            truePositiveBaseline += 1;
          }
        }

        modelStockoutUnits += Math.max(0, futureDemand - modelTargetStock);
        baselineStockoutUnits += Math.max(0, futureDemand - baselineTargetStock);

        modelOverstockUnits += Math.max(0, modelTargetStock - futureDemand);
        baselineOverstockUnits += Math.max(0, baselineTargetStock - futureDemand);

        const currentDecision = String(prediction.decision || '').trim().toUpperCase() || 'HOLD';
        if (previousDecision !== null) {
          decisionTransitions += 1;
          if (currentDecision !== previousDecision) {
            decisionFlips += 1;
          }
        }

        previousDecision = currentDecision;
        confidenceSeries.push(toNumber(prediction.confidence, 0));
        bandWidthSeries.push(toNumber(prediction?.confidence_band?.width, 0));

        totalWindows += 1;
        windowsForRow += 1;
      }
    }

    const modelPrecision = safeDivide(truePositiveModel, predictedPositiveModel);
    const baselinePrecision = safeDivide(truePositiveBaseline, predictedPositiveBaseline);

    const stockoutReduction = baselineStockoutUnits > 0
      ? (baselineStockoutUnits - modelStockoutUnits) / baselineStockoutUnits
      : 0;

    const overstockReduction = baselineOverstockUnits > 0
      ? (baselineOverstockUnits - modelOverstockUnits) / baselineOverstockUnits
      : 0;

    const confidenceMean = mean(confidenceSeries);
    const confidenceStd = stdDev(confidenceSeries, confidenceMean);
    const bandWidthMean = mean(bandWidthSeries);
    const bandWidthStd = stdDev(bandWidthSeries, bandWidthMean);

    byHorizon[horizonToken] = {
      window_count: totalWindows,
      precision: {
        model: roundSix(modelPrecision),
        baseline: roundSix(baselinePrecision),
        lift: roundSix(modelPrecision - baselinePrecision),
      },
      inventory_impact: {
        stockout_reduction_pct: roundSix(clamp(stockoutReduction, -1, 1)),
        overstock_reduction_pct: roundSix(clamp(overstockReduction, -1, 1)),
      },
      stability_inputs: {
        decision_flip_rate: roundSix(safeDivide(decisionFlips, decisionTransitions)),
        confidence_std: roundSix(confidenceStd),
        band_width_cv: roundSix(safeDivide(bandWidthStd, bandWidthMean)),
      },
    };
  }

  const horizonRows = Object.values(byHorizon);

  const overall = {
    window_count: horizonRows.reduce((sum, row) => sum + toNumber(row.window_count, 0), 0),
    precision_model: roundSix(mean(horizonRows.map((row) => toNumber(row?.precision?.model, 0)))),
    precision_baseline: roundSix(mean(horizonRows.map((row) => toNumber(row?.precision?.baseline, 0)))),
    precision_lift: roundSix(mean(horizonRows.map((row) => toNumber(row?.precision?.lift, 0)))),
    stockout_reduction_pct: roundSix(mean(horizonRows.map((row) => toNumber(row?.inventory_impact?.stockout_reduction_pct, 0)))),
    overstock_reduction_pct: roundSix(mean(horizonRows.map((row) => toNumber(row?.inventory_impact?.overstock_reduction_pct, 0)))),
  };

  return {
    by_horizon: byHorizon,
    overall,
  };
};

const evaluateSuggestionStability = ({ backtest = null } = {}) => {
  const horizonEntries = Object.values(backtest?.by_horizon || {});

  if (horizonEntries.length === 0) {
    return {
      status: 'insufficient_data',
      score: 0,
      inputs: {
        decision_flip_rate: 1,
        confidence_std: 1,
        band_width_cv: 1,
      },
    };
  }

  const flipRate = mean(horizonEntries.map((row) => toNumber(row?.stability_inputs?.decision_flip_rate, 1)));
  const confidenceStd = mean(horizonEntries.map((row) => toNumber(row?.stability_inputs?.confidence_std, 1)));
  const bandWidthCv = mean(horizonEntries.map((row) => toNumber(row?.stability_inputs?.band_width_cv, 1)));

  const score = 1 - clamp(
    (0.55 * flipRate)
      + (0.25 * confidenceStd)
      + (0.2 * bandWidthCv),
    0,
    1
  );

  return {
    status: score >= 0.6 ? 'stable' : 'unstable',
    score: roundSix(score),
    inputs: {
      decision_flip_rate: roundSix(flipRate),
      confidence_std: roundSix(confidenceStd),
      band_width_cv: roundSix(bandWidthCv),
    },
  };
};

const generateTrustworthySuggestions = async ({
  userId,
  symbol = '',
  asOf = null,
  horizons = ['7D', '1D'],
  config = {},
  includeBacktesting = true,
  includeStability = true,
  manualHolidays = [],
  holidayImpactScale = 1,
} = {}) => {
  const safeConfig = normalizeEngineConfig(config);
  const horizonTokens = normalizeHorizons(horizons);

  const featureSet = await buildSalesFeatureSetForUser({
    userId,
    symbol,
    asOf,
    lookbackDays: safeConfig.lookbackDays,
    leadTimeDays: safeConfig.leadTimeDays,
    horizons: horizonTokens,
  });

  const suggestions = [];
  const holidayContextByHorizon = {};
  for (const horizonToken of horizonTokens) {
    holidayContextByHorizon[horizonToken] = resolveHolidayContextForHorizon({
      horizonToken,
      asOf: asOf || featureSet?.metadata?.as_of,
      manualHolidays,
      holidayImpactScale,
    });
  }

  for (const row of featureSet.rows) {
    for (const horizonToken of horizonTokens) {
      suggestions.push(
        computeSuggestionForFeatureRow({
          row,
          horizonToken,
          config: safeConfig,
          holidayContext: holidayContextByHorizon[horizonToken] || null,
        })
      );
    }
  }

  const sortedSuggestions = sortSuggestions(suggestions);

  const backtest = includeBacktesting
    ? runSalesWalkForwardBacktest({
      featureRows: featureSet.rows,
      horizons: horizonTokens,
      config: safeConfig,
    })
    : null;

  const stability = includeStability
    ? evaluateSuggestionStability({ backtest })
    : null;

  return {
    metadata: {
      ...featureSet.metadata,
      engine: 'trustworthy_sales_inventory_engine_v1',
      horizons: horizonTokens,
      demand_signal_policy: 'sales_header_plus_sales_items_only',
      holiday_impact_scale: roundSix(clamp(toNumber(holidayImpactScale, 1), 0, 2)),
    },
    suggestions: sortedSuggestions,
    backtesting: backtest,
    stability,
  };
};

module.exports = {
  normalizeEngineConfig,
  computeSuggestionForFeatureRow,
  runSalesWalkForwardBacktest,
  evaluateSuggestionStability,
  generateTrustworthySuggestions,
};
