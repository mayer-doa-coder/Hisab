const {
  TRUST_HORIZON_KEYS,
  normalizeTrustHorizon,
  getTrustHorizonDefinition,
} = require('../config/trustObjective');
const { getMarkovConfig } = require('../config/markov');
const { simulatePaths } = require('../models/markov/simulator');
const { computeReturns } = require('../models/markov/returnMapper');
const { applyQueueAdjustment } = require('../models/markov/queueAdjustment');
const { decideAction } = require('../strategy/decisionEngine');
const { detectFailure } = require('../evaluation/robustness');
const { applyFallback } = require('../fallback/fallbackEngine');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const normalizeStateToken = (value) => String(value || '').trim().toUpperCase();

const normalizeStateDistribution = ({ counts = {}, states = [], total = null } = {}) => {
  const result = {};
  const safeTotal = toNumber(total, 0) > 0
    ? toNumber(total, 0)
    : states.reduce((sum, state) => sum + Math.max(0, toNumber(counts?.[state], 0)), 0);

  for (const state of states) {
    const value = Math.max(0, toNumber(counts?.[state], 0));
    result[state] = safeTotal > 0 ? value / safeTotal : 0;
  }

  return result;
};

const percentileSorted = (sortedValues = [], p = 0.5) => {
  const values = Array.isArray(sortedValues) ? sortedValues : [];
  if (values.length === 0) {
    return 0;
  }

  const clampedP = clamp(toNumber(p, 0.5), 0, 1);
  const index = (values.length - 1) * clampedP;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return values[lower];
  }

  const lowerWeight = upper - index;
  const upperWeight = index - lower;
  return (values[lower] * lowerWeight) + (values[upper] * upperWeight);
};

const mean = (values = []) => {
  const safeValues = Array.isArray(values) ? values : [];
  if (safeValues.length === 0) {
    return 0;
  }

  return safeValues.reduce((sum, value) => sum + toNumber(value, 0), 0) / safeValues.length;
};

const standardDeviation = (values = []) => {
  const safeValues = Array.isArray(values) ? values : [];
  if (safeValues.length <= 1) {
    return 0;
  }

  const avg = mean(safeValues);
  const variance = safeValues.reduce((sum, value) => {
    const delta = toNumber(value, 0) - avg;
    return sum + (delta * delta);
  }, 0) / safeValues.length;

  return Math.sqrt(Math.max(0, variance));
};

const summarizeReturnDistribution = (returns = []) => {
  const safeReturns = Array.isArray(returns)
    ? returns
      .map((value) => toNumber(value, 0))
      .filter((value) => Number.isFinite(value))
    : [];

  if (safeReturns.length === 0) {
    return {
      expected_return: 0,
      gain_probability: 0,
      loss_probability: 0,
      return_band: {
        p10: 0,
        p50: 0,
        p90: 0,
      },
      downside_risk: {
        value_at_risk_95: 0,
        expected_shortfall_95: 0,
        probability_below_minus_2pct: 0,
      },
      uncertainty: {
        standard_deviation: 0,
        interdecile_range: 0,
      },
    };
  }

  const sorted = [...safeReturns].sort((left, right) => left - right);
  const p10 = percentileSorted(sorted, 0.1);
  const p50 = percentileSorted(sorted, 0.5);
  const p90 = percentileSorted(sorted, 0.9);
  const p05 = percentileSorted(sorted, 0.05);

  const gains = safeReturns.filter((value) => value > 0).length;
  const losses = safeReturns.filter((value) => value < 0).length;
  const tail = safeReturns.filter((value) => value <= p05);

  return {
    expected_return: mean(safeReturns),
    gain_probability: gains / safeReturns.length,
    loss_probability: losses / safeReturns.length,
    return_band: {
      p10,
      p50,
      p90,
    },
    downside_risk: {
      value_at_risk_95: p05,
      expected_shortfall_95: tail.length > 0 ? mean(tail) : p05,
      probability_below_minus_2pct: safeReturns.filter((value) => value <= -0.02).length / safeReturns.length,
    },
    uncertainty: {
      standard_deviation: standardDeviation(safeReturns),
      interdecile_range: p90 - p10,
    },
  };
};

const buildDecisionSignalInput = (metrics = {}) => {
  return {
    gain_prob: toNumber(metrics?.gain_probability, 0),
    loss_prob: toNumber(metrics?.loss_probability, 0),
    expected_return: toNumber(metrics?.expected_return, 0),
    band: [
      toNumber(metrics?.return_band?.p10, 0),
      toNumber(metrics?.return_band?.p90, 0),
    ],
    downside: toNumber(metrics?.downside_risk?.value_at_risk_95, 0),
    uncertainty: toNumber(metrics?.uncertainty?.standard_deviation, 0),
  };
};

const resolveForecastHorizonKeys = ({ horizonInput = null } = {}) => {
  if (Array.isArray(horizonInput)) {
    const normalized = horizonInput
      .map((item) => normalizeTrustHorizon(item))
      .filter(Boolean);
    return normalized.length > 0 ? [...new Set(normalized)] : [...TRUST_HORIZON_KEYS];
  }

  const text = String(horizonInput || '').trim();
  if (!text) {
    return [...TRUST_HORIZON_KEYS];
  }

  const normalized = text
    .split(',')
    .map((item) => normalizeTrustHorizon(item))
    .filter(Boolean);

  return normalized.length > 0 ? [...new Set(normalized)] : [...TRUST_HORIZON_KEYS];
};

const countModelRows = (model = {}) => {
  const sequences = Array.isArray(model?._sequences) ? model._sequences : [];
  return sequences.reduce((sum, sequence) => {
    const points = Array.isArray(sequence?.points) ? sequence.points : [];
    return sum + points.length;
  }, 0);
};

const resolveLatestPoint = ({ model, symbol = '', asOf = null } = {}) => {
  const sequences = Array.isArray(model?._sequences) ? model._sequences : [];
  if (sequences.length === 0) {
    return null;
  }

  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const anchor = toDateOrNull(asOf) || new Date();

  let selectedPoint = null;
  for (const sequence of sequences) {
    if (normalizedSymbol && String(sequence?.entity_id || '').trim().toUpperCase() !== normalizedSymbol) {
      continue;
    }

    const points = Array.isArray(sequence?.points) ? sequence.points : [];
    for (const point of points) {
      const ts = toDateOrNull(point?.t);
      if (!ts || ts > anchor) {
        continue;
      }

      if (!selectedPoint || toDateOrNull(selectedPoint.t) < ts) {
        selectedPoint = point;
      }
    }
  }

  return selectedPoint;
};

const getRegimeMatrix = ({ model, regime = null } = {}) => {
  const regimeKey = String(regime || '').trim().toUpperCase();
  if (regimeKey && model?.regime_matrices?.[regimeKey]) {
    return {
      matrix: model.regime_matrices[regimeKey],
      regime: regimeKey,
    };
  }

  return {
    matrix: model?.global_matrix || {},
    regime: 'GLOBAL',
  };
};

const buildForecastFromModel = ({
  model,
  symbol = '',
  asOf = null,
  currentState = null,
  regime = null,
  queueFeatures = null,
  simulationCount = null,
  includePaths = false,
  seed = null,
  horizons = null,
  decisionConstraints = null,
  strategyConfigOverride = null,
} = {}) => {
  const states = Array.isArray(model?.states) ? model.states : [];
  if (states.length === 0) {
    throw new Error('Markov model states are not available for forecast generation.');
  }

  const markovConfig = getMarkovConfig();
  const forecastConfig = markovConfig?.forecast || {};

  const hasRequestedSimulationCount = simulationCount !== null
    && simulationCount !== undefined
    && String(simulationCount).trim() !== '';
  const requestedSimulationCount = hasRequestedSimulationCount
    ? simulationCount
    : forecastConfig.defaultSimulationCount || 2000;

  const safeSimulationCount = clamp(
    Math.trunc(toNumber(requestedSimulationCount, forecastConfig.defaultSimulationCount || 2000)),
    Math.max(1, Math.trunc(toNumber(forecastConfig.minSimulationCount, 200))),
    Math.max(1, Math.trunc(toNumber(forecastConfig.maxSimulationCount, 5000)))
  );

  const safeStorePathCount = includePaths
    ? Math.max(0, Math.trunc(toNumber(forecastConfig.maxStoredPathsPerHorizon, 40)))
    : 0;

  const latestPoint = resolveLatestPoint({
    model,
    symbol,
    asOf,
  });

  const explicitState = normalizeStateToken(currentState);
  const inferredState = normalizeStateToken(latestPoint?.state);

  const selectedState = states.includes(explicitState)
    ? explicitState
    : states.includes(inferredState)
      ? inferredState
      : states[0];

  const selectedQueueFeatures = queueFeatures && typeof queueFeatures === 'object'
    ? queueFeatures
    : latestPoint?.queue_features || null;

  const { matrix, regime: appliedRegime } = getRegimeMatrix({
    model,
    regime,
  });

  const availableHistoryRows = countModelRows(model);

  const safeHorizonKeys = resolveForecastHorizonKeys({ horizonInput: horizons });
  const maxHorizonSteps = Math.max(1, Math.trunc(toNumber(forecastConfig.maxHorizonSteps, 365)));

  const horizonForecasts = {};
  for (const horizonKey of safeHorizonKeys) {
    const definition = getTrustHorizonDefinition(horizonKey);
    const days = clamp(
      Math.trunc(toNumber(definition?.time_window_days, 30)),
      1,
      maxHorizonSteps
    );

    const horizonSeed = seed ? `${seed}:${horizonKey}` : null;

    const simulationResult = simulatePaths({
      currentState: selectedState,
      transitionMatrix: matrix,
      states,
      horizonSteps: days,
      simulationCount: safeSimulationCount,
      seed: horizonSeed,
      queueFeatures: selectedQueueFeatures,
      adjustmentFn: applyQueueAdjustment,
      maxStoredPaths: safeStorePathCount,
    });

    const returnResult = computeReturns({
      paths: simulationResult.all_paths,
      simulationCount: simulationResult.simulation_count,
      terminalStateCounts: simulationResult.terminal_state_counts,
      seed: horizonSeed,
    });

    const terminalStateDistribution = normalizeStateDistribution({
      counts: simulationResult.terminal_state_counts,
      states,
      total: simulationResult.simulation_count,
    });

    const metrics = summarizeReturnDistribution(returnResult.returns);
    const decisionSignal = buildDecisionSignalInput(metrics);
    const decision = decideAction(
      decisionSignal,
      selectedState,
      decisionConstraints || {},
      strategyConfigOverride || null
    );

    const failureReport = detectFailure({
      distribution: terminalStateDistribution,
      decisionSignal,
      queueFeatures: selectedQueueFeatures,
      availableHistoryRows,
      requiredHistoryRows: 60,
      uncertaintyThreshold: toNumber(strategyConfigOverride?.uncertaintyThreshold, 0.08),
      varianceThreshold: 0.0025,
      lowConfidenceThreshold: 0.45,
    });

    const finalDecision = applyFallback({
      decision,
      decisionSignal,
      currentState: selectedState,
      queueFeatures: selectedQueueFeatures,
      failureReport,
      constraints: decisionConstraints || {},
      strategyConfigOverride: strategyConfigOverride || null,
    });

    horizonForecasts[horizonKey] = {
      horizon: horizonKey,
      time_window_days: days,
      simulation_count: simulationResult.simulation_count,
      terminal_state_distribution: terminalStateDistribution,
      metrics,
      decision_signal: decisionSignal,
      decision: finalDecision,
      failure_report: failureReport,
      adjustment_reason: simulationResult.adjustment_reason,
      paths: includePaths ? simulationResult.paths : [],
    };
  }

  return {
    current_state: selectedState,
    inferred_from_symbol: latestPoint
      ? String(latestPoint?.observation?.symbol || '').trim().toUpperCase() || null
      : null,
    regime: appliedRegime,
    simulation_count: safeSimulationCount,
    horizons: horizonForecasts,
    forecast_config: {
      min_simulation_count: Math.max(1, Math.trunc(toNumber(forecastConfig.minSimulationCount, 200))),
      max_simulation_count: Math.max(1, Math.trunc(toNumber(forecastConfig.maxSimulationCount, 5000))),
      max_horizon_steps: maxHorizonSteps,
      max_stored_paths_per_horizon: Math.max(0, Math.trunc(toNumber(forecastConfig.maxStoredPathsPerHorizon, 40))),
    },
  };
};

module.exports = {
  summarizeReturnDistribution,
  resolveForecastHorizonKeys,
  buildForecastFromModel,
};
