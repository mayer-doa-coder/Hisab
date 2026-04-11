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

function assertStandardFormat(output) {
  assert(output && typeof output === 'object', 'trust output must be an object');
  assert(Number.isFinite(Number(output.score)), 'trust output score must be numeric');
  assert(typeof output.riskLevel === 'string', 'trust output riskLevel must be string');
  assert(typeof output.method === 'string', 'trust output method must be string');
  assert(typeof output.reason === 'string', 'trust output reason must be string');
  assert(typeof output.explanation === 'string', 'trust output explanation must be string');
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
  });
}

function buildFeatureBatch(items) {
  return {
    schema: null,
    generated_at: new Date().toISOString(),
    quality: null,
    items,
  };
}

const baseCustomers = [
  { id: 1, name: 'New Customer', user_id: 1001 },
  { id: 2, name: 'Partial Data', user_id: 1001 },
  { id: 3, name: 'Low Confidence', user_id: 1001 },
  { id: 4, name: 'Corrupted Input', user_id: 1001 },
  { id: 5, name: 'Confident ML', user_id: 1001 },
];

const baseRiskRows = [
  { customer_id: 1, total_due: 500, number_of_transactions: 0, number_of_late_payments: 0, average_payment_delay: 0 },
  { customer_id: 2, total_due: 200, number_of_transactions: 4, number_of_late_payments: 0, average_payment_delay: 2 },
  { customer_id: 3, total_due: 1200, number_of_transactions: 8, number_of_late_payments: 1, average_payment_delay: 9 },
  { customer_id: 4, total_due: 3000, number_of_transactions: 7, number_of_late_payments: 4, average_payment_delay: 35 },
  { customer_id: 5, total_due: 300, number_of_transactions: 12, number_of_late_payments: 0, average_payment_delay: 1 },
];

const baseFeatureBatch = buildFeatureBatch([
  {
    customer_id: 1,
    vector: {
      due_amount: 500,
      payment_consistency: 0.5,
      recency_days: 3,
      transaction_depth: 0,
    },
    validation: { valid: true, issues: [] },
  },
  {
    customer_id: 2,
    vector: {
      due_amount: null,
      payment_consistency: 0.8,
      recency_days: 2,
      transaction_depth: 4,
    },
    validation: { valid: true, issues: [] },
  },
  {
    customer_id: 3,
    vector: {
      due_amount: 1200,
      payment_consistency: 0.7,
      recency_days: 4,
      transaction_depth: 8,
    },
    validation: { valid: true, issues: [] },
  },
  {
    customer_id: 4,
    vector: {
      due_amount: 3000,
      payment_consistency: 0.2,
      recency_days: 6,
      transaction_depth: 7,
    },
    validation: { valid: false, issues: ['feature checksum mismatch'] },
  },
  {
    customer_id: 5,
    vector: {
      due_amount: 300,
      payment_consistency: 0.95,
      recency_days: 1,
      transaction_depth: 12,
    },
    validation: { valid: true, issues: [] },
  },
]);

const hybridModel = createCustomerRiskModel(RISK_MODEL_TYPES.HYBRID);

export function runTrustFallbackSelfTests() {
  const primaryPredictions = [
    { customer_id: 3, probability: 0.5, confidence: 0.92 },
    { customer_id: 5, probability: 0.15, confidence: 0.9 },
  ];

  const rows = applyCustomerRiskClassification(
    baseCustomers,
    baseRiskRows,
    hybridModel,
    baseFeatureBatch,
    { primaryPredictions, logger: () => {} }
  );

  assert(rows.length === 5, 'expected 5 scored customers');

  const byId = new Map(rows.map((row) => [row.id, row]));

  const lowHistoryRow = byId.get(1);
  assert(lowHistoryRow.trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED_FALLBACK, 'new customer must fallback');
  assert(lowHistoryRow.trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.LOW_HISTORY, 'new customer reason must be LOW_HISTORY');
  assertStandardFormat(lowHistoryRow.trust_score_output);
  assertContributingFactors(lowHistoryRow.contributing_factors, 'low-history row');

  const partialDataRow = byId.get(2);
  assert(partialDataRow.trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED_FALLBACK, 'partial data must fallback');
  assert(partialDataRow.trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.INSUFFICIENT_DATA, 'partial data reason must be INSUFFICIENT_DATA');
  assertStandardFormat(partialDataRow.trust_score_output);
  assertContributingFactors(partialDataRow.contributing_factors, 'partial-data row');

  const lowConfidenceRow = byId.get(3);
  assert(lowConfidenceRow.trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED_FALLBACK, 'low confidence prediction must fallback');
  assert(lowConfidenceRow.trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.LOW_CONFIDENCE, 'low confidence reason must be LOW_CONFIDENCE');
  assertStandardFormat(lowConfidenceRow.trust_score_output);
  assertContributingFactors(lowConfidenceRow.contributing_factors, 'low-confidence row');

  const corruptedRow = byId.get(4);
  assert(corruptedRow.trust_scoring_method === TRUST_SCORING_METHODS.RULE_BASED_FALLBACK, 'corrupted data must fallback');
  assert(corruptedRow.trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.DATA_QUALITY_ISSUE, 'corrupted reason must be DATA_QUALITY_ISSUE');
  assertStandardFormat(corruptedRow.trust_score_output);
  assertContributingFactors(corruptedRow.contributing_factors, 'corrupted row');

  const confidentMlRow = byId.get(5);
  assert(confidentMlRow.trust_scoring_method === TRUST_SCORING_METHODS.LOGISTIC, 'confident prediction must use logistic output');
  assert(confidentMlRow.trust_scoring_reason_code === TRUST_FALLBACK_REASON_CODES.ROUTED_TO_LOGISTIC, 'confident logistic route should report ROUTED_TO_LOGISTIC');
  assertStandardFormat(confidentMlRow.trust_score_output);
  assertContributingFactors(confidentMlRow.contributing_factors, 'confident-ml row');

  return {
    passed: true,
    total: 5,
    methods: rows.map((row) => ({ id: row.id, method: row.trust_scoring_method, reason: row.trust_scoring_reason_code })),
  };
}
