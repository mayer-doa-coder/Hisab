const MarketDataBar = require('../models/MarketDataBar');
const { DATA_CONTRACT_VERSION } = require('../config/dataContract');
const { buildModel, predict } = require('../services/markovService');
const { buildLagSafeFeatureSet } = require('../features/featureBuilder');
const {
  runLeakageChecks,
  assertFeatureAlignment,
} = require('./leakageChecks');
const { computeKPIs } = require('./metrics');
const { computeBusinessKPIs } = require('./businessMetrics');
const { compareModels } = require('./baselineComparison');
const { makeDecision } = require('../models/reorder/decisionEngine');
const { combineModels } = require('../ensemble/ensembleEngine');

const HIGH_DEMAND_STATES = new Set([
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RECOVERY_PHASE',
]);

const LOW_DEMAND_STATES = new Set([
  'DOWNTREND',
  'LIQUIDITY_STRESS',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundSix = (value) => Number(toNumber(value, 0).toFixed(6));

const toIsoDateOrNull = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const normalizeState = (value) => String(value || '').trim().toUpperCase() || 'SIDEWAYS_STABLE';

const mapDocToObservation = (doc) => ({
  symbol: String(doc.symbol || '').trim().toUpperCase(),
  timestamp: new Date(doc.timestamp).toISOString(),
  open: Number(doc.open),
  high: Number(doc.high),
  low: Number(doc.low),
  close: Number(doc.close),
  volume: Number(doc.volume),
  spread: Number(doc.spread),
  current_state: normalizeState(doc.currentState),
  markov_features: {
    trend_pct: Number(doc?.markovFeatures?.trendPct || 0),
    momentum_pct: Number(doc?.markovFeatures?.momentumPct || 0),
    volatility_ratio: Number(doc?.markovFeatures?.volatilityRatio || 0),
    liquidity_stress_score: Number(doc?.markovFeatures?.liquidityStressScore || 0),
    queue_pressure: Number(doc?.markovFeatures?.queuePressure || 0),
    spread_to_close_ratio: Number(doc?.markovFeatures?.spreadToCloseRatio || 0),
    volume_to_floor_ratio: Number(doc?.markovFeatures?.volumeToFloorRatio || 0),
  },
  order_flow: doc.orderFlow
    ? {
      buy_volume: Number(doc.orderFlow.buyVolume || 0),
      sell_volume: Number(doc.orderFlow.sellVolume || 0),
      imbalance: doc.orderFlow.imbalance,
    }
    : null,
});

const average = (values = []) => {
  const clean = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (clean.length === 0) {
    return null;
  }

  return Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(6));
};

const buildRollingWindows = ({
  rows = [],
  minTrainSize = 120,
  testSize = 30,
  stepSize = 30,
  maxWindows = null,
} = {}) => {
  const total = rows.length;
  const safeMinTrain = Math.max(20, Math.trunc(toNumber(minTrainSize, 120)));
  const safeTest = Math.max(5, Math.trunc(toNumber(testSize, 30)));
  const safeStep = Math.max(1, Math.trunc(toNumber(stepSize, safeTest)));

  const windows = [];
  let trainEnd = safeMinTrain;

  while (trainEnd + safeTest <= total) {
    windows.push({
      train_start: 0,
      train_end: trainEnd,
      test_start: trainEnd,
      test_end: trainEnd + safeTest,
    });

    trainEnd += safeStep;

    if (maxWindows !== null && windows.length >= Math.max(1, Math.trunc(toNumber(maxWindows, 1)))) {
      break;
    }
  }

  return windows;
};

const normalizeMarkovDemandDistribution = (distribution = {}) => {
  let high = 0;
  let low = 0;
  let stable = 0;

  for (const [stateRaw, probabilityRaw] of Object.entries(distribution || {})) {
    const state = normalizeState(stateRaw);
    const probability = Math.max(0, toNumber(probabilityRaw, 0));

    if (HIGH_DEMAND_STATES.has(state)) {
      high += probability;
      continue;
    }

    if (LOW_DEMAND_STATES.has(state)) {
      low += probability;
      continue;
    }

    stable += probability;
  }

  const sum = high + low + stable;
  if (sum <= 0) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  return {
    HIGH_DEMAND: roundSix(high / sum),
    LOW_DEMAND: roundSix(low / sum),
    STABLE: roundSix(stable / sum),
  };
};

const computeDistributionEntropy = (distribution = {}) => {
  const values = [
    toNumber(distribution.HIGH_DEMAND, 0),
    toNumber(distribution.LOW_DEMAND, 0),
    toNumber(distribution.STABLE, 0),
  ]
    .map((value) => Math.max(0, value))
    .filter((value) => value > 0);

  if (values.length === 0) {
    return 1;
  }

  const entropy = values.reduce((sum, value) => sum - (value * Math.log2(value)), 0);
  return clamp(entropy / Math.log2(3), 0, 1);
};

const computeEmaSignalFromRows = (rows = []) => {
  const closes = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row?.close))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (closes.length < 2) {
    return {
      ema_score: 0.5,
      trend: 'NEUTRAL',
      strength: 0,
    };
  }

  const runEma = (period) => {
    const alpha = 2 / (period + 1);
    let ema = closes[0];

    for (let index = 1; index < closes.length; index += 1) {
      ema = (alpha * closes[index]) + ((1 - alpha) * ema);
    }

    return ema;
  };

  const fast = runEma(8);
  const slow = runEma(21);
  const normalizedDiff = (fast - slow) / Math.max(0.000001, Math.abs(slow));

  const trend = normalizedDiff > 0.002
    ? 'UP'
    : normalizedDiff < -0.002
      ? 'DOWN'
      : 'NEUTRAL';

  return {
    ema_score: roundSix(clamp(0.5 + (normalizedDiff * 8), 0, 1)),
    trend,
    strength: roundSix(clamp(Math.abs(normalizedDiff) * 30, 0, 1)),
  };
};

const buildThresholdInputs = ({ sharedFeatures = {}, historyLength = 0 } = {}) => {
  const salesVelocity = Math.max(0.001, toNumber(sharedFeatures?.sales_velocity, 0.1));
  const stockCoverageDays = Math.max(0, toNumber(sharedFeatures?.stock_position, 7));
  const stockUnits = Math.max(0, stockCoverageDays * salesVelocity);
  const leadTime = Math.max(1, toNumber(sharedFeatures?.lead_time, 3));
  const volatility = Math.max(0, toNumber(sharedFeatures?.volatility, 0));

  const thresholdFeatures = {
    sales_velocity: salesVelocity,
    stock_position: stockUnits,
    lead_time: leadTime,
    volatility,
    sample_days: Math.max(0, historyLength),
  };

  const thresholdDecision = makeDecision(thresholdFeatures, {
    z: 1.65,
    defaultSalesVelocity: 0.1,
    sparseDataMinDays: 14,
    overstockMultiplier: 1.5,
    sampleDays: thresholdFeatures.sample_days,
  });

  return {
    thresholdFeatures,
    thresholdDecision,
  };
};

const buildSuggestedOrderQuantity = ({ thresholdDecision, thresholdFeatures }) => {
  if (!thresholdDecision || thresholdDecision.decision !== 'REORDER') {
    return 0;
  }

  const reorderPoint = Math.max(1, toNumber(thresholdDecision?.metrics?.reorder_point, 1));
  const stockUnits = Math.max(0, toNumber(thresholdFeatures?.stock_position, 0));
  const shortfall = Math.max(1, Math.ceil(reorderPoint - stockUnits));

  return shortfall;
};

const deriveActualOutcome = ({ previousRow, currentRow } = {}) => {
  const previousClose = Math.max(0.000001, toNumber(previousRow?.close, 0.000001));
  const currentClose = Math.max(0.000001, toNumber(currentRow?.close, previousClose));
  const realizedReturn = (currentClose - previousClose) / previousClose;
  const actualState = normalizeState(currentRow?.current_state);

  const actualReorderNeeded = HIGH_DEMAND_STATES.has(actualState)
    || realizedReturn > 0.003;

  return {
    actual_state: actualState,
    realized_return: roundSix(realizedReturn),
    actual_reorder_needed: actualReorderNeeded,
  };
};

const buildEnsembleDecision = ({
  symbol,
  sharedFeatures,
  historyLength,
  thresholdDecision,
  thresholdFeatures,
  markovPrediction,
  emaSignal,
} = {}) => {
  const markovDistribution = normalizeMarkovDemandDistribution(
    markovPrediction?.next_state_distribution || {}
  );

  const entropy = computeDistributionEntropy(markovDistribution);
  const markovConfidence = clamp(
    Math.max(
      toNumber(markovDistribution.HIGH_DEMAND, 0),
      toNumber(markovDistribution.LOW_DEMAND, 0),
      toNumber(markovDistribution.STABLE, 0)
    ),
    0,
    1
  );

  const uncertainty = roundSix(entropy);
  const suggestedOrderQuantity = buildSuggestedOrderQuantity({
    thresholdDecision,
    thresholdFeatures,
  });

  const ensemble = combineModels({
    symbol,
    mode: 'REORDER_NO_REORDER',
    suggestedOrderQuantity,
    ema: {
      ema_score: toNumber(emaSignal?.ema_score, 0.5),
      trend: String(emaSignal?.trend || 'NEUTRAL').trim().toUpperCase() || 'NEUTRAL',
    },
    threshold: {
      decision: String(thresholdDecision?.decision || 'NO_REORDER').trim().toUpperCase(),
      confidence: toNumber(thresholdDecision?.confidence, 0.5),
    },
    markov: {
      confidence: markovConfidence,
      uncertainty,
      next_state_distribution: markovDistribution,
    },
    context: {
      data_sparse: historyLength < 20,
      strong_trend: toNumber(emaSignal?.strength, 0) >= 0.7,
      high_volatility: toNumber(sharedFeatures?.volatility, 0) > (toNumber(sharedFeatures?.sales_velocity, 1) * 0.7),
    },
  });

  return {
    ...ensemble,
    decision: String(ensemble?.decision || 'NO_REORDER').trim().toUpperCase() || 'NO_REORDER',
    confidence: roundSix(clamp(toNumber(ensemble?.confidence, 0.05), 0.05, 0.99)),
    suggested_order_quantity: Math.max(
      0,
      Math.trunc(toNumber(ensemble?.buy_quantity, suggestedOrderQuantity))
    ),
    diagnostics: {
      ...(ensemble?.diagnostics || {}),
      markov_confidence: roundSix(markovConfidence),
      markov_uncertainty: uncertainty,
    },
  };
};

const evaluateWindow = ({
  windowIndex,
  symbol,
  trainRows,
  testRows,
  precisionTarget = 0.5,
  markovConfigOverride = null,
} = {}) => {
  const antiLeakage = runLeakageChecks({ trainRows, testRows });
  const model = buildModel({
    rows: trainRows,
    config: markovConfigOverride,
  });

  const ensembleDecisionRows = [];
  const baselineDecisionRows = [];
  const ensembleActionRows = [];
  const baselineActionRows = [];
  const actualRowsForBusiness = [];

  let featureAlignmentChecks = 0;
  const velocitySeries = [];
  const leadTimeSeries = [];
  const inventorySeedSeries = [];

  for (let index = 0; index < testRows.length; index += 1) {
    const currentRow = testRows[index];
    const previousRow = index === 0
      ? trainRows[trainRows.length - 1]
      : testRows[index - 1];

    if (!previousRow) {
      continue;
    }

    assertFeatureAlignment({
      featureTimestamp: previousRow.timestamp,
      labelTimestamp: currentRow.timestamp,
      context: `window_${windowIndex}_step_${index}`,
    });
    featureAlignmentChecks += 1;

    const historicalRows = [...trainRows, ...testRows.slice(0, index)];
    const featureSet = buildLagSafeFeatureSet({
      rows: historicalRows,
      anchorTimestamp: previousRow.timestamp,
      windows: [7, 30],
    });

    const sharedFeatures = featureSet?.selected_shared_features || {};
    const queueFeatures = featureSet?.selected_features || {};

    const { thresholdFeatures, thresholdDecision } = buildThresholdInputs({
      sharedFeatures,
      historyLength: historicalRows.length,
    });

    const currentState = normalizeState(previousRow?.current_state);
    const markovPrediction = predict({
      model,
      currentState,
      regime: null,
      steps: 1,
      queueFeatures,
      symbol,
      asOf: previousRow.timestamp,
    });

    const emaSignal = computeEmaSignalFromRows(historicalRows);

    const ensembleDecision = buildEnsembleDecision({
      symbol,
      sharedFeatures,
      historyLength: historicalRows.length,
      thresholdDecision,
      thresholdFeatures,
      markovPrediction,
      emaSignal,
    });

    const actualOutcome = deriveActualOutcome({
      previousRow,
      currentRow,
    });

    const baselineQty = buildSuggestedOrderQuantity({
      thresholdDecision,
      thresholdFeatures,
    });

    ensembleDecisionRows.push({
      predicted_positive: ensembleDecision.decision === 'REORDER',
      confidence: ensembleDecision.confidence,
      actual_positive: actualOutcome.actual_reorder_needed ? 1 : 0,
    });

    baselineDecisionRows.push({
      predicted_positive: thresholdDecision.decision === 'REORDER',
      confidence: toNumber(thresholdDecision.confidence, 0.5),
      actual_positive: actualOutcome.actual_reorder_needed ? 1 : 0,
    });

    ensembleActionRows.push({
      decision: ensembleDecision.decision,
      suggested_order_quantity: Math.max(0, Math.trunc(toNumber(ensembleDecision.suggested_order_quantity, baselineQty))),
    });

    baselineActionRows.push({
      decision: thresholdDecision.decision,
      suggested_order_quantity: Math.max(0, Math.trunc(toNumber(baselineQty, 0))),
    });

    actualRowsForBusiness.push({
      current_state: actualOutcome.actual_state,
    });

    velocitySeries.push(Math.max(0.1, toNumber(sharedFeatures?.sales_velocity, 0.1)));
    leadTimeSeries.push(Math.max(1, toNumber(sharedFeatures?.lead_time, 3)));
    inventorySeedSeries.push(Math.max(10, toNumber(thresholdFeatures?.stock_position, 0)));
  }

  const baseDemand = average(velocitySeries) ?? 10;
  const leadTimeSteps = Math.max(1, Math.round(average(leadTimeSeries) ?? 2));
  const initialInventory = Math.max(20, average(inventorySeedSeries) ?? 60);

  const ensembleBusiness = computeBusinessKPIs({
    decisionRows: ensembleActionRows,
    actualRows: actualRowsForBusiness,
    initialInventory,
    baseDemand,
    leadTimeSteps,
  });

  const baselineBusiness = computeBusinessKPIs({
    decisionRows: baselineActionRows,
    actualRows: actualRowsForBusiness,
    initialInventory,
    baseDemand,
    leadTimeSteps,
  });

  const ensembleKpi = computeKPIs({
    decisionRows: ensembleDecisionRows,
    precisionThreshold: precisionTarget,
    business: {
      stockout_event_rate: ensembleBusiness.stockout_event_rate,
      excess_inventory_avg: ensembleBusiness.excess_inventory_avg,
      inventory_turnover: ensembleBusiness.inventory_turnover,
    },
  });

  const baselineKpi = computeKPIs({
    decisionRows: baselineDecisionRows,
    precisionThreshold: precisionTarget,
    business: {
      stockout_event_rate: baselineBusiness.stockout_event_rate,
      excess_inventory_avg: baselineBusiness.excess_inventory_avg,
      inventory_turnover: baselineBusiness.inventory_turnover,
    },
  });

  const improvement = compareModels({
    ensemble: {
      precision: ensembleKpi.precision,
      calibration: ensembleKpi.calibration_score,
      stockout_rate: ensembleBusiness.stockout_event_rate,
      excess_inventory: ensembleBusiness.excess_inventory_avg,
      inventory_turnover: ensembleBusiness.inventory_turnover,
    },
    baseline: {
      precision: baselineKpi.precision,
      calibration: baselineKpi.calibration_score,
      stockout_rate: baselineBusiness.stockout_event_rate,
      excess_inventory: baselineBusiness.excess_inventory_avg,
      inventory_turnover: baselineBusiness.inventory_turnover,
    },
  });

  return {
    window_index: windowIndex,
    symbol,
    train_period: {
      start: trainRows[0]?.timestamp || null,
      end: trainRows[trainRows.length - 1]?.timestamp || null,
      rows: trainRows.length,
    },
    test_period: {
      start: testRows[0]?.timestamp || null,
      end: testRows[testRows.length - 1]?.timestamp || null,
      rows: testRows.length,
    },
    anti_leakage: {
      ...antiLeakage,
      feature_alignment_checks: featureAlignmentChecks,
      expected_feature_alignment_checks: testRows.length,
      feature_alignment_passed: featureAlignmentChecks === testRows.length,
    },
    ensemble: {
      kpi: ensembleKpi,
      business: ensembleBusiness,
    },
    baseline: {
      kpi: baselineKpi,
      business: baselineBusiness,
    },
    improvement,
    traces: {
      ensemble_actions: ensembleActionRows.slice(0, 10),
      baseline_actions: baselineActionRows.slice(0, 10),
    },
  };
};

const summarizeWindows = (windows = [], modelKey = 'ensemble') => {
  const summary = {
    precision: average(windows.map((window) => window?.[modelKey]?.kpi?.precision)),
    calibration: average(windows.map((window) => window?.[modelKey]?.kpi?.calibration_score)),
    stockout_rate: average(windows.map((window) => window?.[modelKey]?.business?.stockout_event_rate)),
    excess_inventory: average(windows.map((window) => window?.[modelKey]?.business?.excess_inventory_avg)),
    inventory_turnover: average(windows.map((window) => window?.[modelKey]?.business?.inventory_turnover)),
  };

  return {
    kpi: {
      precision: summary.precision,
      calibration_score: summary.calibration,
      stockout_rate: summary.stockout_rate,
      excess_inventory: summary.excess_inventory,
      inventory_turnover: summary.inventory_turnover,
    },
    business: {
      stockout_event_rate: summary.stockout_rate,
      excess_inventory_avg: summary.excess_inventory,
      inventory_turnover: summary.inventory_turnover,
    },
    summary,
  };
};

const summarizeLeakage = (windows = []) => {
  const safeWindows = Array.isArray(windows) ? windows : [];
  const passedWindows = safeWindows.filter((window) => window?.anti_leakage?.passed === true).length;

  const featureChecks = safeWindows.reduce((sum, window) => {
    return sum + Math.max(0, Math.trunc(toNumber(window?.anti_leakage?.feature_alignment_checks, 0)));
  }, 0);

  const expectedChecks = safeWindows.reduce((sum, window) => {
    return sum + Math.max(0, Math.trunc(toNumber(window?.anti_leakage?.expected_feature_alignment_checks, 0)));
  }, 0);

  return {
    windows_checked: safeWindows.length,
    windows_passed: passedWindows,
    all_windows_passed: safeWindows.length > 0 && passedWindows === safeWindows.length,
    feature_alignment: {
      checks: featureChecks,
      expected: expectedChecks,
      passed: featureChecks === expectedChecks,
    },
  };
};

const runBacktest = async ({
  userId,
  symbol = null,
  start = null,
  end = null,
  contractVersion = DATA_CONTRACT_VERSION,
  minTrainSize = 120,
  testSize = 30,
  stepSize = 30,
  maxWindows = null,
  precisionTarget = 0.5,
  decisionConstraints = null,
  strategyConfigOverride = null,
  markovConfigOverride = null,
} = {}) => {
  const query = {
    userId,
    contractVersion,
  };

  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (normalizedSymbol) {
    query.symbol = normalizedSymbol;
  }

  const startIso = toIsoDateOrNull(start);
  const endIso = toIsoDateOrNull(end);
  if (startIso || endIso) {
    query.timestamp = {};
    if (startIso) {
      query.timestamp.$gte = new Date(startIso);
    }
    if (endIso) {
      query.timestamp.$lte = new Date(endIso);
    }
  }

  const docs = await MarketDataBar.find(query)
    .sort({ symbol: 1, timestamp: 1 })
    .lean();

  const rows = docs.map(mapDocToObservation);
  const rowsBySymbol = new Map();

  for (const row of rows) {
    if (!rowsBySymbol.has(row.symbol)) {
      rowsBySymbol.set(row.symbol, []);
    }

    rowsBySymbol.get(row.symbol).push(row);
  }

  const perWindow = [];

  for (const [rowSymbol, symbolRows] of rowsBySymbol.entries()) {
    const windows = buildRollingWindows({
      rows: symbolRows,
      minTrainSize,
      testSize,
      stepSize,
      maxWindows,
    });

    for (let index = 0; index < windows.length; index += 1) {
      const window = windows[index];
      const trainRows = symbolRows.slice(window.train_start, window.train_end);
      const testRows = symbolRows.slice(window.test_start, window.test_end);

      const summary = evaluateWindow({
        windowIndex: perWindow.length,
        symbol: rowSymbol,
        trainRows,
        testRows,
        precisionTarget,
        decisionConstraints,
        strategyConfigOverride,
        markovConfigOverride,
      });

      perWindow.push(summary);
    }
  }

  const ensemble = summarizeWindows(perWindow, 'ensemble');
  const baseline = summarizeWindows(perWindow, 'baseline');

  const improvement = compareModels({
    ensemble: ensemble.summary,
    baseline: baseline.summary,
  });

  const winRate = average(
    perWindow.map((window) => (window?.improvement?.ensemble_outperforms_baseline ? 1 : 0))
  );

  const sampleWindow = perWindow[0] || null;

  return {
    evaluation_type: 'ensemble_vs_threshold_walk_forward_v1',
    generated_at: new Date().toISOString(),
    config: {
      symbol: normalizedSymbol || null,
      contract_version: contractVersion,
      min_train_size: Math.max(20, Math.trunc(toNumber(minTrainSize, 120))),
      test_size: Math.max(5, Math.trunc(toNumber(testSize, 30))),
      step_size: Math.max(1, Math.trunc(toNumber(stepSize, 30))),
      max_windows: maxWindows === null ? null : Math.max(1, Math.trunc(toNumber(maxWindows, 1))),
      precision_target: Number(clamp(toNumber(precisionTarget, 0.5), 0, 1).toFixed(6)),
      decision_constraints: decisionConstraints || null,
      strategy_config_override: strategyConfigOverride || null,
      markov_config_override: markovConfigOverride || null,
    },
    data_summary: {
      total_rows: rows.length,
      symbol_count: rowsBySymbol.size,
      symbols: [...rowsBySymbol.keys()],
      window_count: perWindow.length,
    },
    anti_leakage: summarizeLeakage(perWindow),
    ensemble: {
      kpi: ensemble.kpi,
      business: ensemble.business,
    },
    baseline: {
      kpi: baseline.kpi,
      business: baseline.business,
    },
    improvement: {
      ...improvement,
      window_outperformance_rate: winRate,
    },
    per_window: perWindow,
    example_results: sampleWindow
      ? {
        window_index: sampleWindow.window_index,
        symbol: sampleWindow.symbol,
        train_period: sampleWindow.train_period,
        test_period: sampleWindow.test_period,
        improvement: sampleWindow.improvement,
        ensemble_action_examples: sampleWindow.traces.ensemble_actions,
        baseline_action_examples: sampleWindow.traces.baseline_actions,
      }
      : null,
  };
};

const runWalkForward = async (params = {}) => {
  return runBacktest(params);
};

module.exports = {
  buildRollingWindows,
  evaluateWindow,
  runBacktest,
  runWalkForward,
};