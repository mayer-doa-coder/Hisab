import { computeFeatureBatch } from './featureCalculator.js';
import { TRUST_FEATURE_OUTPUT_KEYS } from './schemaVersion.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFeatureKeys(vector) {
  TRUST_FEATURE_OUTPUT_KEYS.forEach((key) => {
    assert(Object.prototype.hasOwnProperty.call(vector, key), `missing feature key: ${key}`);
    assert(Number.isFinite(vector[key]), `non-finite feature value: ${key}`);
  });
}

export const FEATURE_PIPELINE_TEST_CASES = [
  {
    name: 'normal-history',
    row: {
      customer_id: 101,
      due_amount_raw: 2500,
      late_count_60d: 2,
      avg_delay_days_60d: 8,
      transaction_depth_60d: 14,
      payment_count_60d: 6,
      on_time_payment_count_60d: 4,
      delay_sum_sq_60d: 520,
      last_transaction_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    expect: (item) => {
      assert(item.validation.valid, 'normal-history should be valid');
      assert(item.vector.payment_consistency > 0.6, 'expected higher payment consistency');
    },
  },
  {
    name: 'missing-fields-fallback',
    row: {
      customer_id: 102,
    },
    expect: (item) => {
      assert(item.validation.valid, 'missing-fields-fallback should be valid after defaults');
      assert(item.vector.transaction_depth === 0, 'expected zero transaction depth fallback');
      assert(item.vector.payment_consistency === 0.5, 'expected default payment consistency');
    },
  },
  {
    name: 'extreme-values-sanitized',
    row: {
      customer_id: 103,
      due_amount_raw: 9999999999,
      late_count_60d: 999,
      avg_delay_days_60d: 999,
      transaction_depth_60d: 2000,
      payment_count_60d: 1000,
      on_time_payment_count_60d: 1500,
      delay_sum_sq_60d: 999999999,
      last_transaction_at: '1999-01-01T00:00:00.000Z',
    },
    expect: (item) => {
      assert(!item.validation.valid, 'extreme-values-sanitized should be flagged invalid');
      assert(item.validation.issues.length > 0, 'expected validation issues for extreme values');
    },
  },
  {
    name: 'no-history',
    row: {
      customer_id: 104,
      due_amount_raw: 0,
      late_count_60d: 0,
      avg_delay_days_60d: 0,
      transaction_depth_60d: 0,
      payment_count_60d: 0,
      on_time_payment_count_60d: 0,
      delay_sum_sq_60d: 0,
      last_transaction_at: null,
    },
    expect: (item) => {
      assert(item.validation.valid, 'no-history should be valid');
      assert(item.vector.recency_days >= 60, 'expected fallback recency days for missing history');
    },
  },
];

export function runFeaturePipelineSelfTests() {
  const batch = computeFeatureBatch(FEATURE_PIPELINE_TEST_CASES.map((testCase) => testCase.row));

  assert(batch.items.length === FEATURE_PIPELINE_TEST_CASES.length, 'unexpected feature batch size');

  batch.items.forEach((item, index) => {
    assertFeatureKeys(item.vector);
    FEATURE_PIPELINE_TEST_CASES[index].expect(item);
  });

  return {
    passed: true,
    total: FEATURE_PIPELINE_TEST_CASES.length,
    quality: batch.quality,
  };
}
