export const TRUST_SCORING_METHODS = {
  RULE_BASED: 'RULE_BASED',
  LOGISTIC: 'LOGISTIC',
  LIGHTGBM: 'LIGHTGBM',
  // Backward-compatible aliases used by earlier phases.
  ML_MODEL: 'LOGISTIC',
  RULE_BASED_FALLBACK: 'RULE_BASED',
  RULE_BASED_PRIMARY: 'RULE_BASED',
};

export const TRUST_FALLBACK_REASON_CODES = {
  LOW_HISTORY: 'LOW_HISTORY',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  DATA_QUALITY_ISSUE: 'DATA_QUALITY_ISSUE',
  LOW_CONFIDENCE_OVERRIDE: 'LOW_CONFIDENCE_OVERRIDE',
  ROUTED_TO_LOGISTIC: 'ROUTED_TO_LOGISTIC',
  ROUTED_TO_LIGHTGBM: 'ROUTED_TO_LIGHTGBM',
  ROUTED_TO_RULE_BASED: 'ROUTED_TO_RULE_BASED',
};

export const TRUST_REASON_DICTIONARY = {
  [TRUST_FALLBACK_REASON_CODES.LOW_HISTORY]: {
    code: TRUST_FALLBACK_REASON_CODES.LOW_HISTORY,
    message: 'Not enough transaction history. Using a basic trust estimate.',
  },
  [TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA]: {
    code: TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA,
    message: 'Some important customer data is missing. Using a basic trust estimate.',
  },
  [TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE]: {
    code: TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE,
    message: 'The model is not sure right now. Using a basic trust estimate.',
  },
  [TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE_OVERRIDE]: {
    code: TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE_OVERRIDE,
    message: 'Confidence is low. Using a safer trust estimate from payment history.',
  },
  [TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LOGISTIC]: {
    code: TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LOGISTIC,
    message: 'Using the standard trust estimate from stable repayment behavior.',
  },
  [TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LIGHTGBM]: {
    code: TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LIGHTGBM,
    message: 'Using advanced trust analysis for high-activity and volatile behavior.',
  },
  [TRUST_FALLBACK_REASON_CODES.ROUTED_TO_RULE_BASED]: {
    code: TRUST_FALLBACK_REASON_CODES.ROUTED_TO_RULE_BASED,
    message: 'Using a safer trust estimate due to limited or incomplete history.',
  },
  [TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE]: {
    code: TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE,
    message: 'Customer data looks inconsistent. Using a basic trust estimate.',
  },
};

export const DEFAULT_FALLBACK_POLICY = Object.freeze({
  minTransactionHistory: 3,
  uncertaintyProbabilityMin: 0.4,
  uncertaintyProbabilityMax: 0.6,
  minConfidenceScore: 0.65,
  criticalFeatureKeys: ['due_amount', 'payment_consistency', 'recency_days'],
});

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const isMissingFeatureValue = (value) => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }

  return false;
};

const lookupReasonEntry = (reasonCode) => {
  return TRUST_REASON_DICTIONARY[reasonCode] || {
    code: TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA,
    message: TRUST_REASON_DICTIONARY[TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA].message,
  };
};

export const createStandardTrustOutput = ({
  score,
  riskLevel,
  method,
  reason,
  explanation,
  confidence = null,
  probability = null,
}) => {
  const numericScore = Number(score);
  const safeScore = Number.isFinite(numericScore)
    ? Math.max(0, Math.min(100, Math.round(numericScore)))
    : 0;

  return {
    score: safeScore,
    riskLevel: riskLevel || 'LOW',
    method,
    reason,
    explanation,
    confidence: toFiniteNumber(confidence),
    probability: toFiniteNumber(probability),
  };
};

export const resolveFallbackReason = (reasonCode) => lookupReasonEntry(reasonCode);

export const evaluateFallbackConditions = ({
  featureVector,
  featureValidation,
  transactionCount,
  mlPrediction,
  requirePrimaryPrediction,
  policy = DEFAULT_FALLBACK_POLICY,
}) => {
  const effectivePolicy = {
    ...DEFAULT_FALLBACK_POLICY,
    ...(policy || {}),
  };

  if (featureValidation?.valid === false) {
    return {
      useFallback: true,
      reasonCode: TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE,
      details: {
        issues: Array.isArray(featureValidation?.issues) ? featureValidation.issues : [],
      },
    };
  }

  const missingFeatures = (effectivePolicy.criticalFeatureKeys || []).filter((key) => {
    return isMissingFeatureValue(featureVector?.[key]);
  });

  if (missingFeatures.length > 0) {
    return {
      useFallback: true,
      reasonCode: TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA,
      details: {
        missingFeatures,
      },
    };
  }

  const normalizedTransactionCount = Number.isFinite(Number(transactionCount))
    ? Math.max(0, Math.trunc(Number(transactionCount)))
    : 0;

  if (normalizedTransactionCount < effectivePolicy.minTransactionHistory) {
    return {
      useFallback: true,
      reasonCode: TRUST_FALLBACK_REASON_CODES.LOW_HISTORY,
      details: {
        transactionCount: normalizedTransactionCount,
        minTransactionHistory: effectivePolicy.minTransactionHistory,
      },
    };
  }

  if (requirePrimaryPrediction) {
    const probability = toFiniteNumber(mlPrediction?.probability);
    const confidence = toFiniteNumber(mlPrediction?.confidence);

    const isProbabilityUnavailable = probability === null;
    const isUncertainProbability =
      probability !== null
      && probability >= effectivePolicy.uncertaintyProbabilityMin
      && probability <= effectivePolicy.uncertaintyProbabilityMax;
    const isLowConfidence =
      confidence !== null
      && confidence < effectivePolicy.minConfidenceScore;

    if (isProbabilityUnavailable || isUncertainProbability || isLowConfidence) {
      return {
        useFallback: true,
        reasonCode: TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE,
        details: {
          probability,
          confidence,
          uncertaintyRange: [
            effectivePolicy.uncertaintyProbabilityMin,
            effectivePolicy.uncertaintyProbabilityMax,
          ],
          minConfidenceScore: effectivePolicy.minConfidenceScore,
        },
      };
    }
  }

  return {
    useFallback: false,
    reasonCode: null,
    details: null,
  };
};

export const logFallbackUsage = ({
  customerId,
  userId = null,
  reasonCode,
  featureSnapshot = null,
  logger = console.warn,
  details = null,
}) => {
  const payload = {
    event: 'TRUST_FALLBACK_TRIGGERED',
    timestamp: new Date().toISOString(),
    customerId: Number.isFinite(Number(customerId)) ? Number(customerId) : null,
    userId: Number.isFinite(Number(userId)) ? Number(userId) : null,
    reasonCode,
    featureSnapshot,
    details,
  };

  logger('[TRUST_FALLBACK]', JSON.stringify(payload));
  return payload;
};
