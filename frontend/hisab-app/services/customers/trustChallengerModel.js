import { TRUST_CHALLENGER_MODEL } from './models/trustChallengerModel.v1.js';
import { TRUST_SEGMENT_PROMOTION } from './models/trustSegmentPromotion.v1.js';
import {
  FEATURE_RISK_ORIENTATION,
  selectTopContributingFactors,
} from './trustExplainability.js';

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

const computeVariance = (values) => {
  if (!Array.isArray(values) || values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => {
    const diff = value - mean;
    return sum + (diff * diff);
  }, 0) / values.length;

  return variance;
};

const FEATURE_GAINS_CACHE = new WeakMap();

const riskLevelFromProbability = (probability, thresholds) => {
  if (probability >= thresholds.high_risk_min) {
    return 'HIGH';
  }

  if (probability >= thresholds.medium_risk_min) {
    return 'MEDIUM';
  }

  return 'LOW';
};

const getFeatureArray = (featureVector, model) => {
  const order = Array.isArray(model?.feature_order) ? model.feature_order : [];
  return order.map((featureKey) => toFinite(featureVector?.[featureKey], 0));
};

const evaluateTreeNode = (node, featureValues) => {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  if (Object.prototype.hasOwnProperty.call(node, 'leaf_value')) {
    return toFinite(node.leaf_value, 0);
  }

  const splitFeature = Math.trunc(toFinite(node.split_feature, -1));
  const threshold = toFinite(node.threshold, 0);
  const defaultLeft = Boolean(node.default_left);
  const decisionType = typeof node.decision_type === 'string' ? node.decision_type : '<=';
  const featureValue = featureValues[splitFeature];
  const isMissing = !Number.isFinite(featureValue);

  let goLeft = defaultLeft;
  if (!isMissing) {
    if (decisionType === '<=') {
      goLeft = featureValue <= threshold;
    } else if (decisionType === '<') {
      goLeft = featureValue < threshold;
    } else if (decisionType === '>') {
      goLeft = featureValue > threshold;
    } else if (decisionType === '>=') {
      goLeft = featureValue >= threshold;
    } else {
      goLeft = featureValue <= threshold;
    }
  }

  const nextNode = goLeft ? node.left_child : node.right_child;
  return evaluateTreeNode(nextNode, featureValues);
};

const accumulateSplitGains = (node, gainByIndex) => {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(node, 'leaf_value')) {
    return;
  }

  const featureIndex = Math.trunc(toFinite(node.split_feature, -1));
  const splitGain = Math.max(0, toFinite(node.split_gain, 0));
  if (featureIndex >= 0) {
    gainByIndex.set(featureIndex, (gainByIndex.get(featureIndex) || 0) + splitGain);
  }

  accumulateSplitGains(node.left_child, gainByIndex);
  accumulateSplitGains(node.right_child, gainByIndex);
};

const getFeatureGainWeights = (model) => {
  if (!model || typeof model !== 'object') {
    return [];
  }

  const cached = FEATURE_GAINS_CACHE.get(model);
  if (cached) {
    return cached;
  }

  const featureOrder = Array.isArray(model?.feature_order) ? model.feature_order : [];
  const gainsByIndex = new Map();
  const trees = Array.isArray(model?.model_dump?.tree_info)
    ? model.model_dump.tree_info
    : [];

  for (const tree of trees) {
    accumulateSplitGains(tree?.tree_structure, gainsByIndex);
  }

  const totalGain = [...gainsByIndex.values()].reduce((sum, value) => sum + value, 0);
  const defaultWeight = featureOrder.length > 0 ? 1 / featureOrder.length : 0;
  const weights = featureOrder.map((_, index) => {
    if (totalGain > 0) {
      return (gainsByIndex.get(index) || 0) / totalGain;
    }

    return defaultWeight;
  });

  FEATURE_GAINS_CACHE.set(model, weights);
  return weights;
};

const getFeatureMinMax = (model, featureIndex) => {
  const featureInfo = model?.model_dump?.feature_infos?.[`Column_${featureIndex}`];
  const min = toFinite(featureInfo?.min_value, 0);
  const max = toFinite(featureInfo?.max_value, min + 1);

  if (max > min) {
    return { min, max };
  }

  return { min, max: min + 1 };
};

const buildChallengerContributingFactors = (featureVector, model) => {
  const featureOrder = Array.isArray(model?.feature_order) ? model.feature_order : [];
  const featureWeights = getFeatureGainWeights(model);

  const candidates = featureOrder.map((feature, index) => {
    const orientation = toFinite(FEATURE_RISK_ORIENTATION?.[feature], 1) >= 0 ? 1 : -1;
    const value = toFinite(featureVector?.[feature], 0);
    const { min, max } = getFeatureMinMax(model, index);
    const halfRange = Math.max((max - min) / 2, 0.000001);
    const midpoint = min + halfRange;
    const centered = clamp((value - midpoint) / halfRange, -1, 1);
    const riskSignal = centered * orientation;
    const impactValue = riskSignal * toFinite(featureWeights[index], 0);

    return {
      feature,
      impactValue,
    };
  });

  return selectTopContributingFactors(candidates, { minFactors: 3, maxFactors: 5 });
};

const evaluateBoosterRawLogit = (featureVector, model) => {
  const featureValues = getFeatureArray(featureVector, model);
  const trees = Array.isArray(model?.model_dump?.tree_info)
    ? model.model_dump.tree_info
    : [];

  let rawLogit = 0;
  const treeOutputs = [];

  for (const tree of trees) {
    const treeOutput = evaluateTreeNode(tree?.tree_structure, featureValues);
    treeOutputs.push(treeOutput);
    rawLogit += treeOutput;
  }

  return {
    rawLogit,
    treeOutputs,
  };
};

export const isChallengerPreferredForVolatileSegment = (model = TRUST_CHALLENGER_MODEL) => {
  if (!isChallengerPromotedForSegment('rich_volatile')) {
    return false;
  }

  const segment = model?.segment_analysis?.high_volatility_users;
  if (!segment || !segment?.champion || !segment?.challenger) {
    return false;
  }

  const championAucPr = toFinite(segment.champion.auc_pr, 0);
  const challengerAucPr = toFinite(segment.challenger.auc_pr, 0);
  const championBrier = toFinite(segment.champion.brier, Number.POSITIVE_INFINITY);
  const challengerBrier = toFinite(segment.challenger.brier, Number.POSITIVE_INFINITY);

  return challengerAucPr >= championAucPr && challengerBrier <= championBrier;
};

export const isChallengerPromotedForSegment = (
  segmentKey,
  promotionArtifact = TRUST_SEGMENT_PROMOTION
) => {
  if (typeof segmentKey !== 'string' || !segmentKey.trim()) {
    return false;
  }

  const segmentDecision = promotionArtifact?.segment_decisions?.[segmentKey] || null;
  return segmentDecision?.promoted === true;
};

export const predictChallengerTrust = (featureVector, model = TRUST_CHALLENGER_MODEL) => {
  const { rawLogit, treeOutputs } = evaluateBoosterRawLogit(featureVector, model);
  const rawProbability = clamp(sigmoid(rawLogit), 0, 1);

  const calibration = model?.calibration || {};
  const probability = applyCalibration(rawLogit, calibration);

  const thresholds = {
    medium_risk_min: toFinite(model?.probability_thresholds?.medium_risk_min, 0.4),
    high_risk_min: toFinite(model?.probability_thresholds?.high_risk_min, 0.7),
  };

  const riskLevel = riskLevelFromProbability(probability, thresholds);
  const trustScore = clamp(Math.round((1 - probability) * 100), 0, 100);
  const marginConfidence = clamp(Math.abs(probability - 0.5) * 2, 0, 1);
  const ensembleVariance = Math.max(0, computeVariance(treeOutputs));
  const normalizedVariance = ensembleVariance / (ensembleVariance + 0.25);
  const ensembleConfidence = clamp(1 - normalizedVariance, 0, 1);
  const confidence = clamp((marginConfidence * 0.7) + (ensembleConfidence * 0.3), 0, 1);
  const contributingFactors = buildChallengerContributingFactors(featureVector, model);
  const explanation = 'Challenger LightGBM score based on repayment behavior signals.';

  return {
    probability: round(probability, 6),
    raw_probability: round(rawProbability, 6),
    confidence: round(confidence, 6),
    confidence_components: {
      margin_confidence: round(marginConfidence, 6),
      ensemble_confidence: round(ensembleConfidence, 6),
      ensemble_variance: round(ensembleVariance, 6),
    },
    riskLevel,
    trustScore,
    contributions: null,
    contributing_factors: contributingFactors,
    explanation,
    reasons: [explanation],
    modelVersion: model?.version || 'unknown',
    modelName: model?.model_name || 'hisab_trust_challenger',
  };
};

export const TRUST_CHALLENGER_MODEL_FEATURES = [...(TRUST_CHALLENGER_MODEL?.feature_order || [])];