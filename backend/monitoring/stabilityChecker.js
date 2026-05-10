const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeStates = (matrix = {}) => {
  const fromStates = Object.keys(matrix || {});
  const toStates = new Set();
  for (const fromState of fromStates) {
    const row = matrix?.[fromState] || {};
    for (const toState of Object.keys(row)) {
      toStates.add(toState);
    }
  }

  const states = new Set([...fromStates, ...toStates]);
  return [...states].sort();
};

const matrixValue = (matrix, fromState, toState) => {
  return Math.max(0, toNumber(matrix?.[fromState]?.[toState], 0));
};

const compareTransitionMatrices = ({ baselineMatrix = {}, currentMatrix = {} } = {}) => {
  const states = [...new Set([...normalizeStates(baselineMatrix), ...normalizeStates(currentMatrix)])];
  const deltas = [];

  let frobenius = 0;
  let maxDelta = 0;

  for (const fromState of states) {
    for (const toState of states) {
      const baseValue = matrixValue(baselineMatrix, fromState, toState);
      const currentValue = matrixValue(currentMatrix, fromState, toState);
      const delta = currentValue - baseValue;

      frobenius += delta * delta;
      maxDelta = Math.max(maxDelta, Math.abs(delta));

      deltas.push({
        from_state: fromState,
        to_state: toState,
        baseline: Number(baseValue.toFixed(6)),
        current: Number(currentValue.toFixed(6)),
        delta: Number(delta.toFixed(6)),
      });
    }
  }

  return {
    states,
    frobenius_distance: Number(Math.sqrt(frobenius).toFixed(6)),
    max_delta: Number(maxDelta.toFixed(6)),
    deltas,
  };
};

const detectRareTransitionAnomalies = ({
  baselineMatrix = {},
  observedTransitions = [],
  rareThreshold = 0.01,
  minOccurrences = 3,
} = {}) => {
  const anomalies = [];

  for (const transition of Array.isArray(observedTransitions) ? observedTransitions : []) {
    const fromState = String(transition?.from_state || transition?.fromState || '').trim().toUpperCase();
    const toState = String(transition?.to_state || transition?.toState || '').trim().toUpperCase();
    const count = Math.max(0, Math.trunc(toNumber(transition?.count, 0)));

    if (!fromState || !toState || count <= 0) {
      continue;
    }

    const baselineProbability = matrixValue(baselineMatrix, fromState, toState);
    if (baselineProbability <= toNumber(rareThreshold, 0.01) && count >= Math.max(1, Math.trunc(toNumber(minOccurrences, 3)))) {
      anomalies.push({
        from_state: fromState,
        to_state: toState,
        baseline_probability: Number(baselineProbability.toFixed(6)),
        observed_count: count,
      });
    }
  }

  return anomalies;
};

const detectTransitionStability = ({
  baselineMatrix = {},
  currentMatrix = {},
  observedTransitions = [],
  thresholds = null,
} = {}) => {
  const config = {
    frobenius_alert: 0.25,
    max_delta_alert: 0.2,
    rare_probability_threshold: 0.01,
    rare_min_occurrences: 3,
    ...(thresholds || {}),
  };

  const comparison = compareTransitionMatrices({ baselineMatrix, currentMatrix });

  const rareAnomalies = detectRareTransitionAnomalies({
    baselineMatrix,
    observedTransitions,
    rareThreshold: config.rare_probability_threshold,
    minOccurrences: config.rare_min_occurrences,
  });

  const topDeltas = [...comparison.deltas]
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 10);

  const unstable = comparison.frobenius_distance >= toNumber(config.frobenius_alert, 0.25)
    || comparison.max_delta >= toNumber(config.max_delta_alert, 0.2)
    || rareAnomalies.length > 0;

  return {
    stability_version: 'transition_stability_v1',
    generated_at: new Date().toISOString(),
    unstable,
    thresholds: config,
    matrix_comparison: comparison,
    rare_transition_anomalies: rareAnomalies,
    top_delta_transitions: topDeltas,
  };
};

module.exports = {
  compareTransitionMatrices,
  detectRareTransitionAnomalies,
  detectTransitionStability,
};
