const { FEATURE_KEYS } = require('./featureBuilder');

const FEATURE_FALLBACK_RULES = Object.freeze({
  sales_velocity: {
    strategy: 'historical_average',
    default_value: 0,
  },
  stock_position: {
    strategy: 'minimum_safe_level',
    default_value: 7,
  },
  lead_time: {
    strategy: 'default_constant',
    default_value: 7,
  },
  volatility: {
    strategy: 'historical_proxy',
    default_value: 0,
  },
  queue_pressure: {
    strategy: 'neutral_pressure',
    default_value: 0.5,
  },
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

const avg = (values = []) => {
  const safeValues = Array.isArray(values)
    ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];

  if (safeValues.length === 0) {
    return NaN;
  }

  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
};

const extractSalesAverage = (context = {}) => {
  const explicit = toNumber(context.historical_average_sales_velocity, NaN);
  if (Number.isFinite(explicit)) {
    return explicit;
  }

  const velocity30 = toNumber(context.velocity_30d, NaN);
  if (Number.isFinite(velocity30)) {
    return velocity30;
  }

  const salesRows = Array.isArray(context.sales_rows) ? context.sales_rows : [];
  const values = salesRows
    .map((row) => {
      if (typeof row === 'number') {
        return row;
      }
      if (!row || typeof row !== 'object') {
        return NaN;
      }
      return Number(row.units_sold ?? row.quantity ?? row.demand ?? row.volume ?? row.value);
    });

  return avg(values);
};

const extractQueueFallback = (context = {}) => {
  const backlog = Math.max(0, toNumber(context.backlog_orders, NaN));
  const pending = Math.max(0, toNumber(context.pending_demand, NaN));
  const supply = Math.max(0, toNumber(context.supply_capacity, NaN));

  if (Number.isFinite(backlog) || Number.isFinite(pending) || Number.isFinite(supply)) {
    const numerator = (Number.isFinite(backlog) ? backlog : 0) + (Number.isFinite(pending) ? pending : 0);
    const denominator = Math.max(1, Number.isFinite(supply) ? supply : 1);
    return numerator / denominator;
  }

  const congestion = toNumber(context?.queue_features?.congestion, NaN);
  if (Number.isFinite(congestion)) {
    return congestion;
  }

  return NaN;
};

const applyFallbacks = (features = {}, context = {}) => {
  const safeFeatures = features && typeof features === 'object' ? features : {};
  const normalized = {};
  const appliedFallbacks = [];

  for (const key of FEATURE_KEYS) {
    const value = toNumber(safeFeatures[key], NaN);
    if (Number.isFinite(value) && value >= 0) {
      normalized[key] = roundSix(value);
      continue;
    }

    let fallbackValue = NaN;

    if (key === 'sales_velocity') {
      fallbackValue = extractSalesAverage(context);
      if (!Number.isFinite(fallbackValue)) {
        fallbackValue = FEATURE_FALLBACK_RULES.sales_velocity.default_value;
      }
    } else if (key === 'stock_position') {
      fallbackValue = toNumber(context.minimum_safe_stock_level, NaN);
      if (!Number.isFinite(fallbackValue)) {
        fallbackValue = FEATURE_FALLBACK_RULES.stock_position.default_value;
      }
    } else if (key === 'lead_time') {
      fallbackValue = toNumber(context.default_lead_time_days, NaN);
      if (!Number.isFinite(fallbackValue)) {
        fallbackValue = FEATURE_FALLBACK_RULES.lead_time.default_value;
      }
    } else if (key === 'volatility') {
      fallbackValue = toNumber(context.historical_volatility, NaN);
      if (!Number.isFinite(fallbackValue)) {
        const salesVelocity = toNumber(normalized.sales_velocity, NaN);
        fallbackValue = Number.isFinite(salesVelocity)
          ? Math.max(0, salesVelocity * 0.15)
          : FEATURE_FALLBACK_RULES.volatility.default_value;
      }
    } else if (key === 'queue_pressure') {
      fallbackValue = extractQueueFallback(context);
      if (!Number.isFinite(fallbackValue)) {
        fallbackValue = FEATURE_FALLBACK_RULES.queue_pressure.default_value;
      }
    }

    normalized[key] = roundSix(Math.max(0, Number.isFinite(fallbackValue) ? fallbackValue : 0));
    appliedFallbacks.push({
      field: key,
      strategy: FEATURE_FALLBACK_RULES[key]?.strategy || 'default',
      value: normalized[key],
    });
  }

  return {
    features: normalized,
    applied_fallbacks: appliedFallbacks,
  };
};

module.exports = {
  FEATURE_FALLBACK_RULES,
  applyFallbacks,
};
