const FEATURE_EXPLANATION_LABELS = Object.freeze({
  due_amount: {
    increase_risk: 'High due amount',
    decrease_risk: 'Low due amount',
  },
  late_count: {
    increase_risk: 'Frequent late payments',
    decrease_risk: 'Few late payments',
  },
  avg_delay_days: {
    increase_risk: 'Long payment delays',
    decrease_risk: 'Fast payments',
  },
  transaction_depth: {
    increase_risk: 'Limited payment history',
    decrease_risk: 'Strong payment history',
  },
  recency_days: {
    increase_risk: 'Long time since last purchase',
    decrease_risk: 'Recent purchases',
  },
  payment_consistency: {
    increase_risk: 'Irregular payment history',
    decrease_risk: 'Good payment history',
  },
  payment_volatility: {
    increase_risk: 'Unstable payment amounts',
    decrease_risk: 'Stable payment amounts',
  },
});

const EPSILON = 0.000001;

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getDirectionFromImpact = (impactValue) => {
  return impactValue >= 0 ? 'increase_risk' : 'decrease_risk';
};

const formatImpact = (impactValue) => {
  const normalized = clamp(toFiniteNumber(impactValue, 0), -9.99, 9.99);
  const rounded = Math.round(normalized * 100) / 100;
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)}`;
};

const resolveLabel = (feature, direction, fallbackLabel = null) => {
  if (typeof fallbackLabel === 'string' && fallbackLabel.trim().length) {
    return fallbackLabel.trim();
  }

  const dictionary = FEATURE_EXPLANATION_LABELS[feature] || null;
  if (dictionary && dictionary[direction]) {
    return dictionary[direction];
  }

  return direction === 'increase_risk' ? 'Higher risk signal' : 'Lower risk signal';
};

const normalizeFactor = (factor) => {
  if (!factor || typeof factor !== 'object') {
    return null;
  }

  const feature = typeof factor.feature === 'string' ? factor.feature.trim() : '';
  if (!feature) {
    return null;
  }

  const impactValue = toFiniteNumber(factor.impactValue, Number.NaN);
  if (!Number.isFinite(impactValue)) {
    return null;
  }

  const direction = (
    factor.direction === 'increase_risk'
    || factor.direction === 'decrease_risk'
  ) ? factor.direction : getDirectionFromImpact(impactValue);

  return {
    feature,
    impactValue,
    direction,
    label: resolveLabel(feature, direction, factor.label),
  };
};

export const buildContributingFactor = ({ feature, impactValue, direction, label }) => {
  const normalized = normalizeFactor({ feature, impactValue, direction, label });
  if (!normalized) {
    return null;
  }

  return {
    feature: normalized.feature,
    impact: formatImpact(normalized.impactValue),
    direction: normalized.direction,
    label: normalized.label,
  };
};

export const selectTopContributingFactors = (factors, options = {}) => {
  const minFactors = Math.max(1, Math.min(5, Math.trunc(toFiniteNumber(options.minFactors, 3))));
  const maxFactors = Math.max(minFactors, Math.min(5, Math.trunc(toFiniteNumber(options.maxFactors, 5))));

  const normalized = (Array.isArray(factors) ? factors : [])
    .map(normalizeFactor)
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.impactValue) - Math.abs(a.impactValue));

  const nonZero = normalized.filter((factor) => Math.abs(factor.impactValue) > EPSILON);
  const selected = [];
  const source = nonZero.length ? nonZero : normalized;

  for (const factor of source) {
    if (selected.find((entry) => entry.feature === factor.feature)) {
      continue;
    }

    selected.push(factor);
    if (selected.length >= maxFactors) {
      break;
    }
  }

  if (selected.length < minFactors) {
    for (const factor of normalized) {
      if (selected.find((entry) => entry.feature === factor.feature)) {
        continue;
      }

      selected.push(factor);
      if (selected.length >= minFactors || selected.length >= maxFactors) {
        break;
      }
    }
  }

  return selected.map((factor) => ({
    feature: factor.feature,
    impact: formatImpact(factor.impactValue),
    direction: factor.direction,
    label: factor.label,
  }));
};

export const FEATURE_RISK_ORIENTATION = Object.freeze({
  due_amount: 1,
  late_count: 1,
  avg_delay_days: 1,
  transaction_depth: -1,
  recency_days: 1,
  payment_consistency: -1,
  payment_volatility: 1,
});
