const { computeEMA, normalizeSeries } = require('./emaCalculator');

const EMA_TRENDS = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
  NEUTRAL: 'NEUTRAL',
});

const EMA_HORIZONS = Object.freeze(['1W', '1M']);

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

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const getHorizonProfile = (horizon = '1W') => {
  const token = String(horizon || '').trim().toUpperCase();
  if (token === '1M') {
    return {
      horizon: '1M',
      shortPeriod: 7,
      longPeriod: 30,
      stabilityDamping: 0.78,
      trendNeutralBand: 0.08,
      weights: {
        slopeShort: 1.1,
        slopeLong: 1.7,
        crossoverStrength: 2.1,
        crossoverDirection: 0.4,
      },
    };
  }

  return {
    horizon: '1W',
    shortPeriod: 7,
    longPeriod: 30,
    stabilityDamping: 0.9,
    trendNeutralBand: 0.06,
    weights: {
      slopeShort: 1.6,
      slopeLong: 1.1,
      crossoverStrength: 1.8,
      crossoverDirection: 0.5,
    },
  };
};

const normalizeScale = ({
  longCurrent,
  volatility,
} = {}) => {
  const longAbs = Math.abs(toNumber(longCurrent, 0));
  const vol = Math.abs(toNumber(volatility, 0));

  return Math.max(1e-6, longAbs * 0.01, vol * 0.25, 0.0001);
};

const normalizeSignalByScale = (value, scale) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp(value / Math.max(1e-6, scale), -5, 5);
};

const resolveTrend = ({
  calibratedScore,
  crossoverStrength,
  profile,
} = {}) => {
  const score = clamp(toNumber(calibratedScore, 0.5), 0, 1);
  const strength = Math.abs(toNumber(crossoverStrength, 0));
  const neutralBand = toNumber(profile?.trendNeutralBand, 0.07);

  if (strength <= neutralBand || (score > 0.45 && score < 0.55)) {
    return EMA_TRENDS.NEUTRAL;
  }

  if (score >= 0.55) {
    return EMA_TRENDS.UP;
  }

  if (score <= 0.45) {
    return EMA_TRENDS.DOWN;
  }

  return EMA_TRENDS.NEUTRAL;
};

const generateSignal = ({
  series = [],
  horizon = '1W',
  volatility = 0,
  key = 'value',
} = {}) => {
  const profile = getHorizonProfile(horizon);
  const normalizedSeries = normalizeSeries(series, { key });

  if (normalizedSeries.length < 2) {
    return {
      ema_score_raw: 0.5,
      trend: EMA_TRENDS.NEUTRAL,
      strength: 0,
      horizon: profile.horizon,
      diagnostics: {
        short_period: profile.shortPeriod,
        long_period: profile.longPeriod,
        data_points: normalizedSeries.length,
        reason: 'insufficient_series_length',
      },
    };
  }

  const emaShort = computeEMA(normalizedSeries, { period: profile.shortPeriod });
  const emaLong = computeEMA(normalizedSeries, { period: profile.longPeriod });

  const slopeShort = toNumber(emaShort.slope, 0);
  const slopeLong = toNumber(emaLong.slope, 0);
  const difference = toNumber(emaShort.current, 0) - toNumber(emaLong.current, 0);

  const scale = normalizeScale({
    longCurrent: emaLong.current,
    volatility,
  });

  const slopeShortNorm = normalizeSignalByScale(slopeShort, scale);
  const slopeLongNorm = normalizeSignalByScale(slopeLong, scale);
  const crossoverStrengthRaw = normalizeSignalByScale(difference, scale);
  const crossoverStrength = Math.tanh(crossoverStrengthRaw * toNumber(profile.stabilityDamping, 0.85));

  const crossoverDirection = difference > 0
    ? 1
    : difference < 0
      ? -1
      : 0;

  const rawLinear =
    (toNumber(profile.weights?.slopeShort, 1.5) * slopeShortNorm)
    + (toNumber(profile.weights?.slopeLong, 1.3) * slopeLongNorm)
    + (toNumber(profile.weights?.crossoverStrength, 1.8) * crossoverStrength)
    + (toNumber(profile.weights?.crossoverDirection, 0.4) * crossoverDirection);

  const scoreRaw = clamp(sigmoid(rawLinear), 0, 1);
  const strength = clamp(Math.abs(crossoverStrength), 0, 1);

  return {
    ema_score_raw: roundSix(scoreRaw),
    trend: resolveTrend({
      calibratedScore: scoreRaw,
      crossoverStrength,
      profile,
    }),
    strength: roundSix(strength),
    horizon: profile.horizon,
    diagnostics: {
      short_period: profile.shortPeriod,
      long_period: profile.longPeriod,
      slope_short: roundSix(slopeShort),
      slope_long: roundSix(slopeLong),
      difference: roundSix(difference),
      normalized_scale: roundSix(scale),
      crossover_strength: roundSix(crossoverStrength),
      crossover_direction: crossoverDirection,
      data_points: normalizedSeries.length,
    },
  };
};

module.exports = {
  EMA_HORIZONS,
  EMA_TRENDS,
  getHorizonProfile,
  generateSignal,
};
