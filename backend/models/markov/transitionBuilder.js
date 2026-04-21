const initCountMatrix = (states = []) => {
  const matrix = {};
  for (const fromState of states) {
    matrix[fromState] = {};
    for (const toState of states) {
      matrix[fromState][toState] = 0;
    }
  }

  return matrix;
};

const cloneMatrix = (matrix) => JSON.parse(JSON.stringify(matrix));

const incrementTransition = (matrix, fromState, toState) => {
  if (!matrix?.[fromState] || matrix[fromState][toState] === undefined) {
    return;
  }

  matrix[fromState][toState] += 1;
};

const buildTransitionCounts = ({
  sequences = [],
  states = [],
  useRegimes = true,
} = {}) => {
  const globalCounts = initCountMatrix(states);
  const regimeCounts = {};
  let transitionCount = 0;

  for (const sequence of Array.isArray(sequences) ? sequences : []) {
    const points = Array.isArray(sequence.points) ? sequence.points : [];
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];

      if (current.break_before === true) {
        continue;
      }

      const fromState = previous.state;
      const toState = current.state;
      if (!states.includes(fromState) || !states.includes(toState)) {
        continue;
      }

      incrementTransition(globalCounts, fromState, toState);
      transitionCount += 1;

      if (useRegimes) {
        const regimeKey = String(current.regime || 'GLOBAL').trim().toUpperCase();
        if (!regimeCounts[regimeKey]) {
          regimeCounts[regimeKey] = initCountMatrix(states);
        }
        incrementTransition(regimeCounts[regimeKey], fromState, toState);
      }
    }
  }

  return {
    global_counts: globalCounts,
    regime_counts: regimeCounts,
    metadata: {
      transition_count: transitionCount,
      regime_count: Object.keys(regimeCounts).length,
    },
  };
};

const applyLaplaceSmoothing = ({ counts, states, alpha }) => {
  const smoothed = cloneMatrix(counts || {});
  const addAlpha = Number(alpha);
  const safeAlpha = Number.isFinite(addAlpha) && addAlpha > 0 ? addAlpha : 0;

  for (const fromState of states) {
    if (!smoothed[fromState]) {
      smoothed[fromState] = {};
    }
    for (const toState of states) {
      const current = Number(smoothed[fromState][toState] || 0);
      smoothed[fromState][toState] = current + safeAlpha;
    }
  }

  return smoothed;
};

const normalizeCounts = ({ counts, states }) => {
  const matrix = {};
  const rowSums = {};
  const stateCount = Math.max(1, states.length);

  for (const fromState of states) {
    const row = counts?.[fromState] || {};
    let sum = 0;
    for (const toState of states) {
      sum += Number(row[toState] || 0);
    }

    rowSums[fromState] = sum;
    matrix[fromState] = {};

    if (sum <= 0) {
      const uniform = 1 / stateCount;
      for (const toState of states) {
        matrix[fromState][toState] = uniform;
      }
      continue;
    }

    for (const toState of states) {
      matrix[fromState][toState] = Number(row[toState] || 0) / sum;
    }
  }

  return {
    matrix,
    row_sums: rowSums,
  };
};

const buildTransitionMatrix = ({
  sequences = [],
  states = [],
  smoothingAlpha = 0.5,
  useRegimes = true,
} = {}) => {
  const counts = buildTransitionCounts({
    sequences,
    states,
    useRegimes,
  });

  const globalSmoothed = applyLaplaceSmoothing({
    counts: counts.global_counts,
    states,
    alpha: smoothingAlpha,
  });
  const globalNormalized = normalizeCounts({ counts: globalSmoothed, states });

  const regimeMatrices = {};
  for (const [regime, regimeCountMatrix] of Object.entries(counts.regime_counts)) {
    const smoothed = applyLaplaceSmoothing({
      counts: regimeCountMatrix,
      states,
      alpha: smoothingAlpha,
    });
    regimeMatrices[regime] = normalizeCounts({ counts: smoothed, states }).matrix;
  }

  return {
    counts,
    global_matrix: globalNormalized.matrix,
    regime_matrices: regimeMatrices,
  };
};

module.exports = {
  initCountMatrix,
  buildTransitionCounts,
  applyLaplaceSmoothing,
  normalizeCounts,
  buildTransitionMatrix,
};
