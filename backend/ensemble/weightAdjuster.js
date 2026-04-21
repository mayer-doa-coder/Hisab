const DEFAULT_BASE_WEIGHTS = Object.freeze({
  ema: 0.34,
  threshold: 0.33,
  markov: 0.33,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeWeights = (weights = {}) => {
  const ema = Math.max(0, toNumber(weights.ema, DEFAULT_BASE_WEIGHTS.ema));
  const threshold = Math.max(0, toNumber(weights.threshold, DEFAULT_BASE_WEIGHTS.threshold));
  const markov = Math.max(0, toNumber(weights.markov, DEFAULT_BASE_WEIGHTS.markov));

  const total = ema + threshold + markov;
  if (total <= 0) {
    return { ...DEFAULT_BASE_WEIGHTS };
  }

  return {
    ema: Number((ema / total).toFixed(6)),
    threshold: Number((threshold / total).toFixed(6)),
    markov: Number((markov / total).toFixed(6)),
  };
};

const adjustWeights = ({
  baseWeights = DEFAULT_BASE_WEIGHTS,
  context = {},
  inputs = {},
} = {}) => {
  const adjusted = { ...normalizeWeights(baseWeights) };
  const reasons = [];

  const dataSparse = Boolean(context.data_sparse || context.dataSparse || false);
  const strongTrend = Boolean(context.strong_trend || context.strongTrend || false);
  const highVolatility = Boolean(context.high_volatility || context.highVolatility || false);

  const markovConfidence = clamp(toNumber(inputs?.markov?.confidence, 0), 0, 1);
  const markovUncertainty = clamp(toNumber(inputs?.markov?.uncertainty, 1), 0, 1);
  const emaScore = clamp(toNumber(inputs?.ema?.ema_score, 0.5), 0, 1);
  const emaTrend = String(inputs?.ema?.trend || '').trim().toUpperCase();

  if (markovConfidence < 0.45) {
    adjusted.markov *= 0.6;
    adjusted.threshold *= 1.2;
    reasons.push('Markov confidence low; reduced Markov influence.');
  }

  if (markovUncertainty > 0.7) {
    adjusted.markov *= 0.7;
    adjusted.threshold *= 1.15;
    reasons.push('Markov uncertainty high; shifted weight to threshold model.');
  }

  if (dataSparse) {
    adjusted.threshold *= 1.3;
    adjusted.ema *= 0.85;
    reasons.push('Sparse data detected; increased threshold weight.');
  }

  if (strongTrend || ((emaTrend === 'UP' || emaTrend === 'DOWN') && emaScore >= 0.7)) {
    adjusted.ema *= 1.2;
    reasons.push('Strong EMA trend detected; increased EMA weight.');
  }

  if (highVolatility) {
    adjusted.markov *= 1.15;
    adjusted.threshold *= 1.05;
    reasons.push('High volatility context; increased probabilistic model influence.');
  }

  const normalized = normalizeWeights(adjusted);
  return {
    weights: normalized,
    reasons,
  };
};

module.exports = {
  DEFAULT_BASE_WEIGHTS,
  normalizeWeights,
  adjustWeights,
};
