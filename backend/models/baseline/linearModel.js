const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildLinearRiskScorePrediction = (features = {}) => {
  const raw =
    0.28
    + (0.5 * toNumber(features.congestion, 0))
    + (0.3 * toNumber(features.spread_stress, 0))
    + (0.04 * toNumber(features.execution_delay, 0))
    - (0.35 * toNumber(features.service_rate, 0))
    - (0.15 * toNumber(features.imbalance_pressure, 0));

  const probability = clamp(raw, 0, 1);

  return {
    prediction: Number((probability * 100).toFixed(2)),
    probability: Number(probability.toFixed(6)),
    model: 'LINEAR',
  };
};

module.exports = {
  buildLinearRiskScorePrediction,
};
