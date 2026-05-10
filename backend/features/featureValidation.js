const { FEATURE_KEYS } = require('./featureBuilder');

const FEATURE_VALIDATION_RULES = Object.freeze({
  type: 'all_numeric',
  ranges: {
    sales_velocity: { min: 0, max: 1000000 },
    stock_position: { min: 0, max: 3650 },
    lead_time: { min: 0, max: 365 },
    volatility: { min: 0, max: 1000000 },
    queue_pressure: { min: 0, max: 100 },
  },
  outlier_policy: 'clamp_to_max',
});

const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return Number(Number(value).toFixed(6));
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const validateFeatures = (features = {}, {
  sanitize = true,
} = {}) => {
  const safeFeatures = features && typeof features === 'object' ? features : {};
  const issues = [];
  const normalized = {};

  for (const key of FEATURE_KEYS) {
    const bounds = FEATURE_VALIDATION_RULES.ranges[key] || { min: 0, max: 1000000 };
    const raw = toNumber(safeFeatures[key], NaN);

    if (!Number.isFinite(raw)) {
      issues.push({
        field: key,
        level: 'error',
        reason: 'missing_or_not_numeric',
      });

      normalized[key] = NaN;
      continue;
    }

    if (raw < bounds.min) {
      issues.push({
        field: key,
        level: 'error',
        reason: 'below_minimum',
        min: bounds.min,
        actual: raw,
      });
    }

    if (raw > bounds.max) {
      issues.push({
        field: key,
        level: 'warning',
        reason: 'outlier_above_max',
        max: bounds.max,
        actual: raw,
      });
    }

    const value = sanitize
      ? clamp(raw, bounds.min, bounds.max)
      : raw;

    normalized[key] = roundSix(value);
  }

  const valid = issues.every((issue) => issue.level !== 'error');

  return {
    valid,
    features: normalized,
    issues,
  };
};

module.exports = {
  FEATURE_VALIDATION_RULES,
  validateFeatures,
};
