import { TRUST_FEATURE_OUTPUT_KEYS, FEATURE_LOOKBACK_DAYS } from './schemaVersion.js';

const MAX_REASONABLE_DELAY_DAYS = 365;
const MAX_REASONABLE_DUE_AMOUNT = 1000000000;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function sanitizeRawFeatureSource(raw = {}) {
  return {
    customer_id: raw.customer_id || null,
    due_amount_raw: Math.max(0, toSafeNumber(raw.due_amount_raw, 0)),
    late_count_60d: Math.max(0, Math.trunc(toSafeNumber(raw.late_count_60d, 0))),
    avg_delay_days_60d: Math.max(0, toSafeNumber(raw.avg_delay_days_60d, 0)),
    transaction_depth_60d: Math.max(0, Math.trunc(toSafeNumber(raw.transaction_depth_60d, 0))),
    payment_count_60d: Math.max(0, Math.trunc(toSafeNumber(raw.payment_count_60d, 0))),
    on_time_payment_count_60d: Math.max(0, Math.trunc(toSafeNumber(raw.on_time_payment_count_60d, 0))),
    delay_sum_sq_60d: Math.max(0, toSafeNumber(raw.delay_sum_sq_60d, 0)),
    last_transaction_at: raw.last_transaction_at || null,
  };
}

export function validateRawFeatureSource(raw) {
  const issues = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      issues: ['raw source is missing or invalid'],
    };
  }

  if (raw.due_amount_raw > MAX_REASONABLE_DUE_AMOUNT) {
    issues.push('due_amount_raw above reasonable upper bound');
  }

  if (raw.avg_delay_days_60d > MAX_REASONABLE_DELAY_DAYS) {
    issues.push('avg_delay_days_60d above reasonable upper bound');
  }

  if (raw.on_time_payment_count_60d > raw.payment_count_60d) {
    issues.push('on_time_payment_count_60d cannot exceed payment_count_60d');
  }

  if (raw.transaction_depth_60d < raw.payment_count_60d) {
    issues.push('transaction_depth_60d should not be lower than payment_count_60d');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateComputedFeatureVector(vector) {
  const issues = [];

  TRUST_FEATURE_OUTPUT_KEYS.forEach((key) => {
    if (!isFiniteNumber(vector[key])) {
      issues.push(`feature ${key} is not a finite number`);
    }
  });

  if (isFiniteNumber(vector.payment_consistency)) {
    if (vector.payment_consistency < 0 || vector.payment_consistency > 1) {
      issues.push('payment_consistency must be within [0, 1]');
    }
  }

  if (isFiniteNumber(vector.avg_delay_days) && vector.avg_delay_days > MAX_REASONABLE_DELAY_DAYS) {
    issues.push('avg_delay_days above reasonable upper bound');
  }

  if (isFiniteNumber(vector.recency_days) && vector.recency_days > FEATURE_LOOKBACK_DAYS * 24) {
    issues.push('recency_days unusually high; likely missing transaction history');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function buildFeatureQualityReport(items) {
  const report = {
    total: items.length,
    valid: 0,
    invalid: 0,
    issueHistogram: {},
  };

  items.forEach((item) => {
    const issues = item?.validation?.issues || [];
    if (issues.length === 0) {
      report.valid += 1;
      return;
    }

    report.invalid += 1;
    issues.forEach((issue) => {
      report.issueHistogram[issue] = (report.issueHistogram[issue] || 0) + 1;
    });
  });

  return report;
}
