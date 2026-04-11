import { predictChampionTrust } from './trustChampionModel.js';
import { predictChallengerTrust } from './trustChallengerModel.js';
import {
  applyCustomerRiskClassification,
  createCustomerRiskModel,
  RISK_MODEL_TYPES,
} from './customerRiskEngine.js';
import {
  TRUST_FALLBACK_REASON_CODES,
  TRUST_SCORING_METHODS,
} from './trustFallbackPolicy.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual, expected, tolerance, message) {
  const delta = Math.abs(Number(actual) - Number(expected));
  if (!Number.isFinite(delta) || delta > tolerance) {
    throw new Error(`${message}. expected=${expected}, actual=${actual}, tolerance=${tolerance}`);
  }
}

function assertContributingFactors(factors, messagePrefix) {
  assert(Array.isArray(factors), `${messagePrefix}: contributing_factors must be an array`);
  assert(factors.length >= 3 && factors.length <= 5, `${messagePrefix}: contributing_factors must contain 3-5 items`);

  factors.forEach((factor, index) => {
    assert(typeof factor.feature === 'string' && factor.feature.length > 0, `${messagePrefix}: factor ${index} feature missing`);
    assert(typeof factor.impact === 'string' && /^[+-]\d+\.\d{2}$/.test(factor.impact), `${messagePrefix}: factor ${index} impact format invalid`);
    assert(
      factor.direction === 'increase_risk' || factor.direction === 'decrease_risk',
      `${messagePrefix}: factor ${index} direction invalid`
    );
    assert(typeof factor.label === 'string' && factor.label.length > 0, `${messagePrefix}: factor ${index} label missing`);
    assert(!factor.label.includes('_'), `${messagePrefix}: factor ${index} label should be human friendly`);
  });
}

const baseVector = {
  due_amount: 1200,
  late_count: 2,
  avg_delay_days: 8,
  transaction_depth: 12,
  recency_days: 5,
  payment_consistency: 0.7,
  payment_volatility: 18,
};

export function runTrustChampionModelSelfTests() {
  const lowDue = predictChampionTrust({ ...baseVector, due_amount: 500 });
  const highDue = predictChampionTrust({ ...baseVector, due_amount: 5000 });
  assert(highDue.probability >= lowDue.probability, 'probability must increase with due_amount');

  const weakConsistency = predictChampionTrust({ ...baseVector, payment_consistency: 0.2 });
  const strongConsistency = predictChampionTrust({ ...baseVector, payment_consistency: 0.95 });
  assert(strongConsistency.probability <= weakConsistency.probability, 'probability must decrease with payment_consistency');

  const sample = predictChampionTrust(baseVector);
  const challengerSample = predictChallengerTrust(baseVector);
  assert(Number.isFinite(sample.probability), 'probability must be finite');
  assert(Number.isFinite(sample.confidence), 'confidence must be finite');
  assert(sample.riskLevel === 'LOW' || sample.riskLevel === 'MEDIUM' || sample.riskLevel === 'HIGH', 'risk level must be valid');
  assert(typeof sample.explanation === 'string' && sample.explanation.length > 0, 'explanation must be present');
  assert(Number.isFinite(challengerSample.probability), 'challenger probability must be finite');
  assert(challengerSample.riskLevel === 'LOW' || challengerSample.riskLevel === 'MEDIUM' || challengerSample.riskLevel === 'HIGH', 'challenger risk level must be valid');
  assertContributingFactors(sample.contributing_factors, 'champion prediction');
  assertContributingFactors(challengerSample.contributing_factors, 'challenger prediction');

  const model = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, { logger: () => {} });
  const rows = applyCustomerRiskClassification(
    [{ id: 99, user_id: 42 }],
    [{ customer_id: 99, total_due: 1200, number_of_transactions: 12, number_of_late_payments: 1, average_payment_delay: 7 }],
    model,
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 99,
          vector: { ...baseVector, transaction_depth: 12, recency_days: 4 },
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(rows.length === 1, 'expected a single scored row');
  assert(rows[0].trust_scoring_method === TRUST_SCORING_METHODS.LOGISTIC, 'normal user should route to logistic model');
  assert(Number.isFinite(Number(rows[0].trust_scoring_probability)), 'scored probability should be available');
  assert(rows[0].trust_scoring_contributions && typeof rows[0].trust_scoring_contributions === 'object', 'contributions should be attached for ML output');
  assertContributingFactors(rows[0].contributing_factors, 'logistic route row');

  const highRiskVector = {
    ...baseVector,
    due_amount: 7600,
    late_count: 4,
    avg_delay_days: 21,
    payment_consistency: 0.42,
    payment_volatility: 66,
  };
  const championBaseline = predictChampionTrust(highRiskVector);

  const championFlagModel = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, {
    logger: () => {},
    useChallengerModel: false,
    preferExplicitPrimaryPrediction: false,
  });

  const championFlagRows = applyCustomerRiskClassification(
    [{ id: 100, user_id: 1 }],
    [{ customer_id: 100, total_due: 7600, number_of_transactions: 14, number_of_late_payments: 3, average_payment_delay: 19 }],
    championFlagModel,
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 100,
          vector: highRiskVector,
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(championFlagRows[0].trust_scoring_method === TRUST_SCORING_METHODS.LOGISTIC, 'champion flag path should remain logistic');
  assert(championFlagRows[0].trust_scoring_model_key === 'champion', 'flag off should keep champion model key');
  assertClose(championFlagRows[0].trust_scoring_probability, championBaseline.probability, 0.000001, 'flag off probability should match champion inference');

  const gatedChallengerModel = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, {
    logger: () => {},
    useChallengerModel: true,
    preferExplicitPrimaryPrediction: false,
  });

  const gatedRows = applyCustomerRiskClassification(
    [{ id: 101, user_id: 1 }],
    [{ customer_id: 101, total_due: 7600, number_of_transactions: 14, number_of_late_payments: 3, average_payment_delay: 19, label: 1 }],
    gatedChallengerModel,
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 101,
          vector: highRiskVector,
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(gatedRows[0].trust_scoring_method === TRUST_SCORING_METHODS.LOGISTIC, 'without segment promotion, challenger should stay gated off');
  assert(gatedRows[0].trust_scoring_model_key === 'champion', 'without segment promotion, model key should remain champion');

  const shadowEvents = [];
  const promotedOverrideModel = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, {
    logger: () => {},
    useChallengerModel: true,
    challengerSegmentApproved: true,
    shadowMode: true,
    shadowLogger: (...args) => shadowEvents.push(args),
    preferExplicitPrimaryPrediction: false,
  });

  const challengerRows = applyCustomerRiskClassification(
    [{ id: 101, user_id: 1 }],
    [{ customer_id: 101, total_due: 7600, number_of_transactions: 14, number_of_late_payments: 3, average_payment_delay: 19, label: 1 }],
    promotedOverrideModel,
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 101,
          vector: highRiskVector,
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(challengerRows[0].trust_scoring_method === TRUST_SCORING_METHODS.LIGHTGBM, 'high activity volatile user should route to challenger when promoted');
  assert(challengerRows[0].trust_scoring_model_key === 'challenger', 'promotion override should switch to challenger');
  assert(challengerRows[0].trust_shadow_comparison && typeof challengerRows[0].trust_shadow_comparison === 'object', 'shadow payload should be attached');
  assert(Number.isFinite(Number(challengerRows[0].trust_shadow_comparison.championProbability)), 'shadow champion probability should be present');
  assert(Number.isFinite(Number(challengerRows[0].trust_shadow_comparison.challengerProbability)), 'shadow challenger probability should be present');
  assert(shadowEvents.length > 0, 'shadow logger should emit events');
  assertContributingFactors(challengerRows[0].contributing_factors, 'challenger route row');

  const lowConfidenceModel = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, {
    logger: () => {},
    useChallengerModel: false,
    preferExplicitPrimaryPrediction: false,
    getChampionPrediction: () => ({
      probability: 0.54,
      confidence: 0.03,
      riskLevel: 'MEDIUM',
      explanation: 'Synthetic low confidence logistic output.',
      reasons: ['Synthetic low confidence logistic output.'],
    }),
    routingConfig: {
      sparseHistoryThreshold: 3,
      richHistoryThreshold: 12,
      highVolatilityThreshold: 45,
      logisticConfidenceMin: 0.1,
      lightgbmConfidenceMin: 0.1,
    },
  });

  const lowConfidenceRows = applyCustomerRiskClassification(
    [{ id: 102, user_id: 1 }],
    [{ customer_id: 102, total_due: 1200, number_of_transactions: 14, number_of_late_payments: 1, average_payment_delay: 8 }],
    lowConfidenceModel,
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 102,
          vector: {
            due_amount: 1200,
            late_count: 1,
            avg_delay_days: 8,
            transaction_depth: 14,
            recency_days: 5,
            payment_consistency: 0.8,
            payment_volatility: 16,
          },
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(lowConfidenceRows[0].trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED, 'low confidence prediction must be overridden to fallback');
  assert(lowConfidenceRows[0].trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE_OVERRIDE, 'low confidence override reason must be reported');
  assertContributingFactors(lowConfidenceRows[0].contributing_factors, 'low-confidence fallback row');

  const newUserRows = applyCustomerRiskClassification(
    [{ id: 103, user_id: 1 }],
    [{ customer_id: 103, total_due: 600, number_of_transactions: 1, number_of_late_payments: 0, average_payment_delay: 0 }],
    createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID, { logger: () => {} }),
    {
      schema: null,
      generated_at: new Date().toISOString(),
      quality: null,
      items: [
        {
          customer_id: 103,
          vector: {
            due_amount: 600,
            late_count: 0,
            avg_delay_days: 0,
            transaction_depth: 1,
            recency_days: 2,
            payment_consistency: 1,
            payment_volatility: 0,
          },
          validation: { valid: true, issues: [] },
        },
      ],
    },
    { logger: () => {} }
  );

  assert(newUserRows[0].trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED, 'new user must route to fallback');
  assertContributingFactors(newUserRows[0].contributing_factors, 'new-user fallback row');

  return {
    passed: true,
    monotonic_checks: {
      due_amount: [lowDue.probability, highDue.probability],
      payment_consistency: [weakConsistency.probability, strongConsistency.probability],
    },
    sample_prediction: {
      probability: sample.probability,
      riskLevel: sample.riskLevel,
      trustScore: sample.trustScore,
    },
    challenger_sample_prediction: {
      probability: challengerSample.probability,
      riskLevel: challengerSample.riskLevel,
      trustScore: challengerSample.trustScore,
    },
  };
}
