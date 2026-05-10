const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scoreDirection = (features = {}) => {
  const z =
    -0.15
    + (1.9 * toNumber(features.imbalance_pressure, 0))
    + (0.65 * toNumber(features.service_rate, 0))
    - (0.95 * toNumber(features.congestion, 0))
    - (0.55 * toNumber(features.spread_stress, 0))
    - (0.04 * toNumber(features.execution_delay, 0));

  return sigmoid(z);
};

const scoreRisk = (features = {}) => {
  const z =
    -0.4
    + (1.25 * toNumber(features.congestion, 0))
    + (0.95 * toNumber(features.spread_stress, 0))
    + (0.08 * toNumber(features.execution_delay, 0))
    - (0.8 * toNumber(features.service_rate, 0))
    - (0.35 * Math.abs(toNumber(features.imbalance_pressure, 0)));

  return sigmoid(z);
};

const classifyDirection = (probability) => {
  const p = clamp(toNumber(probability, 0.5), 0, 1);
  if (p >= 0.62) {
    return 'IMPROVING';
  }
  if (p <= 0.38) {
    return 'WORSENING';
  }
  return 'STABLE';
};

const classifyRiskBucket = (probability) => {
  const p = clamp(toNumber(probability, 0.5), 0, 1);
  if (p >= 0.7) {
    return 'HIGH_RISK';
  }
  if (p >= 0.4) {
    return 'MEDIUM_RISK';
  }
  return 'LOW_RISK';
};

const buildLogisticDirectionPrediction = (features = {}) => {
  const probability = scoreDirection(features);
  return {
    prediction: classifyDirection(probability),
    probability: Number(probability.toFixed(6)),
    model: 'LOGISTIC',
  };
};

const buildLogisticRiskPrediction = (features = {}) => {
  const probability = scoreRisk(features);
  return {
    prediction: classifyRiskBucket(probability),
    probability: Number(probability.toFixed(6)),
    model: 'LOGISTIC',
  };
};

module.exports = {
  buildLogisticDirectionPrediction,
  buildLogisticRiskPrediction,
};
