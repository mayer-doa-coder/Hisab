import {
  DEFAULT_FALLBACK_POLICY,
  TRUST_FALLBACK_REASON_CODES,
  TRUST_SCORING_METHODS,
  evaluateFallbackConditions,
  logFallbackUsage,
  resolveFallbackReason,
  createStandardTrustOutput,
} from './trustFallbackPolicy.js';
import { evaluateTrustGate } from './trustGating.js';
import { predictChampionTrust } from './trustChampionModel.js';
import {
  predictChallengerTrust,
  isChallengerPreferredForVolatileSegment,
} from './trustChallengerModel.js';
import { selectTopContributingFactors } from './trustExplainability.js';

export const CUSTOMER_RISK_LEVELS = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
};

export const RISK_MODEL_TYPES = {
  RULE_BASED: 'rule-based',
  HYBRID: 'hybrid',
  ML_PRIMARY: 'ml-primary',
};

export const TRUST_MODEL_FEATURE_FLAGS = Object.freeze({
  enable_new_scoring: true,
  rollout_percentage: 5,
  use_challenger_model: false,
  shadow_mode: false,
  prefer_explicit_primary_prediction: true,
});

const RISK_LEVEL_TOKENS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

const ML_PRIMARY_REASON = 'MODEL_PREDICTION';

const PRIMARY_MODEL_KEYS = {
  CHAMPION: 'champion',
  CHALLENGER: 'challenger',
  CUSTOM: 'custom',
};

const ROUTING_MODEL_KEYS = {
  [TRUST_SCORING_METHODS.RULE_BASED]: 'rule-based',
  [TRUST_SCORING_METHODS.LOGISTIC]: PRIMARY_MODEL_KEYS.CHAMPION,
  [TRUST_SCORING_METHODS.LIGHTGBM]: PRIMARY_MODEL_KEYS.CHALLENGER,
};

const DEFAULT_ROUTING_CONFIG = Object.freeze({
  sparseHistoryThreshold: 3,
  richHistoryThreshold: 12,
  highVolatilityThreshold: 45,
  logisticConfidenceMin: 0.1,
  lightgbmConfidenceMin: 0.1,
  criticalFeatureKeys: ['due_amount', 'payment_consistency', 'recency_days', 'transaction_depth'],
});

const DEFAULT_ROLLOUT_DECISION = Object.freeze({
  enabled: true,
  rolloutEnabledForUser: true,
  bucket: null,
  rolloutPercentage: 100,
  rolloutStage: 'stage_4_full',
  enableNewScoring: true,
  revertTarget: 'champion',
});

const toNonNegative = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
};

const roundToTwo = (value) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
};

const toRiskLevelToken = (riskScore) => {
  const normalizedRiskScore = Math.max(0, Math.min(100, Math.trunc(toNonNegative(riskScore))));
  if (normalizedRiskScore >= 70) {
    return RISK_LEVEL_TOKENS.HIGH;
  }

  if (normalizedRiskScore >= 40) {
    return RISK_LEVEL_TOKENS.MEDIUM;
  }

  return RISK_LEVEL_TOKENS.LOW;
};

const toRiskLevelLabel = (token) => {
  if (token === RISK_LEVEL_TOKENS.HIGH) {
    return CUSTOMER_RISK_LEVELS.HIGH;
  }

  if (token === RISK_LEVEL_TOKENS.MEDIUM) {
    return CUSTOMER_RISK_LEVELS.MEDIUM;
  }

  return CUSTOMER_RISK_LEVELS.LOW;
};

const toTrustScore = (riskScore) => {
  const normalizedRiskScore = Math.max(0, Math.min(100, Math.trunc(toNonNegative(riskScore))));
  return 100 - normalizedRiskScore;
};

const normalizePrimaryPrediction = (prediction) => {
  if (!prediction || typeof prediction !== 'object') {
    return null;
  }

  const probabilityRaw = Number(
    prediction.probability
    ?? prediction.default_probability
    ?? prediction.defaultProbability
    ?? Number.NaN
  );
  const confidenceRaw = Number(
    prediction.confidence
    ?? prediction.confidence_score
    ?? prediction.confidenceScore
    ?? Number.NaN
  );

  const probability = Number.isFinite(probabilityRaw) ? Math.max(0, Math.min(1, probabilityRaw)) : null;
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;
  const reasons = Array.isArray(prediction.reasons) ? prediction.reasons : [];
  const explanation = typeof prediction.explanation === 'string' ? prediction.explanation.trim() : '';
  const riskLevelToken = typeof prediction.riskLevel === 'string' ? prediction.riskLevel.trim().toUpperCase() : null;
  const contributions = prediction.contributions && typeof prediction.contributions === 'object'
    ? prediction.contributions
    : null;
  const confidenceComponents = prediction.confidence_components && typeof prediction.confidence_components === 'object'
    ? prediction.confidence_components
    : null;
  const contributingFactors = Array.isArray(prediction.contributing_factors)
    ? prediction.contributing_factors
    : [];

  return {
    probability,
    confidence,
    reasons: reasons.length ? reasons : explanation ? [explanation] : [],
    explanation: explanation || 'Using the model prediction from customer behavior.',
    contributions,
    confidenceComponents,
    contributingFactors,
    riskLevelToken,
  };
};

const defaultFeatureValidation = {
  valid: true,
  issues: [],
};

const buildFeatureVectorFromMetrics = (metricRow) => {
  const dueAmount = toNonNegative(metricRow?.total_due);
  const numberOfTransactions = Math.trunc(toNonNegative(metricRow?.number_of_transactions));
  const numberOfLatePayments = Math.trunc(toNonNegative(metricRow?.number_of_late_payments));

  return {
    due_amount: dueAmount,
    payment_consistency: numberOfTransactions > 0
      ? Math.max(0, Math.min(1, (numberOfTransactions - numberOfLatePayments) / numberOfTransactions))
      : 0.5,
    recency_days: null,
    transaction_depth: numberOfTransactions,
  };
};

const summarizeMetrics = (metricRow) => {
  const totalDue = toNonNegative(metricRow?.total_due);
  const numberOfTransactions = Math.trunc(toNonNegative(metricRow?.number_of_transactions));
  const numberOfLatePayments = Math.trunc(toNonNegative(metricRow?.number_of_late_payments));
  const averagePaymentDelayRaw = Number(metricRow?.average_payment_delay);
  const averagePaymentDelay = Number.isFinite(averagePaymentDelayRaw) ? Math.max(0, averagePaymentDelayRaw) : null;

  return {
    total_due: roundToTwo(totalDue) || 0,
    number_of_transactions: numberOfTransactions,
    number_of_late_payments: numberOfLatePayments,
    average_payment_delay: roundToTwo(averagePaymentDelay),
  };
};

const classifyByRules = (metrics) => {
  const totalDue = toNonNegative(metrics.total_due);
  const numberOfTransactions = Math.trunc(toNonNegative(metrics.number_of_transactions));
  const numberOfLatePayments = Math.trunc(toNonNegative(metrics.number_of_late_payments));
  const averagePaymentDelayRaw = Number(metrics.average_payment_delay);
  const averagePaymentDelay = Number.isFinite(averagePaymentDelayRaw) ? Math.max(0, averagePaymentDelayRaw) : null;

  const reasons = [];
  const factorCandidates = [];
  let score = 20;

  const pushRuleFactor = (feature, impactValue, label = null) => {
    factorCandidates.push({
      feature,
      impactValue,
      label,
    });
  };

  if (totalDue >= 5000) {
    score += 50;
    reasons.push('High outstanding due amount.');
    pushRuleFactor('due_amount', 0.5, 'High due amount');
  } else if (totalDue >= 2000) {
    score += 30;
    reasons.push('Moderate outstanding due amount.');
    pushRuleFactor('due_amount', 0.3, 'High due amount');
  } else if (totalDue > 0) {
    score += 10;
    reasons.push('Some due amount exists.');
    pushRuleFactor('due_amount', 0.1, 'Some due amount');
  } else {
    pushRuleFactor('due_amount', -0.1, 'Low due amount');
  }

  if (numberOfLatePayments >= 3) {
    score += 35;
    reasons.push('Frequent late payments detected.');
    pushRuleFactor('late_count', 0.35, 'Frequent late payments');
  } else if (numberOfLatePayments >= 1) {
    score += 15;
    reasons.push('At least one late payment detected.');
    pushRuleFactor('late_count', 0.15, 'Late payments');
  } else {
    pushRuleFactor('late_count', -0.12, 'Few late payments');
  }

  if (averagePaymentDelay !== null && averagePaymentDelay >= 20) {
    score += 25;
    reasons.push('Average payment delay is high.');
    pushRuleFactor('avg_delay_days', 0.25, 'Long payment delays');
  } else if (averagePaymentDelay !== null && averagePaymentDelay >= 10) {
    score += 10;
    reasons.push('Average payment delay is moderate.');
    pushRuleFactor('avg_delay_days', 0.1, 'Slow payments');
  } else if (averagePaymentDelay !== null) {
    pushRuleFactor('avg_delay_days', -0.08, 'Fast payments');
  }

  if (numberOfTransactions <= 1 && totalDue > 0) {
    score += 10;
    reasons.push('Very limited repayment history.');
    pushRuleFactor('transaction_depth', 0.1, 'Limited payment history');
  } else if (numberOfTransactions >= 10 && totalDue === 0) {
    score -= 10;
    reasons.push('Strong transaction history with no due.');
    pushRuleFactor('transaction_depth', -0.1, 'Strong payment history');
  } else if (numberOfTransactions >= 6) {
    pushRuleFactor('transaction_depth', -0.05, 'Stable payment history');
  }

  score = Math.max(0, Math.min(100, Math.trunc(score)));
  const trustScore = 100 - score;

  const riskLevelToken = toRiskLevelToken(score);

  if (!reasons.length) {
    reasons.push('Healthy repayment pattern.');
    pushRuleFactor('payment_consistency', -0.12, 'Good payment history');
  }

  const contributingFactors = selectTopContributingFactors(factorCandidates, {
    minFactors: 3,
    maxFactors: 5,
  });

  return {
    riskLevel: toRiskLevelLabel(riskLevelToken),
    riskLevelToken,
    riskScore: score,
    trustScore,
    reasons,
    contributingFactors,
    metrics: summarizeMetrics(metrics),
  };
};

const deriveRoutingSegmentKey = (featureVector, transactionCount, routingConfig) => {
  const normalizedTransactionCount = Number.isFinite(Number(transactionCount))
    ? Math.max(0, Math.trunc(Number(transactionCount)))
    : 0;
  const volatility = Number.isFinite(Number(featureVector?.payment_volatility))
    ? Math.max(0, Number(featureVector.payment_volatility))
    : 0;

  if (normalizedTransactionCount < routingConfig.sparseHistoryThreshold) {
    return 'sparse_history';
  }

  if (
    normalizedTransactionCount >= routingConfig.richHistoryThreshold
    && volatility >= routingConfig.highVolatilityThreshold
  ) {
    return 'rich_volatile';
  }

  return 'normal_history';
};

const buildRuleOutput = (ruleResult, reasonCode) => {
  const reasonEntry = resolveFallbackReason(reasonCode);

  return createStandardTrustOutput({
    score: ruleResult.trustScore,
    riskLevel: ruleResult.riskLevelToken,
    method: TRUST_SCORING_METHODS.RULE_BASED,
    reason: reasonEntry.code,
    explanation: reasonEntry.message,
  });
};

const buildModelOutput = ({ prediction, method, reasonCode }) => {
  const reasonEntry = resolveFallbackReason(reasonCode);
  const riskScore = Math.round(Math.max(0, Math.min(1, Number(prediction?.probability || 0))) * 100);
  const trustScore = toTrustScore(riskScore);
  const riskLevelToken = (
    prediction?.riskLevelToken === 'LOW'
    || prediction?.riskLevelToken === 'MEDIUM'
    || prediction?.riskLevelToken === 'HIGH'
  )
    ? prediction.riskLevelToken
    : toRiskLevelToken(riskScore);

  return createStandardTrustOutput({
    score: trustScore,
    riskLevel: riskLevelToken,
    method,
    reason: reasonEntry.code,
    explanation: prediction?.explanation || reasonEntry.message || 'Using model prediction from customer behavior.',
    confidence: prediction?.confidence,
    probability: prediction?.probability,
  });
};

const shouldRequirePrimaryPrediction = (modelType) => {
  return modelType === RISK_MODEL_TYPES.HYBRID || modelType === RISK_MODEL_TYPES.ML_PRIMARY;
};

const hasMissingCriticalFeatures = (featureVector, criticalFeatureKeys) => {
  return (criticalFeatureKeys || []).some((key) => {
    const value = featureVector?.[key];
    return value === null || value === undefined || !Number.isFinite(Number(value));
  });
};

const resolveModelConfidenceThreshold = (selectedMethod, routingConfig) => {
  if (selectedMethod === TRUST_SCORING_METHODS.LIGHTGBM) {
    return Math.max(0, Math.min(1, Number(routingConfig.lightgbmConfidenceMin || 0.1)));
  }

  return Math.max(0, Math.min(1, Number(routingConfig.logisticConfidenceMin || 0.1)));
};

const isModelConfidenceLow = (prediction, selectedMethod, routingConfig) => {
  const confidence = Number(prediction?.confidence);
  if (!Number.isFinite(confidence)) {
    return true;
  }

  const threshold = resolveModelConfidenceThreshold(selectedMethod, routingConfig);
  return confidence < threshold;
};

export const decideModel = ({
  featureVector,
  featureValidation,
  transactionCount,
  model,
  userId = null,
}) => {
  const routingConfig = {
    ...DEFAULT_ROUTING_CONFIG,
    ...(model?.routingConfig || {}),
  };

  const rolloutDecision = typeof model?.rolloutController?.evaluateUser === 'function'
    ? model.rolloutController.evaluateUser(userId)
    : DEFAULT_ROLLOUT_DECISION;

  const normalizedTransactionCount = Number.isFinite(Number(transactionCount))
    ? Math.max(0, Math.trunc(Number(transactionCount)))
    : 0;
  const volatility = Number.isFinite(Number(featureVector?.payment_volatility))
    ? Math.max(0, Number(featureVector.payment_volatility))
    : 0;
  const segmentKey = deriveRoutingSegmentKey(featureVector, normalizedTransactionCount, routingConfig);
  const hasSparseHistory = normalizedTransactionCount < routingConfig.sparseHistoryThreshold;
  const hasDataQualityIssue = featureValidation?.valid === false;
  const missingCriticalFeatures = hasMissingCriticalFeatures(featureVector, routingConfig.criticalFeatureKeys);

  if (!rolloutDecision?.enabled) {
    const revertToRuleBased = rolloutDecision?.revertTarget === 'rule-based';
    const fallbackMethod = revertToRuleBased
      ? TRUST_SCORING_METHODS.RULE_BASED
      : TRUST_SCORING_METHODS.LOGISTIC;
    const fallbackReasonCode = revertToRuleBased
      ? TRUST_FALLBACK_REASON_CODES.ROUTED_TO_RULE_BASED
      : TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LOGISTIC;

    return {
      selectedMethod: fallbackMethod,
      modelKey: ROUTING_MODEL_KEYS[fallbackMethod],
      reasonCode: fallbackReasonCode,
      explanation: revertToRuleBased
        ? 'New scoring disabled. Using safer rule-based trust estimate.'
        : 'New scoring disabled. Using champion trust estimate.',
      details: {
        transactionCount: normalizedTransactionCount,
        segmentKey,
        rolloutDecision,
        rollbackApplied: true,
      },
    };
  }

  if (hasSparseHistory || hasDataQualityIssue || missingCriticalFeatures) {
    const sparseReasonCode = hasDataQualityIssue
      ? TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE
      : missingCriticalFeatures
        ? TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA
        : TRUST_FALLBACK_REASON_CODES.LOW_HISTORY;

    return {
      selectedMethod: TRUST_SCORING_METHODS.RULE_BASED,
      modelKey: ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.RULE_BASED],
      reasonCode: sparseReasonCode,
      explanation: 'Using a safer trust estimate due to limited or incomplete history.',
      details: {
        transactionCount: normalizedTransactionCount,
        segmentKey,
        sparseThreshold: routingConfig.sparseHistoryThreshold,
        hasDataQualityIssue,
        missingCriticalFeatures,
        rolloutDecision,
      },
    };
  }

  const richHistory = normalizedTransactionCount >= routingConfig.richHistoryThreshold;
  const highVolatility = volatility >= routingConfig.highVolatilityThreshold;
  const challengerEnabled = model?.useChallengerModel === true;
  const challengerSegmentApproved = model?.challengerSegmentApproved === true;
  const challengerSegmentEnabledByRollout = typeof model?.rolloutController?.isSegmentChallengerEnabled === 'function'
    ? model.rolloutController.isSegmentChallengerEnabled(segmentKey)
    : true;

  if (
    challengerEnabled
    && challengerSegmentApproved
    && challengerSegmentEnabledByRollout
    && richHistory
    && highVolatility
  ) {
    return {
      selectedMethod: TRUST_SCORING_METHODS.LIGHTGBM,
      modelKey: ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.LIGHTGBM],
      reasonCode: TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LIGHTGBM,
      explanation: 'Using advanced trust analysis for high-activity and volatile behavior.',
      details: {
        segmentKey,
        transactionCount: normalizedTransactionCount,
        volatility,
        richHistoryThreshold: routingConfig.richHistoryThreshold,
        highVolatilityThreshold: routingConfig.highVolatilityThreshold,
        rolloutDecision,
      },
    };
  }

  return {
    selectedMethod: TRUST_SCORING_METHODS.LOGISTIC,
    modelKey: ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.LOGISTIC],
    reasonCode: TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LOGISTIC,
    explanation: 'Using the standard trust estimate from stable repayment behavior.',
    details: {
      segmentKey,
      transactionCount: normalizedTransactionCount,
      volatility,
      richHistory,
      highVolatility,
      challengerEnabled,
      challengerSegmentApproved,
      challengerSegmentEnabledByRollout,
      rolloutDecision,
    },
  };
};

const normalizeActualOutcome = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value === true || value === false) {
    return value ? 1 : 0;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric >= 0.5 ? 1 : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === 'defaulted') {
      return 1;
    }

    if (normalized === 'false' || normalized === 'no' || normalized === 'n' || normalized === 'current') {
      return 0;
    }
  }

  return null;
};

const resolveActualOutcome = ({ customer, metricRow, model }) => {
  const resolver = model?.getActualOutcome;
  if (typeof resolver === 'function') {
    try {
      return normalizeActualOutcome(resolver({ customer, metricRow }));
    } catch (_error) {
      return null;
    }
  }

  const candidate = (
    metricRow?.actual_default
    ?? metricRow?.actual_outcome
    ?? metricRow?.defaulted
    ?? metricRow?.default_flag
    ?? metricRow?.default_60d
    ?? metricRow?.target_default_60d
    ?? metricRow?.label
    ?? customer?.actual_default
    ?? customer?.actual_outcome
    ?? customer?.defaulted
    ?? customer?.default_flag
    ?? customer?.default_60d
    ?? customer?.label
    ?? null
  );

  return normalizeActualOutcome(candidate);
};

const resolvePrimaryPrediction = ({
  model,
  customer,
  metricRow,
  featureVector,
  explicitPrimaryPrediction,
  routeMethod,
}) => {
  const canUseExplicitPrediction = (
    model?.preferExplicitPrimaryPrediction !== false
    && routeMethod === TRUST_SCORING_METHODS.LOGISTIC
  );

  if (canUseExplicitPrediction) {
    const directPrediction = normalizePrimaryPrediction(explicitPrimaryPrediction);
    if (directPrediction) {
      const hasFactors = Array.isArray(directPrediction.contributingFactors)
        && directPrediction.contributingFactors.length >= 3;

      if (!hasFactors && routeMethod === TRUST_SCORING_METHODS.LOGISTIC && typeof model?.getChampionPrediction === 'function') {
        const enrichedPrediction = normalizePrimaryPrediction(
          model.getChampionPrediction({
            customer,
            metricRow,
            featureVector,
          })
        );

        if (enrichedPrediction) {
          return {
            ...enrichedPrediction,
            ...directPrediction,
            probability: directPrediction.probability,
            confidence: directPrediction.confidence,
            reasons: directPrediction.reasons.length ? directPrediction.reasons : enrichedPrediction.reasons,
            explanation: directPrediction.explanation || enrichedPrediction.explanation,
            contributions: directPrediction.contributions || enrichedPrediction.contributions,
            confidenceComponents: directPrediction.confidenceComponents || enrichedPrediction.confidenceComponents,
            contributingFactors: hasFactors
              ? directPrediction.contributingFactors
              : enrichedPrediction.contributingFactors,
            riskLevelToken: directPrediction.riskLevelToken || enrichedPrediction.riskLevelToken,
          };
        }
      }

      return directPrediction;
    }
  }

  const resolver = routeMethod === TRUST_SCORING_METHODS.LIGHTGBM
    ? model?.getChallengerPrediction
    : routeMethod === TRUST_SCORING_METHODS.LOGISTIC
      ? model?.getChampionPrediction
      : model?.getPrimaryPrediction;

  if (typeof resolver !== 'function') {
    return null;
  }

  try {
    return normalizePrimaryPrediction(
      resolver({
        customer,
        metricRow,
        featureVector,
      })
    );
  } catch (_error) {
    return null;
  }
};

const resolveAuxiliaryPrediction = ({ resolver, customer, metricRow, featureVector }) => {
  if (typeof resolver !== 'function') {
    return null;
  }

  try {
    return normalizePrimaryPrediction(
      resolver({
        customer,
        metricRow,
        featureVector,
      })
    );
  } catch (_error) {
    return null;
  }
};

const createShadowComparisonPayload = ({
  model,
  customer,
  metricRow,
  featureVector,
  routeDecision,
  primaryPrediction,
  championPrediction,
  challengerPrediction,
  logger,
}) => {
  if (!model?.shadowMode) {
    return null;
  }

  if (!primaryPrediction && !championPrediction && !challengerPrediction) {
    return null;
  }

  const selectedModel = routeDecision?.modelKey || model?.primaryModelKey || PRIMARY_MODEL_KEYS.CUSTOM;
  const actualOutcome = resolveActualOutcome({ customer, metricRow, model });
  const payload = {
    event: 'TRUST_MODEL_SHADOW_COMPARISON',
    timestamp: new Date().toISOString(),
    customerId: Number.isFinite(Number(customer?.id)) ? Number(customer.id) : null,
    selectedModel,
    selectedMethod: routeDecision?.selectedMethod || null,
    selectedProbability: primaryPrediction?.probability ?? null,
    selectedConfidence: primaryPrediction?.confidence ?? null,
    championProbability: championPrediction?.probability ?? null,
    challengerProbability: challengerPrediction?.probability ?? null,
    championConfidence: championPrediction?.confidence ?? null,
    challengerConfidence: challengerPrediction?.confidence ?? null,
    actualOutcome,
    featureSnapshot: featureVector || null,
  };

  const shadowLogger = typeof model?.shadowLogger === 'function' ? model.shadowLogger : logger;
  shadowLogger('[TRUST_SHADOW]', JSON.stringify(payload));
  return payload;
};

const logRoutingDecision = ({
  customer,
  model,
  routeDecision,
  rolloutDecision,
  prediction,
  fallbackUsed,
  fallbackReasonCode,
  segmentKey,
  featureVector,
  logger,
}) => {
  const payload = {
    event: 'TRUST_ROUTING_DECISION',
    timestamp: new Date().toISOString(),
    customerId: Number.isFinite(Number(customer?.id)) ? Number(customer.id) : null,
    selectedMethod: routeDecision?.selectedMethod || null,
    selectedModel: routeDecision?.modelKey || null,
    selectedReasonCode: routeDecision?.reasonCode || null,
    segmentKey: segmentKey || routeDecision?.details?.segmentKey || null,
    rolloutPercentage: rolloutDecision?.rolloutPercentage ?? null,
    rolloutStage: rolloutDecision?.rolloutStage || null,
    rolloutEnabledForUser: rolloutDecision?.rolloutEnabledForUser ?? null,
    enableNewScoring: rolloutDecision?.enableNewScoring ?? null,
    selectedModelConfidence: prediction?.confidence ?? null,
    confidence: prediction?.confidence ?? null,
    probability: prediction?.probability ?? null,
    fallbackUsed: Boolean(fallbackUsed),
    fallbackReasonCode: fallbackReasonCode || null,
    featureSnapshot: featureVector || null,
    details: routeDecision?.details || null,
  };

  logger('[TRUST_ROUTING]', JSON.stringify(payload));
  return payload;
};

const scoreCustomerTrust = ({
  customer,
  metricRow,
  featureItem,
  model,
  explicitPrimaryPrediction = null,
  logger = console.warn,
}) => {
  const featureVector = featureItem?.vector || buildFeatureVectorFromMetrics(metricRow);
  const featureValidation = featureItem?.validation || defaultFeatureValidation;
  const transactionCount = Number.isFinite(Number(featureVector?.transaction_depth))
    ? Math.trunc(Math.max(0, Number(featureVector?.transaction_depth)))
    : Math.trunc(toNonNegative(metricRow?.number_of_transactions));
  const routingUserId = customer?.user_id ?? customer?.id ?? null;
  const routeDecision = typeof model?.getRoutingDecision === 'function'
    ? model.getRoutingDecision({ featureVector, featureValidation, transactionCount, model, userId: routingUserId })
    : decideModel({ featureVector, featureValidation, transactionCount, model, userId: routingUserId });
  const rolloutDecision = routeDecision?.details?.rolloutDecision || DEFAULT_ROLLOUT_DECISION;
  const segmentKey = routeDecision?.details?.segmentKey || 'unknown';

  const requiresPrimaryPrediction = (
    shouldRequirePrimaryPrediction(model?.type)
    && routeDecision?.selectedMethod !== TRUST_SCORING_METHODS.RULE_BASED
  );

  const primaryPrediction = requiresPrimaryPrediction
    ? resolvePrimaryPrediction({
      model,
      customer,
      metricRow,
      featureVector,
      explicitPrimaryPrediction,
      routeMethod: routeDecision?.selectedMethod,
    })
    : null;
  const championPrediction = resolveAuxiliaryPrediction({
    resolver: model?.getChampionPrediction,
    customer,
    metricRow,
    featureVector,
  });
  const challengerPrediction = resolveAuxiliaryPrediction({
    resolver: model?.getChallengerPrediction,
    customer,
    metricRow,
    featureVector,
  });
  const shadowComparison = createShadowComparisonPayload({
    model,
    customer,
    metricRow,
    featureVector,
    routeDecision,
    primaryPrediction,
    championPrediction,
    challengerPrediction,
    logger,
  });

  const ruleResult = (typeof model?.predictFallbackRules === 'function'
    ? model.predictFallbackRules(metricRow)
    : classifyByRules(metricRow));

  const buildRuleFallbackResult = (reasonCode, details = null) => {
    const standardOutput = buildRuleOutput(ruleResult, reasonCode);
    const fallbackLog = logFallbackUsage({
      customerId: customer?.id,
      userId: customer?.user_id,
      reasonCode,
      featureSnapshot: featureVector,
      details,
      logger,
    });
    const routingLog = logRoutingDecision({
      customer,
      model,
      routeDecision,
      rolloutDecision,
      prediction: primaryPrediction,
      fallbackUsed: true,
      fallbackReasonCode: reasonCode,
      segmentKey,
      featureVector,
      logger,
    });

    return {
      standardOutput,
      fallbackLog,
      ruleResult,
      primaryPrediction,
      contributingFactors: Array.isArray(ruleResult?.contributingFactors) ? ruleResult.contributingFactors : [],
      shadowComparison,
      routeDecision,
      rolloutDecision,
      segmentKey,
      routingLog,
      selectedModelKey: routeDecision?.modelKey || ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.RULE_BASED],
      actualOutcome: resolveActualOutcome({ customer, metricRow, model }),
    };
  };

  if (routeDecision?.selectedMethod === TRUST_SCORING_METHODS.RULE_BASED) {
    return buildRuleFallbackResult(routeDecision.reasonCode || TRUST_FALLBACK_REASON_CODES.ROUTED_TO_RULE_BASED, {
      routing: routeDecision?.details || null,
    });
  }

  if (!requiresPrimaryPrediction || !primaryPrediction || primaryPrediction.probability === null) {
    return buildRuleFallbackResult(TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA, {
      routing: routeDecision?.details || null,
    });
  }

  if (isModelConfidenceLow(primaryPrediction, routeDecision.selectedMethod, model?.routingConfig || DEFAULT_ROUTING_CONFIG)) {
    return buildRuleFallbackResult(TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE_OVERRIDE, {
      modelMethod: routeDecision.selectedMethod,
      confidence: primaryPrediction?.confidence ?? null,
      confidenceThreshold: resolveModelConfidenceThreshold(routeDecision.selectedMethod, model?.routingConfig || DEFAULT_ROUTING_CONFIG),
    });
  }

  const fallbackDecision = evaluateFallbackConditions({
    featureVector,
    featureValidation,
    transactionCount,
    mlPrediction: primaryPrediction,
    requirePrimaryPrediction: true,
    policy: model?.fallbackPolicy || DEFAULT_FALLBACK_POLICY,
  });

  if (fallbackDecision.useFallback) {
    return buildRuleFallbackResult(fallbackDecision.reasonCode, fallbackDecision.details);
  }

  const standardOutput = buildModelOutput({
    prediction: primaryPrediction,
    method: routeDecision.selectedMethod,
    reasonCode: routeDecision.reasonCode || ML_PRIMARY_REASON,
  });

  const routingLog = logRoutingDecision({
    customer,
    model,
    routeDecision,
    rolloutDecision,
    prediction: primaryPrediction,
    fallbackUsed: false,
    fallbackReasonCode: null,
    segmentKey,
    featureVector,
    logger,
  });

  return {
    standardOutput,
    fallbackLog: null,
    ruleResult,
    primaryPrediction,
    contributingFactors: Array.isArray(primaryPrediction?.contributingFactors) ? primaryPrediction.contributingFactors : [],
    shadowComparison,
    routeDecision,
    rolloutDecision,
    segmentKey,
    routingLog,
    selectedModelKey: routeDecision?.modelKey || model?.primaryModelKey || PRIMARY_MODEL_KEYS.CUSTOM,
    actualOutcome: resolveActualOutcome({ customer, metricRow, model }),
  };
};

export const createCustomerRiskModel = (type = RISK_MODEL_TYPES.RULE_BASED, options = {}) => {
  const requirePrimary = shouldRequirePrimaryPrediction(type);
  const effectiveFlags = {
    ...TRUST_MODEL_FEATURE_FLAGS,
    ...(options?.featureFlags || {}),
  };

  const useChallengerModel = options?.useChallengerModel === true || effectiveFlags.use_challenger_model === true;
  const shadowMode = options?.shadowMode === true || effectiveFlags.shadow_mode === true;
  const preferExplicitPrimaryPrediction = options?.preferExplicitPrimaryPrediction !== undefined
    ? options.preferExplicitPrimaryPrediction !== false
    : effectiveFlags.prefer_explicit_primary_prediction !== false;
  const routingConfig = {
    ...DEFAULT_ROUTING_CONFIG,
    ...(options?.routingConfig || {}),
  };

  const rolloutController = options?.rolloutController || null;
  const monitoringEngine = options?.monitoringEngine || null;

  const challengerSegmentApproved = options?.challengerSegmentApproved === true
    || (
      options?.challengerSegmentApproved !== false
      && isChallengerPreferredForVolatileSegment()
    );

  const championPredictor = ({ featureVector }) => predictChampionTrust(featureVector);
  const challengerPredictor = ({ featureVector }) => predictChallengerTrust(featureVector);

  const resolvedChampionPredictor = typeof options?.getChampionPrediction === 'function'
    ? options.getChampionPrediction
    : championPredictor;
  const resolvedChallengerPredictor = typeof options?.getChallengerPrediction === 'function'
    ? options.getChallengerPrediction
    : challengerPredictor;

  const defaultPrimaryPredictor = requirePrimary ? resolvedChampionPredictor : null;

  return {
    type,
    useChallengerModel,
    primaryModelKey: PRIMARY_MODEL_KEYS.CUSTOM,
    challengerSegmentApproved,
    routingConfig,
    fallbackPolicy: {
      ...DEFAULT_FALLBACK_POLICY,
      ...(options?.fallbackPolicy || {}),
    },
    predictFallbackRules: classifyByRules,
    preferExplicitPrimaryPrediction,
    shadowMode,
    shadowLogger: typeof options?.shadowLogger === 'function' ? options.shadowLogger : null,
    getRoutingDecision: typeof options?.getRoutingDecision === 'function' ? options.getRoutingDecision : null,
    getChampionPrediction: requirePrimary ? resolvedChampionPredictor : null,
    getChallengerPrediction: requirePrimary ? resolvedChallengerPredictor : null,
    getActualOutcome: typeof options?.getActualOutcome === 'function' ? options.getActualOutcome : null,
    rolloutController,
    monitoringEngine,
    getPrimaryPrediction: typeof options?.getPrimaryPrediction === 'function'
      ? options.getPrimaryPrediction
      : defaultPrimaryPredictor,
    logger: typeof options?.logger === 'function' ? options.logger : console.warn,
  };
};

export const applyCustomerRiskClassification = (
  customers,
  riskMetricsRows,
  model,
  featureBatch = null,
  options = {}
) => {
  const metricsMap = new Map();
  const featureMap = new Map();
  const primaryPredictionMap = new Map();
  const logger = typeof options?.logger === 'function' ? options.logger : model?.logger || console.warn;
  const monitoringEngine = options?.monitoringEngine || model?.monitoringEngine || null;
  const autoComputeMonitoringSnapshot = options?.autoComputeMonitoringSnapshot !== false;

  for (const row of riskMetricsRows || []) {
    const customerId = Number(row.customer_id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      continue;
    }

    metricsMap.set(customerId, row);
  }

  for (const item of featureBatch?.items || []) {
    const customerId = Number(item?.customer_id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      continue;
    }

    featureMap.set(customerId, item);
  }

  for (const predictionRow of options?.primaryPredictions || []) {
    const customerId = Number(predictionRow?.customer_id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      continue;
    }

    primaryPredictionMap.set(customerId, predictionRow);
  }

  const outputRows = (customers || []).map((customer) => {
    const startMs = Date.now();
    const customerId = Number(customer.id);
    const metricRow = metricsMap.get(customerId) || {
      customer_id: customerId,
      total_due: Number(customer.total_due || 0),
      number_of_transactions: 0,
      number_of_late_payments: 0,
      average_payment_delay: null,
    };
    const featureItem = featureMap.get(customerId) || null;
    const verificationLevel = customer.verification_level ?? customer.verificationLevel ?? 'L0';
    const trustGate = evaluateTrustGate(verificationLevel);
    let scoring = null;
    let scoringErrored = false;

    try {
      scoring = scoreCustomerTrust({
        customer,
        metricRow,
        featureItem,
        model,
        explicitPrimaryPrediction: primaryPredictionMap.get(customerId) || null,
        logger,
      });
    } catch (error) {
      scoringErrored = true;
      const fallbackRuleResult = classifyByRules(metricRow);
      const standardOutput = buildRuleOutput(fallbackRuleResult, TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE);
      scoring = {
        standardOutput,
        fallbackLog: logFallbackUsage({
          customerId,
          userId: customer?.user_id,
          reasonCode: TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE,
          featureSnapshot: featureItem?.vector || buildFeatureVectorFromMetrics(metricRow),
          details: {
            error: error?.message || String(error),
          },
          logger,
        }),
        ruleResult: fallbackRuleResult,
        primaryPrediction: null,
        contributingFactors: fallbackRuleResult.contributingFactors || [],
        shadowComparison: null,
        routeDecision: {
          selectedMethod: TRUST_SCORING_METHODS.RULE_BASED,
          modelKey: ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.RULE_BASED],
          reasonCode: TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE,
          details: {
            segmentKey: 'unknown',
            scoringError: true,
          },
        },
        rolloutDecision: DEFAULT_ROLLOUT_DECISION,
        segmentKey: 'unknown',
        routingLog: null,
        selectedModelKey: ROUTING_MODEL_KEYS[TRUST_SCORING_METHODS.RULE_BASED],
        actualOutcome: resolveActualOutcome({ customer, metricRow, model }),
      };

      logger('[TRUST_SCORING_ERROR]', JSON.stringify({
        customerId,
        error: error?.message || String(error),
      }));
    }

    const standardOutput = scoring.standardOutput;
    const riskScore = toTrustScore(standardOutput.score);
    const riskLevelLabel = toRiskLevelLabel(standardOutput.riskLevel);
    const metricsSummary = summarizeMetrics(metricRow);
    const riskReasons = (
      standardOutput.method === TRUST_SCORING_METHODS.LOGISTIC
      || standardOutput.method === TRUST_SCORING_METHODS.LIGHTGBM
    )
      ? (Array.isArray(scoring?.primaryPrediction?.reasons) ? [...scoring.primaryPrediction.reasons] : [])
      : (Array.isArray(scoring?.ruleResult?.reasons) ? [...scoring.ruleResult.reasons] : []);

    if (standardOutput.explanation && !riskReasons.includes(standardOutput.explanation)) {
      riskReasons.push(standardOutput.explanation);
    }

    const row = {
      ...customer,
      risk_level: riskLevelLabel,
      risk_score: riskScore,
      trust_score: standardOutput.score,
      risk_reasons: riskReasons,
      number_of_transactions: metricsSummary.number_of_transactions,
      number_of_late_payments: metricsSummary.number_of_late_payments,
      average_payment_delay: metricsSummary.average_payment_delay,
      trust_features: featureItem?.vector || null,
      trust_feature_schema: featureItem?.schema || null,
      trust_feature_validation: featureItem?.validation || null,
      trust_score_output: standardOutput,
      trust_scoring_method: standardOutput.method,
      trust_scoring_reason_code: standardOutput.reason,
      trust_scoring_explanation: standardOutput.explanation,
      trust_scoring_confidence: standardOutput.confidence,
      trust_scoring_probability: standardOutput.probability,
      trust_scoring_contributions: scoring?.primaryPrediction?.contributions || null,
      trust_scoring_confidence_components: scoring?.primaryPrediction?.confidenceComponents || null,
      trust_scoring_model_key: scoring?.selectedModelKey || model?.primaryModelKey || null,
      trust_scoring_model_version: scoring?.primaryPrediction?.modelVersion || null,
      contributing_factors: Array.isArray(scoring?.contributingFactors) ? scoring.contributingFactors : [],
      trust_routing_decision: scoring?.routeDecision || null,
      trust_routing_event: scoring?.routingLog || null,
      trust_shadow_comparison: scoring?.shadowComparison || null,
      trust_fallback_event: scoring.fallbackLog,
      trust_scope: trustGate.scope,
      trust_gate: trustGate,
    };

    if (monitoringEngine && typeof monitoringEngine.recordRequest === 'function') {
      monitoringEngine.recordRequest({
        timestamp: new Date().toISOString(),
        userId: customer?.user_id ?? customer?.id ?? null,
        segmentKey: scoring?.segmentKey || scoring?.routeDecision?.details?.segmentKey || 'unknown',
        selectedModel: scoring?.selectedModelKey || row.trust_scoring_model_key || 'unknown',
        selectedMethod: standardOutput.method,
        confidence: standardOutput.confidence,
        probability: standardOutput.probability,
        latencyMs: Date.now() - startMs,
        usedFallback: standardOutput.method === TRUST_SCORING_METHODS.RULE_BASED,
        isError: scoringErrored,
        actualOutcome: scoring?.actualOutcome ?? null,
        featureVector: featureItem?.vector || null,
        rolloutPercentage: scoring?.rolloutDecision?.rolloutPercentage,
        rolloutStage: scoring?.rolloutDecision?.rolloutStage,
        enableNewScoring: scoring?.rolloutDecision?.enableNewScoring,
      });
    }

    return row;
  });

  if (monitoringEngine && autoComputeMonitoringSnapshot && typeof monitoringEngine.computeSnapshot === 'function') {
    const snapshot = monitoringEngine.computeSnapshot();
    logger('[TRUST_MONITOR_SNAPSHOT]', JSON.stringify({
      generated_at: snapshot.generated_at,
      request_count: snapshot.request_count,
      fallback_rate: snapshot.fallback_rate,
      error_rate: snapshot.error_rate,
      latency_ms_p95: snapshot.latency_ms_p95,
      prediction_drift_psi: snapshot.prediction_drift_psi,
      triggered_guardrails: snapshot.triggered_guardrails,
    }));
  }

  return outputRows;
};
