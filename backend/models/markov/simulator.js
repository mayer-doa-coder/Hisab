const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeDistribution = (distribution = {}, states = []) => {
  const result = {};
  let sum = 0;

  for (const state of states) {
    const value = Math.max(0, toNumber(distribution[state], 0));
    result[state] = value;
    sum += value;
  }

  if (sum <= 0) {
    const uniform = 1 / Math.max(1, states.length);
    for (const state of states) {
      result[state] = uniform;
    }
    return result;
  }

  for (const state of states) {
    result[state] = result[state] / sum;
  }

  return result;
};

const createSeededRng = (seedInput) => {
  const seedStr = String(seedInput || '').trim();
  if (!seedStr) {
    return Math.random;
  }

  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i += 1) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleFromDistribution = ({ distribution = {}, states = [], rng }) => {
  const random = clamp(toNumber(rng(), 0), 0, 0.999999999999);
  let cumulative = 0;

  for (const state of states) {
    cumulative += toNumber(distribution[state], 0);
    if (random <= cumulative) {
      return state;
    }
  }

  return states[states.length - 1] || null;
};

const simulatePaths = ({
  currentState,
  transitionMatrix,
  states = [],
  horizonSteps = 7,
  simulationCount = 1000,
  seed = null,
  queueFeatures = null,
  adjustmentFn = null,
  maxStoredPaths = 40,
} = {}) => {
  const safeStates = Array.isArray(states) ? states : [];
  const safeCurrentState = String(currentState || '').trim().toUpperCase();
  const safeHorizon = Math.max(1, Math.trunc(Number(horizonSteps) || 1));
  const safeSimulationCount = Math.max(1, Math.trunc(Number(simulationCount) || 1));
  const safeStoreCount = Math.max(0, Math.trunc(Number(maxStoredPaths) || 0));

  const rng = createSeededRng(seed);
  const allPaths = [];
  const paths = [];
  const terminalStateCounts = {};
  const adjustmentReasonCounter = {};

  for (const state of safeStates) {
    terminalStateCounts[state] = 0;
  }

  for (let n = 0; n < safeSimulationCount; n += 1) {
    let state = safeStates.includes(safeCurrentState)
      ? safeCurrentState
      : (safeStates[0] || 'SIDEWAYS_STABLE');

    const path = [state];

    for (let step = 0; step < safeHorizon; step += 1) {
      const baseDist = normalizeDistribution(transitionMatrix?.[state] || {}, safeStates);
      const adjustment = typeof adjustmentFn === 'function'
        ? adjustmentFn({
          baseDistribution: baseDist,
          queueFeatures,
          states: safeStates,
        })
        : {
          distribution: baseDist,
          adjustment_applied: false,
          adjustment_reason: [],
        };

      const nextDist = normalizeDistribution(adjustment?.distribution || baseDist, safeStates);
      const nextState = sampleFromDistribution({
        distribution: nextDist,
        states: safeStates,
        rng,
      });

      if (Array.isArray(adjustment?.adjustment_reason)) {
        for (const reason of adjustment.adjustment_reason) {
          const key = String(reason || '').trim();
          if (!key) {
            continue;
          }
          adjustmentReasonCounter[key] = (adjustmentReasonCounter[key] || 0) + 1;
        }
      }

      state = nextState;
      path.push(state);
    }

    terminalStateCounts[state] = (terminalStateCounts[state] || 0) + 1;
    allPaths.push(path);
    if (paths.length < safeStoreCount) {
      paths.push(path);
    }
  }

  const adjustmentReason = Object.entries(adjustmentReasonCounter)
    .sort((a, b) => b[1] - a[1])
    .map(([text]) => text)
    .slice(0, 4);

  return {
    all_paths: allPaths,
    paths,
    terminal_state_counts: terminalStateCounts,
    simulation_count: safeSimulationCount,
    horizon_steps: safeHorizon,
    seed: seed || null,
    adjustment_reason: adjustmentReason,
  };
};

module.exports = {
  createSeededRng,
  simulatePaths,
};
