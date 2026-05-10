import { TRUST_CHAMPION_MODEL } from './models/trustChampionModel.v1.js';
import { selectTopContributingFactors } from './trustExplainability.js';

const FEATURE_LABELS = {
  due_amount: 'due amount',
  late_count: 'late payments',
  avg_delay_days: 'payment delay',
  transaction_depth: 'transaction history',
  recency_days: 'inactivity days',
  payment_consistency: 'payment consistency',
  payment_volatility: 'payment volatility',
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sigmoid = (value) => {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
};

const applyCalibration = (rawLogit, calibration = {}) => {
  const rawProbability = clamp(sigmoid(rawLogit), 0, 1);

  if (String(calibration?.method || '').trim().toLowerCase() === 'isotonic_regression') {
    const thresholds = Array.isArray(calibration?.x_thresholds) ? calibration.x_thresholds : [];
    const values = Array.isArray(calibration?.y_values) ? calibration.y_values : [];

    if (thresholds.length > 0 && thresholds.length === values.length) {
      for (let index = 0; index < thresholds.length; index += 1) {
        const threshold = toFinite(thresholds[index], 1);
        if (rawProbability <= threshold) {
          return clamp(toFinite(values[index], rawProbability), 0, 1);
        }
      }

      return clamp(toFinite(values[values.length - 1], rawProbability), 0, 1);
    }
  }

  const plattA = toFinite(calibration?.a, 1);
  const plattB = toFinite(calibration?.b, 0);
  const baseProbability = clamp(sigmoid((plattA * rawLogit) + plattB), 0, 1);

  const blendAlpha = clamp(toFinite(calibration?.blend_alpha, 1), 0, 1);
  const blendBaseRate = clamp(toFinite(calibration?.base_rate, 0.5), 0, 1);

  return clamp((blendAlpha * baseProbability) + ((1 - blendAlpha) * blendBaseRate), 0, 1);
};

const round = (value, digits = 6) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const sortByMagnitudeDesc = (entries) => {
  return [...entries].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
};

const formatFeature = (key) => FEATURE_LABELS[key] || key;

const riskLevelFromProbability = (probability, thresholds) => {
  if (probability >= thresholds.high_risk_min) {
    return 'HIGH';
  }

  if (probability >= thresholds.medium_risk_min) {
    return 'MEDIUM';
  }

  return 'LOW';
};

const buildExplanation = (contributions) => {
  const entries = Object.entries(contributions);
  const positive = sortByMagnitudeDesc(entries.filter(([, value]) => value > 0.00001));
  const negative = sortByMagnitudeDesc(entries.filter(([, value]) => value < -0.00001));

  const up = positive.slice(0, 2).map(([key]) => formatFeature(key));
  const down = negative.slice(0, 1).map(([key]) => formatFeature(key));

  if (!up.length && !down.length) {
    return 'Customer behavior is stable and balanced.';
  }

  if (up.length && down.length) {
    return `${up.join(' and ')} increased risk, while ${down.join(' and ')} reduced risk.`;
  }

  if (up.length) {
    return `${up.join(' and ')} increased risk.`;
  }

  return `${down.join(' and ')} reduced risk.`;
};

export const calculateChampionLogit = (featureVector, model = TRUST_CHAMPION_MODEL) => {
  const featureOrder = model?.feature_order || [];
  const coefficients = model?.coefficients || {};
  const intercept = toFinite(model?.intercept, 0);

  let logit = intercept;
  const contributions = {};

  for (const key of featureOrder) {
    const value = toFinite(featureVector?.[key], 0);
    const coef = toFinite(coefficients?.[key], 0);
    const contribution = value * coef;

    contributions[key] = round(contribution, 6);
    logit += contribution;
  }

  return {
    logit,
    contributions,
  };
};

export const predictChampionTrust = (featureVector, model = TRUST_CHAMPION_MODEL) => {
  const { logit, contributions } = calculateChampionLogit(featureVector, model);
  const rawProbability = sigmoid(logit);

  const calibration = model?.calibration || {};
  const probability = applyCalibration(logit, calibration);

  const confidence = clamp(Math.abs(probability - 0.5) * 2, 0, 1);
  const thresholds = {
    medium_risk_min: toFinite(model?.probability_thresholds?.medium_risk_min, 0.4),
    high_risk_min: toFinite(model?.probability_thresholds?.high_risk_min, 0.7),
  };

  const riskLevel = riskLevelFromProbability(probability, thresholds);
  const trustScore = clamp(Math.round((1 - probability) * 100), 0, 100);
  const explanation = buildExplanation(contributions);
  const contributingFactors = selectTopContributingFactors(
    Object.entries(contributions).map(([feature, impactValue]) => ({ feature, impactValue })),
    { minFactors: 3, maxFactors: 5 }
  );

  return {
    probability: round(probability, 6),
    raw_probability: round(rawProbability, 6),
    confidence: round(confidence, 6),
    riskLevel,
    trustScore,
    contributions,
    contributing_factors: contributingFactors,
    explanation,
    reasons: [explanation],
    modelVersion: model?.version || 'unknown',
  };
};

export const TRUST_CHAMPION_MODEL_FEATURES = [...(TRUST_CHAMPION_MODEL?.feature_order || [])];
