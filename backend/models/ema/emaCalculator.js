const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return Number(Number(value).toFixed(6));
};

const computeAlpha = ({
  period = 7,
  alpha = null,
} = {}) => {
  if (alpha !== null && alpha !== undefined && String(alpha).trim() !== '') {
    const explicitAlpha = toNumber(alpha, NaN);
    if (Number.isFinite(explicitAlpha)) {
      return clamp(explicitAlpha, 0.000001, 1);
    }
  }

  const safePeriod = Math.max(1, Math.trunc(toNumber(period, 7)));
  return 2 / (safePeriod + 1);
};

const normalizeSeries = (series = [], {
  key = 'value',
} = {}) => {
  const safeSeries = Array.isArray(series) ? series : [];
  const normalized = [];

  for (const item of safeSeries) {
    if (typeof item === 'number') {
      const numeric = toNumber(item, NaN);
      if (Number.isFinite(numeric)) {
        normalized.push(numeric);
      }
      continue;
    }

    if (!item || typeof item !== 'object') {
      continue;
    }

    const numeric = toNumber(item[key], NaN);
    if (Number.isFinite(numeric)) {
      normalized.push(numeric);
    }
  }

  return normalized;
};

const computeEMA = (series = [], {
  period = 7,
  alpha = null,
  key = 'value',
} = {}) => {
  const values = normalizeSeries(series, { key });
  if (values.length === 0) {
    return {
      period: Math.max(1, Math.trunc(toNumber(period, 7))),
      alpha: computeAlpha({ period, alpha }),
      size: 0,
      series: [],
      current: null,
      previous: null,
      slope: 0,
    };
  }

  const smoothing = computeAlpha({ period, alpha });
  const emaSeries = [];

  let emaPrev = values[0];
  emaSeries.push(roundSix(emaPrev));

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    emaPrev = (smoothing * value) + ((1 - smoothing) * emaPrev);
    emaSeries.push(roundSix(emaPrev));
  }

  const current = emaSeries[emaSeries.length - 1];
  const previous = emaSeries.length >= 2 ? emaSeries[emaSeries.length - 2] : emaSeries[0];
  const slope = roundSix((current ?? 0) - (previous ?? 0));

  return {
    period: Math.max(1, Math.trunc(toNumber(period, 7))),
    alpha: roundSix(smoothing),
    size: values.length,
    series: emaSeries,
    current,
    previous,
    slope,
  };
};

module.exports = {
  computeAlpha,
  normalizeSeries,
  computeEMA,
};
