const MarketDataBar = require('../models/MarketDataBar');
const { DATA_CONTRACT_VERSION } = require('../config/dataContract');
const { getMarkovConfig } = require('../config/markov');
const { buildStateSequences } = require('../models/markov/stateEncoder');
const { annotateSequencesWithRegimes } = require('../models/markov/regimeSelector');
const { buildTransitionMatrix } = require('../models/markov/transitionBuilder');
const {
  predictNextStateDist,
  predictStateDistKSteps,
  predictMostLikelyState,
  computeSequenceLogLikelihood,
  computeNextStateAccuracy,
  computeCalibrationStats,
} = require('../models/markov/predictor');
const { applyQueueAdjustment } = require('../models/markov/queueAdjustment');

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const mapDocToObservation = (doc) => ({
  symbol: doc.symbol,
  timestamp: new Date(doc.timestamp).toISOString(),
  open: Number(doc.open),
  high: Number(doc.high),
  low: Number(doc.low),
  close: Number(doc.close),
  volume: Number(doc.volume),
  spread: Number(doc.spread),
  current_state: String(doc.currentState || '').trim().toUpperCase() || null,
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

const mergeConfig = (overrideConfig = null) => {
  const base = getMarkovConfig();
  if (!overrideConfig || typeof overrideConfig !== 'object') {
    return base;
  }

  return {
    ...base,
    ...overrideConfig,
    regimeThresholds: {
      ...base.regimeThresholds,
      ...(overrideConfig.regimeThresholds || {}),
    },
    conditionalGate: {
      ...base.conditionalGate,
      ...(overrideConfig.conditionalGate || {}),
    },
  };
};

const evaluateConditionalExtensionGate = ({
  config,
  baselineMetrics = null,
  candidateMetrics = null,
} = {}) => {
  if (config.enableConditional !== true) {
    return {
      enabled: false,
      reason: 'conditional_extension_disabled_in_config',
    };
  }

  if (!baselineMetrics || !candidateMetrics) {
    return {
      enabled: false,
      reason: 'missing_out_of_sample_comparison_metrics',
    };
  }

  const gate = config.conditionalGate || {};
  const aucGain = Number(candidateMetrics.auc_pr || 0) - Number(baselineMetrics.auc_pr || 0);
  const recallGain = Number(candidateMetrics.recall_at_precision || 0) - Number(baselineMetrics.recall_at_precision || 0);
  const brierIncrease = Number(candidateMetrics.brier || 0) - Number(baselineMetrics.brier || 0);
  const eceIncrease = Number(candidateMetrics.ece || 0) - Number(baselineMetrics.ece || 0);

  const pass =
    aucGain >= Number(gate.minAucPrGain || 0)
    && recallGain >= Number(gate.minRecallAtPrecisionGain || 0)
    && brierIncrease <= Number(gate.maxBrierIncrease || 0)
    && eceIncrease <= Number(gate.maxEceIncrease || 0);

  return {
    enabled: pass,
    reason: pass ? 'conditional_extension_gate_passed' : 'conditional_extension_gate_failed',
    deltas: {
      auc_pr_gain: aucGain,
      recall_at_precision_gain: recallGain,
      brier_increase: brierIncrease,
      ece_increase: eceIncrease,
    },
  };
};

const getMatrixForRegime = ({ model, regime = null } = {}) => {
  const regimeKey = String(regime || '').trim().toUpperCase();
  if (regimeKey && model.regime_matrices?.[regimeKey]) {
    return model.regime_matrices[regimeKey];
  }

  return model.global_matrix;
};

const buildModel = ({
  rows = [],
  config: overrideConfig = null,
  baselineMetrics = null,
  candidateConditionalMetrics = null,
} = {}) => {
  const config = mergeConfig(overrideConfig);
  const states = [...config.states];

  const prepared = buildStateSequences({
    rows,
    states,
    entityKey: 'symbol',
    maxGapDays: config.maxGapDays,
    fallbackState: 'SIDEWAYS_STABLE',
  });

  const sequences = config.useRegimes
    ? annotateSequencesWithRegimes({
      sequences: prepared.sequences,
      thresholds: config.regimeThresholds,
      rollingWindows: config.rollingWindows,
    })
    : prepared.sequences;

  const transitions = buildTransitionMatrix({
    sequences,
    states,
    smoothingAlpha: config.smoothingAlpha,
    useRegimes: config.useRegimes,
  });

  const conditionalExtension = evaluateConditionalExtensionGate({
    config,
    baselineMetrics,
    candidateMetrics: candidateConditionalMetrics,
  });

  return {
    version: 'markov_model_v1',
    config_snapshot: deepClone(config),
    states,
    counts: transitions.counts,
    global_matrix: transitions.global_matrix,
    regime_matrices: transitions.regime_matrices,
    metadata: {
      ...prepared.metadata,
      transition_count: transitions.counts.metadata.transition_count,
      regime_count: transitions.counts.metadata.regime_count,
    },
    conditional_extension: conditionalExtension,
    _sequences: sequences,
  };
};

const buildModelFromMarketData = async ({
  userId,
  symbol = '',
  start = null,
  end = null,
  contractVersion = DATA_CONTRACT_VERSION,
  config = null,
  limit = 5000,
  baselineMetrics = null,
  candidateConditionalMetrics = null,
} = {}) => {
  const query = {
    userId,
    contractVersion,
  };

  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (normalizedSymbol) {
    query.symbol = normalizedSymbol;
  }

  const startDate = toDateOrNull(start);
  const endDate = toDateOrNull(end);
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = startDate;
    }
    if (endDate) {
      query.timestamp.$lte = endDate;
    }
  }

  const docs = await MarketDataBar.find(query)
    .sort({ symbol: 1, timestamp: 1 })
    .limit(Math.max(100, Math.min(Number(limit) || 5000, 20000)))
    .lean();

  const rows = docs.map(mapDocToObservation);
  const model = buildModel({
    rows,
    config,
    baselineMetrics,
    candidateConditionalMetrics,
  });

  return {
    model,
    source_rows: rows.length,
  };
};

const getP = ({ model, regime = null } = {}) => {
  return getMatrixForRegime({ model, regime });
};

const resolveQueueFeaturesForPrediction = ({
  model,
  symbol = '',
  asOf = null,
} = {}) => {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    return null;
  }

  const anchor = toDateOrNull(asOf) || new Date();
  let selectedPoint = null;

  for (const sequence of model?._sequences || []) {
    if (String(sequence.entity_id || '').trim().toUpperCase() !== normalizedSymbol) {
      continue;
    }

    for (const point of sequence.points || []) {
      const ts = toDateOrNull(point.t);
      if (!ts || ts > anchor) {
        continue;
      }

      if (!selectedPoint || new Date(selectedPoint.t).getTime() < ts.getTime()) {
        selectedPoint = point;
      }
    }
  }

  if (!selectedPoint) {
    return null;
  }

  return selectedPoint.queue_features || null;
};

const predict = ({
  model,
  currentState,
  regime = null,
  steps = 1,
  queueFeatures = null,
  symbol = '',
  asOf = null,
} = {}) => {
  const matrix = getP({ model, regime });
  const states = model.states;

  const distribution = Number(steps) > 1
    ? predictStateDistKSteps({
      currentState,
      matrix,
      states,
      steps,
    })
    : predictNextStateDist({
      currentState,
      matrix,
      states,
    });

  const resolvedQueueFeatures = queueFeatures && typeof queueFeatures === 'object'
    ? queueFeatures
    : resolveQueueFeaturesForPrediction({
      model,
      symbol,
      asOf,
    });

  const queueAdjusted = applyQueueAdjustment({
    baseDistribution: distribution,
    queueFeatures: resolvedQueueFeatures,
    states,
  });

  return {
    current_state: String(currentState || '').trim().toUpperCase() || 'SIDEWAYS_STABLE',
    next_state_distribution: queueAdjusted.distribution,
    most_likely_next_state: predictMostLikelyState(queueAdjusted.distribution),
    regime: String(regime || '').trim().toUpperCase() || 'GLOBAL',
    steps: Math.max(1, Math.trunc(Number(steps) || 1)),
    adjustment_applied: queueAdjusted.adjustment_applied,
    adjustment_reason: queueAdjusted.adjustment_reason,
  };
};

const evaluateModelHooks = ({ model } = {}) => {
  const sequences = model?._sequences || [];
  const states = model?.states || [];

  const matrixResolver = (regime) => getMatrixForRegime({ model, regime });

  return {
    log_likelihood: computeSequenceLogLikelihood({
      sequences,
      states,
      matrixResolver,
    }),
    next_state_accuracy: computeNextStateAccuracy({
      sequences,
      states,
      matrixResolver,
    }),
    calibration: computeCalibrationStats({
      sequences,
      states,
      matrixResolver,
    }),
  };
};

module.exports = {
  buildModel,
  buildModelFromMarketData,
  getP,
  predict,
  evaluateModelHooks,
};
