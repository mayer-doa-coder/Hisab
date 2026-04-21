const safeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeVector = (vector, states) => {
  const normalized = {};
  let sum = 0;

  for (const state of states) {
    const value = Math.max(0, safeNumber(vector[state], 0));
    normalized[state] = value;
    sum += value;
  }

  if (sum <= 0) {
    const uniform = 1 / Math.max(1, states.length);
    for (const state of states) {
      normalized[state] = uniform;
    }
    return normalized;
  }

  for (const state of states) {
    normalized[state] = normalized[state] / sum;
  }

  return normalized;
};

const getRowDistribution = ({ matrix, currentState, states }) => {
  const state = String(currentState || '').trim().toUpperCase();
  const row = matrix?.[state] || {};
  return normalizeVector(row, states);
};

const predictMostLikelyState = (distribution = {}) => {
  let bestState = null;
  let bestProb = -1;

  for (const [state, probability] of Object.entries(distribution)) {
    const value = safeNumber(probability, 0);
    if (value > bestProb) {
      bestProb = value;
      bestState = state;
    }
  }

  return bestState;
};

const multiplyVectorByMatrix = ({ vector, matrix, states }) => {
  const output = {};
  for (const toState of states) {
    let value = 0;
    for (const fromState of states) {
      value += safeNumber(vector[fromState], 0) * safeNumber(matrix?.[fromState]?.[toState], 0);
    }
    output[toState] = value;
  }

  return normalizeVector(output, states);
};

const predictNextStateDist = ({ currentState, matrix, states }) => {
  return getRowDistribution({
    matrix,
    currentState,
    states,
  });
};

const predictStateDistKSteps = ({ currentState, matrix, states, steps = 1 }) => {
  const safeSteps = Math.max(1, Math.trunc(Number(steps) || 1));
  let distribution = predictNextStateDist({
    currentState,
    matrix,
    states,
  });

  if (safeSteps === 1) {
    return distribution;
  }

  for (let k = 2; k <= safeSteps; k += 1) {
    distribution = multiplyVectorByMatrix({
      vector: distribution,
      matrix,
      states,
    });
  }

  return distribution;
};

const computeSequenceLogLikelihood = ({ sequences = [], states = [], matrixResolver }) => {
  let logLikelihood = 0;
  let transitionCount = 0;
  const eps = 1e-12;

  for (const sequence of sequences) {
    const points = Array.isArray(sequence.points) ? sequence.points : [];
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (current.break_before === true) {
        continue;
      }

      if (!states.includes(previous.state) || !states.includes(current.state)) {
        continue;
      }

      const matrix = matrixResolver(current.regime);
      const probability = safeNumber(matrix?.[previous.state]?.[current.state], 0);
      logLikelihood += Math.log(Math.max(probability, eps));
      transitionCount += 1;
    }
  }

  return {
    log_likelihood: logLikelihood,
    average_log_likelihood: transitionCount > 0 ? logLikelihood / transitionCount : null,
    transitions: transitionCount,
  };
};

const computeNextStateAccuracy = ({ sequences = [], states = [], matrixResolver }) => {
  let total = 0;
  let correct = 0;

  for (const sequence of sequences) {
    const points = Array.isArray(sequence.points) ? sequence.points : [];
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (current.break_before === true) {
        continue;
      }

      if (!states.includes(previous.state) || !states.includes(current.state)) {
        continue;
      }

      const matrix = matrixResolver(current.regime);
      const dist = predictNextStateDist({
        currentState: previous.state,
        matrix,
        states,
      });

      const predicted = predictMostLikelyState(dist);
      if (predicted === current.state) {
        correct += 1;
      }
      total += 1;
    }
  }

  return {
    accuracy: total > 0 ? correct / total : null,
    correct,
    total,
  };
};

const computeCalibrationStats = ({ sequences = [], states = [], matrixResolver, bins = 10 }) => {
  const samples = [];
  const safeBins = Math.max(2, Math.trunc(Number(bins) || 10));

  for (const sequence of sequences) {
    const points = Array.isArray(sequence.points) ? sequence.points : [];
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      if (current.break_before === true) {
        continue;
      }

      if (!states.includes(previous.state) || !states.includes(current.state)) {
        continue;
      }

      const matrix = matrixResolver(current.regime);
      const dist = predictNextStateDist({
        currentState: previous.state,
        matrix,
        states,
      });

      const maxProb = Math.max(...Object.values(dist));
      const trueProb = safeNumber(dist[current.state], 0);
      const predicted = predictMostLikelyState(dist);
      const isCorrect = predicted === current.state ? 1 : 0;

      const brier = states.reduce((sum, state) => {
        const y = state === current.state ? 1 : 0;
        const p = safeNumber(dist[state], 0);
        return sum + ((p - y) ** 2);
      }, 0);

      samples.push({
        confidence: maxProb,
        true_prob: trueProb,
        correct: isCorrect,
        brier,
      });
    }
  }

  if (samples.length === 0) {
    return {
      brier: null,
      ece: null,
      samples: 0,
    };
  }

  const brier = samples.reduce((sum, item) => sum + item.brier, 0) / samples.length;

  const buckets = new Array(safeBins).fill(null).map(() => ({
    count: 0,
    confidence_sum: 0,
    accuracy_sum: 0,
  }));

  for (const item of samples) {
    const bin = Math.min(safeBins - 1, Math.floor(item.confidence * safeBins));
    buckets[bin].count += 1;
    buckets[bin].confidence_sum += item.confidence;
    buckets[bin].accuracy_sum += item.correct;
  }

  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.count === 0) {
      continue;
    }

    const conf = bucket.confidence_sum / bucket.count;
    const acc = bucket.accuracy_sum / bucket.count;
    ece += (bucket.count / samples.length) * Math.abs(acc - conf);
  }

  return {
    brier,
    ece,
    samples: samples.length,
  };
};

module.exports = {
  predictNextStateDist,
  predictStateDistKSteps,
  predictMostLikelyState,
  computeSequenceLogLikelihood,
  computeNextStateAccuracy,
  computeCalibrationStats,
};
