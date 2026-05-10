const { EMA_TRENDS } = require('./signalBuilder');

const EMA_CALIBRATION_DEFAULTS = Object.freeze({
  method: 'linear',
  linear: {
    '1W': { slope: 0.9, intercept: 0.05 },
    '1M': { slope: 0.95, intercept: 0.025 },
    default: { slope: 0.9, intercept: 0.05 },
  },
  platt: {
    '1W': { a: 1.0, b: 0.0 },
    '1M': { a: 0.9, b: 0.0 },
    default: { a: 1.0, b: 0.0 },
  },
});

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

const resolveHorizonConfig = (profile = {}, horizon = '1W') => {
  const token = String(horizon || '').trim().toUpperCase();
  return profile[token] || profile.default || {};
};

const calibrateScore = (rawScore, {
  horizon = '1W',
  method = EMA_CALIBRATION_DEFAULTS.method,
  calibration = EMA_CALIBRATION_DEFAULTS,
} = {}) => {
  const score = clamp(toNumber(rawScore, 0.5), 0, 1);
  const normalizedMethod = String(method || 'linear').trim().toLowerCase();

  if (normalizedMethod === 'platt') {
    const plattConfig = resolveHorizonConfig(calibration?.platt || {}, horizon);
    const a = toNumber(plattConfig.a, 1);
    const b = toNumber(plattConfig.b, 0);

    const epsilon = 1e-6;
    const logit = Math.log(clamp(score, epsilon, 1 - epsilon) / (1 - clamp(score, epsilon, 1 - epsilon)));
    const calibrated = clamp(sigmoid((a * logit) + b), 0, 1);
    return roundSix(calibrated);
  }

  const linearConfig = resolveHorizonConfig(calibration?.linear || {}, horizon);
  const slope = toNumber(linearConfig.slope, 1);
  const intercept = toNumber(linearConfig.intercept, 0);

  const calibrated = clamp((slope * score) + intercept, 0, 1);
  return roundSix(calibrated);
};

const resolveTrend = ({
  score,
  strength,
  trend = EMA_TRENDS.NEUTRAL,
} = {}) => {
  const safeScore = clamp(toNumber(score, 0.5), 0, 1);
  const safeStrength = clamp(toNumber(strength, 0), 0, 1);
  if (safeStrength < 0.05 || (safeScore > 0.45 && safeScore < 0.55)) {
    return EMA_TRENDS.NEUTRAL;
  }

  if (safeScore >= 0.55) {
    return EMA_TRENDS.UP;
  }

  if (safeScore <= 0.45) {
    return EMA_TRENDS.DOWN;
  }

  return String(trend || EMA_TRENDS.NEUTRAL).trim().toUpperCase() || EMA_TRENDS.NEUTRAL;
};

const calibrateSignal = (signal = {}, {
  method = EMA_CALIBRATION_DEFAULTS.method,
  calibration = EMA_CALIBRATION_DEFAULTS,
} = {}) => {
  const horizon = String(signal?.horizon || '1W').trim().toUpperCase() || '1W';
  const calibratedScore = calibrateScore(signal?.ema_score_raw, {
    horizon,
    method,
    calibration,
  });

  const strength = clamp(toNumber(signal?.strength, 0), 0, 1);
  const trend = resolveTrend({
    score: calibratedScore,
    strength,
    trend: signal?.trend,
  });

  return {
    ema_score: calibratedScore,
    trend,
    strength: roundSix(strength),
    horizon,
    calibration: {
      method: String(method || calibration?.method || 'linear').trim().toLowerCase(),
    },
    diagnostics: signal?.diagnostics || null,
  };
};

module.exports = {
  EMA_CALIBRATION_DEFAULTS,
  calibrateScore,
  calibrateSignal,
};
