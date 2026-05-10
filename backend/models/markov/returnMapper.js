const { createSeededRng } = require('./simulator');

const STATE_RETURN_CONFIG = Object.freeze({
  LIQUIDITY_STRESS: { mean: -0.009, std: 0.018 },
  QUEUE_PRESSURE: { mean: -0.004, std: 0.014 },
  HIGH_VOLATILITY: { mean: 0.0, std: 0.022 },
  STRONG_UPTREND: { mean: 0.006, std: 0.01 },
  RECOVERY_PHASE: { mean: 0.0045, std: 0.013 },
  WEAK_UPTREND: { mean: 0.003, std: 0.009 },
  DOWNTREND: { mean: -0.006, std: 0.012 },
  SIDEWAYS_STABLE: { mean: 0.0008, std: 0.006 },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const standardNormal = (rng) => {
  let u = 0;
  let v = 0;

  while (u <= Number.EPSILON) {
    u = rng();
  }
  while (v <= Number.EPSILON) {
    v = rng();
  }

  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const sampleStepReturn = ({ state, rng }) => {
  const token = String(state || '').trim().toUpperCase();
  const profile = STATE_RETURN_CONFIG[token] || STATE_RETURN_CONFIG.SIDEWAYS_STABLE;

  const noise = standardNormal(rng);
  const value = profile.mean + (profile.std * noise);

  return clamp(value, -0.2, 0.2);
};

const computePathReturn = ({ path = [], rng }) => {
  if (!Array.isArray(path) || path.length <= 1) {
    return 0;
  }

  let cumulative = 1;
  for (let i = 1; i < path.length; i += 1) {
    const stepReturn = sampleStepReturn({
      state: path[i],
      rng,
    });
    cumulative *= (1 + stepReturn);
  }

  return cumulative - 1;
};

const computeReturns = ({
  paths = [],
  simulationCount = null,
  terminalStateCounts = null,
  seed = null,
} = {}) => {
  const rng = createSeededRng(seed ? `${seed}:returns` : null);

  const sourcePaths = Array.isArray(paths) ? paths : [];
  const targetCount = Number(simulationCount)
    ? Math.min(sourcePaths.length, Math.max(1, Math.trunc(Number(simulationCount))))
    : sourcePaths.length;

  const returns = [];
  for (let i = 0; i < targetCount; i += 1) {
    const path = sourcePaths[i] || [];
    returns.push(computePathReturn({ path, rng }));
  }

  return {
    returns,
    terminal_state_counts: terminalStateCounts || null,
  };
};

module.exports = {
  STATE_RETURN_CONFIG,
  sampleStepReturn,
  computePathReturn,
  computeReturns,
};
