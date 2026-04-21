const { QUEUE_ADJUSTMENT_CONFIG } = require('../../config/queueAdjustment');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeDistribution = (distribution = {}, states = []) => {
  const normalized = {};
  let sum = 0;

  for (const state of states) {
    const value = Math.max(0, toNumber(distribution[state], 0));
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

const normalizeQueueFeatures = (features = {}, config = QUEUE_ADJUSTMENT_CONFIG) => {
  const ranges = config.normalization || {};

  const arrivalRate = Math.max(0, toNumber(features.arrival_rate, 0));
  const serviceRate = Math.max(0, toNumber(features.service_rate, 0));
  const imbalance = clamp(toNumber(features.imbalance_pressure, 0), -1, 1);
  const congestion = clamp(toNumber(features.congestion, 0), 0, 1);
  const spreadStress = Math.max(0, toNumber(features.spread_stress, 0));
  const executionDelay = Math.max(0, toNumber(features.execution_delay, 0));

  const normalized = {
    imbalance_pressure_signed: imbalance,
    imbalance_pressure_abs: clamp(
      Math.abs(imbalance) / Math.max(0.000001, toNumber(ranges.imbalance_pressure_abs_max, 1)),
      0,
      1
    ),
    arrival_rate: clamp(
      arrivalRate / Math.max(0.000001, toNumber(ranges.arrival_rate_ref, 5)),
      0,
      1
    ),
    service_rate: clamp(
      serviceRate / Math.max(0.000001, toNumber(ranges.service_rate_ref, 5)),
      0,
      1
    ),
    congestion: clamp(
      congestion / Math.max(0.000001, toNumber(ranges.congestion_max, 1)),
      0,
      1
    ),
    spread_stress: clamp(
      spreadStress / Math.max(0.000001, toNumber(ranges.spread_stress_ref, 0.03)),
      0,
      1
    ),
    execution_delay: clamp(
      executionDelay / Math.max(0.000001, toNumber(ranges.execution_delay_ref_hours, 72)),
      0,
      1
    ),
  };

  normalized.arrival_over_service = clamp(
    normalized.arrival_rate - normalized.service_rate,
    -1,
    1
  );

  return normalized;
};

const computeStateAdjustmentScore = ({
  state,
  normalizedFeatures,
  config,
}) => {
  const stateRule = config.stateInfluence?.[state] || {};
  const weights = config.weights || {};

  const directionalImbalance = normalizedFeatures.imbalance_pressure_signed
    * toNumber(stateRule.imbalance_directional, 0)
    * toNumber(weights.imbalance_pressure, 0);

  const score =
    (toNumber(stateRule.congestion, 0) * normalizedFeatures.congestion * toNumber(weights.congestion, 0))
    + (toNumber(stateRule.execution_delay, 0) * normalizedFeatures.execution_delay * toNumber(weights.execution_delay, 0))
    + (toNumber(stateRule.service_rate, 0) * normalizedFeatures.service_rate * toNumber(weights.service_rate, 0))
    + (toNumber(stateRule.spread_stress, 0) * normalizedFeatures.spread_stress * toNumber(weights.spread_stress, 0))
    + (toNumber(stateRule.arrival_over_service, 0) * normalizedFeatures.arrival_over_service * toNumber(weights.arrival_rate, 0))
    + directionalImbalance;

  return clamp(score, -toNumber(config.maxLinearImpact, 0.25), toNumber(config.maxLinearImpact, 0.25));
};

const validateAdjustedDistribution = (distribution = {}, states = []) => {
  const values = states.map((state) => toNumber(distribution[state], -1));
  if (values.some((value) => value < 0 || !Number.isFinite(value))) {
    return false;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number.isFinite(sum) && Math.abs(sum - 1) <= 1e-6;
};

const buildAdjustmentReasons = (normalizedFeatures) => {
  const reasons = [];

  if (normalizedFeatures.congestion >= 0.7) {
    reasons.push('High congestion increased stress and downtrend transition weights.');
  }
  if (normalizedFeatures.execution_delay >= 0.6) {
    reasons.push('High execution delay reduced recovery transition weight.');
  }
  if (normalizedFeatures.service_rate >= 0.6) {
    reasons.push('High service rate increased stable and recovery transition weights.');
  }
  if (normalizedFeatures.spread_stress >= 0.6) {
    reasons.push('High spread-depth stress increased liquidity stress transition weight.');
  }
  if (normalizedFeatures.imbalance_pressure_signed >= 0.2) {
    reasons.push('Positive imbalance pressure favored upward directional transitions.');
  } else if (normalizedFeatures.imbalance_pressure_signed <= -0.2) {
    reasons.push('Negative imbalance pressure favored downtrend transitions.');
  }

  return reasons;
};

const applyQueueAdjustment = ({
  baseDistribution,
  queueFeatures,
  states,
  config: overrideConfig = null,
} = {}) => {
  const config = {
    ...QUEUE_ADJUSTMENT_CONFIG,
    ...(overrideConfig || {}),
    weights: {
      ...(QUEUE_ADJUSTMENT_CONFIG.weights || {}),
      ...(overrideConfig?.weights || {}),
    },
    normalization: {
      ...(QUEUE_ADJUSTMENT_CONFIG.normalization || {}),
      ...(overrideConfig?.normalization || {}),
    },
    stateInfluence: {
      ...(QUEUE_ADJUSTMENT_CONFIG.stateInfluence || {}),
      ...(overrideConfig?.stateInfluence || {}),
    },
  };

  const safeBase = normalizeDistribution(baseDistribution, states);
  if (config.enabled !== true) {
    return {
      distribution: safeBase,
      adjustment_applied: false,
      adjustment_reason: ['Queue adjustment disabled by configuration.'],
      adjustment_debug: null,
    };
  }

  if (!queueFeatures || typeof queueFeatures !== 'object') {
    return {
      distribution: safeBase,
      adjustment_applied: false,
      adjustment_reason: ['Queue features missing; base Markov distribution used.'],
      adjustment_debug: null,
    };
  }

  const normalizedFeatures = normalizeQueueFeatures(queueFeatures, config);
  const rawAdjusted = {};
  const factors = {};

  for (const state of states) {
    const linearScore = computeStateAdjustmentScore({
      state,
      normalizedFeatures,
      config,
    });

    const factor = clamp(
      1 + linearScore,
      toNumber(config.minFactor, 0.7),
      toNumber(config.maxFactor, 1.3)
    );

    factors[state] = Number(factor.toFixed(6));
    rawAdjusted[state] = safeBase[state] * factor;
  }

  const distribution = normalizeDistribution(rawAdjusted, states);
  if (!validateAdjustedDistribution(distribution, states)) {
    return {
      distribution: safeBase,
      adjustment_applied: false,
      adjustment_reason: ['Queue adjustment produced invalid probabilities; reverted to base distribution.'],
      adjustment_debug: null,
    };
  }

  const reasons = buildAdjustmentReasons(normalizedFeatures);
  if (reasons.length === 0) {
    reasons.push('Queue signals near neutral; only minor bounded adjustment applied.');
  }

  return {
    distribution,
    adjustment_applied: true,
    adjustment_reason: reasons,
    adjustment_debug: {
      normalized_features: normalizedFeatures,
      factors,
      base_distribution: safeBase,
    },
  };
};

module.exports = {
  normalizeQueueFeatures,
  applyQueueAdjustment,
};
