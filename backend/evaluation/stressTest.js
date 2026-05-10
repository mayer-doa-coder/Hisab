const { buildForecastFromModel } = require('../services/forecastService');
const { createSeededRng } = require('../models/markov/simulator');
const { computeRobustnessMetrics } = require('./robustness');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeQueueFeatures = (queueFeatures = {}) => ({
  imbalance_pressure: toNumber(queueFeatures?.imbalance_pressure, 0),
  arrival_rate: Math.max(0, toNumber(queueFeatures?.arrival_rate, 0)),
  service_rate: Math.max(0, toNumber(queueFeatures?.service_rate, 0)),
  congestion: Math.max(0, toNumber(queueFeatures?.congestion, 0)),
  spread_stress: Math.max(0, toNumber(queueFeatures?.spread_stress, 0)),
  execution_delay: Math.max(0, toNumber(queueFeatures?.execution_delay, 0)),
});

const applyScenarioInjection = ({
  scenario,
  baseQueueFeatures,
  rng,
} = {}) => {
  const base = normalizeQueueFeatures(baseQueueFeatures || {});

  if (scenario === 'volatility_shock') {
    return {
      ...base,
      congestion: Math.min(1, base.congestion + 0.35 + (rng() * 0.1)),
      spread_stress: Math.min(1.4, base.spread_stress + 0.45 + (rng() * 0.1)),
      execution_delay: Math.max(base.execution_delay, base.execution_delay + 24 + (rng() * 10)),
      arrival_rate: Math.max(0.05, base.arrival_rate * 0.85),
      service_rate: Math.max(0.02, base.service_rate * 0.65),
    };
  }

  if (scenario === 'low_liquidity') {
    return {
      ...base,
      congestion: Math.min(1, base.congestion + 0.25 + (rng() * 0.05)),
      spread_stress: Math.min(1.6, base.spread_stress + 0.6 + (rng() * 0.08)),
      execution_delay: Math.max(base.execution_delay, base.execution_delay + 30 + (rng() * 12)),
      arrival_rate: Math.max(0.02, base.arrival_rate * 0.55),
      service_rate: Math.max(0.01, base.service_rate * 0.35),
    };
  }

  if (scenario === 'regime_shift') {
    return {
      ...base,
      imbalance_pressure: Math.max(-1, Math.min(1, base.imbalance_pressure - 0.35 - (rng() * 0.15))),
      congestion: Math.min(1, base.congestion + 0.3 + (rng() * 0.05)),
      spread_stress: Math.min(1.3, base.spread_stress + 0.35 + (rng() * 0.08)),
      execution_delay: Math.max(base.execution_delay, base.execution_delay + 20 + (rng() * 8)),
    };
  }

  if (scenario === 'data_outage') {
    return {
      imbalance_pressure: NaN,
      arrival_rate: NaN,
      service_rate: NaN,
      congestion: NaN,
      spread_stress: NaN,
      execution_delay: NaN,
    };
  }

  return base;
};

const buildHistoricalReplayScenarios = ({ model, symbol }) => {
  const scenarios = [];
  const riskStates = new Set(['LIQUIDITY_STRESS', 'QUEUE_PRESSURE', 'HIGH_VOLATILITY', 'DOWNTREND']);
  const sequences = Array.isArray(model?._sequences) ? model._sequences : [];
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  for (const sequence of sequences) {
    if (normalizedSymbol && String(sequence?.entity_id || '').trim().toUpperCase() !== normalizedSymbol) {
      continue;
    }

    const points = Array.isArray(sequence?.points) ? sequence.points : [];
    for (const point of points) {
      const state = String(point?.state || '').trim().toUpperCase();
      if (!riskStates.has(state)) {
        continue;
      }

      scenarios.push({
        id: `historical_replay_${state.toLowerCase()}`,
        label: `Historical replay ${state}`,
        queue_features: point?.queue_features || null,
        forced_regime: 'STRESSED',
      });

      if (scenarios.length >= 2) {
        return scenarios;
      }
    }
  }

  return scenarios;
};

const pickRepresentativeHorizon = (result, preferred = '1_month') => {
  const horizons = result?.horizons || {};
  if (horizons[preferred]) {
    return horizons[preferred];
  }

  const keys = Object.keys(horizons);
  if (keys.length === 0) {
    return null;
  }

  return horizons[keys[0]];
};

const summarizeScenario = ({ baselineResult, scenarioResult }) => {
  const baselineHorizon = pickRepresentativeHorizon(baselineResult, '1_month');
  const scenarioHorizon = pickRepresentativeHorizon(scenarioResult, '1_month');

  const robustness = computeRobustnessMetrics({
    baseline: {
      signal: baselineHorizon?.decision_signal || {},
      confidence: {
        score: toNumber(baselineHorizon?.failure_report?.confidence?.score, baselineHorizon?.decision?.confidence),
      },
      decision_series: Object.values(baselineResult?.horizons || {}).map((item) => item?.decision || {}),
    },
    stressed: {
      signal: scenarioHorizon?.decision_signal || {},
      confidence: {
        score: toNumber(scenarioHorizon?.failure_report?.confidence?.score, scenarioHorizon?.decision?.confidence),
      },
      decision_series: Object.values(scenarioResult?.horizons || {}).map((item) => item?.decision || {}),
    },
  });

  return {
    baseline_action: baselineHorizon?.decision?.action || null,
    stressed_action: scenarioHorizon?.decision?.action || null,
    baseline_confidence: toNumber(baselineHorizon?.decision?.confidence, 0),
    stressed_confidence: toNumber(scenarioHorizon?.decision?.confidence, 0),
    fallback_triggered: Boolean(scenarioHorizon?.decision?.fallback),
    fallback_reason: scenarioHorizon?.decision?.fallback_reason || [],
    robustness,
  };
};

const runStressTests = ({
  model,
  symbol = null,
  asOf = null,
  currentState = null,
  queueFeatures = null,
  simulationCount = null,
  seed = null,
  horizons = null,
  decisionConstraints = null,
  strategyConfigOverride = null,
} = {}) => {
  const rng = createSeededRng(seed ? `${seed}:stress` : 'phase10_stress_seed');
  const baseQueue = normalizeQueueFeatures(queueFeatures || {});

  const baseline = buildForecastFromModel({
    model,
    symbol,
    asOf,
    currentState,
    queueFeatures: baseQueue,
    simulationCount,
    includePaths: false,
    seed: seed ? `${seed}:baseline` : 'phase10_baseline',
    horizons,
    decisionConstraints,
    strategyConfigOverride,
  });

  const scenarios = [
    {
      id: 'volatility_shock',
      label: 'Volatility Shock',
      forced_regime: 'HIGH_VOLATILITY',
      queue_features: applyScenarioInjection({ scenario: 'volatility_shock', baseQueueFeatures: baseQueue, rng }),
    },
    {
      id: 'low_liquidity',
      label: 'Low Liquidity Window',
      forced_regime: 'STRESSED',
      queue_features: applyScenarioInjection({ scenario: 'low_liquidity', baseQueueFeatures: baseQueue, rng }),
    },
    {
      id: 'regime_shift',
      label: 'Abrupt Regime Shift',
      forced_regime: 'STRESSED',
      queue_features: applyScenarioInjection({ scenario: 'regime_shift', baseQueueFeatures: baseQueue, rng }),
    },
    {
      id: 'data_outage',
      label: 'Data Outage',
      forced_regime: null,
      queue_features: applyScenarioInjection({ scenario: 'data_outage', baseQueueFeatures: baseQueue, rng }),
    },
  ];

  const historicalReplay = buildHistoricalReplayScenarios({ model, symbol });
  scenarios.push(...historicalReplay);

  const scenarioResults = [];
  for (const scenario of scenarios) {
    const result = buildForecastFromModel({
      model,
      symbol,
      asOf,
      currentState,
      regime: scenario.forced_regime || null,
      queueFeatures: scenario.queue_features,
      simulationCount,
      includePaths: false,
      seed: seed ? `${seed}:${scenario.id}` : `phase10_${scenario.id}`,
      horizons,
      decisionConstraints,
      strategyConfigOverride,
    });

    scenarioResults.push({
      scenario: {
        id: scenario.id,
        label: scenario.label,
        forced_regime: scenario.forced_regime || null,
      },
      summary: summarizeScenario({ baselineResult: baseline, scenarioResult: result }),
      result,
    });
  }

  return {
    stress_test_version: 'phase10_stress_test_v1',
    generated_at: new Date().toISOString(),
    reproducibility: {
      seed: seed || 'phase10_stress_seed',
      deterministic: true,
    },
    baseline,
    scenarios: scenarioResults,
  };
};

module.exports = {
  runStressTests,
};
