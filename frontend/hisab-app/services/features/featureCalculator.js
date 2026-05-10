import {
  FEATURE_LOOKBACK_DAYS,
  buildFeatureSchemaMetadata,
} from './schemaVersion.js';
import {
  TRUST_FEATURE_DEFAULTS,
  TRUST_FEATURE_SCHEMA,
} from './featureDefinitions.js';
import {
  sanitizeRawFeatureSource,
  validateRawFeatureSource,
  validateComputedFeatureVector,
  buildFeatureQualityReport,
} from './dataValidation.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function daysBetween(fromDate, toDateValue) {
  const to = toDate(toDateValue);
  if (!to) {
    return FEATURE_LOOKBACK_DAYS;
  }
  const diff = fromDate.getTime() - to.getTime();
  return Math.max(0, diff / MS_PER_DAY);
}

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeFromSanitized(raw, now) {
  const paymentCount = Math.max(0, raw.payment_count_60d);
  const safePaymentCount = Math.max(1, paymentCount);
  const avgDelay = Math.max(0, raw.avg_delay_days_60d);
  const secondMoment = raw.delay_sum_sq_60d / safePaymentCount;
  const paymentConsistency = paymentCount === 0
    ? TRUST_FEATURE_DEFAULTS.payment_consistency
    : clamp01(raw.on_time_payment_count_60d / safePaymentCount);

  const output = {
    due_amount: Math.max(0, raw.due_amount_raw),
    late_count: Math.max(0, raw.late_count_60d),
    avg_delay_days: avgDelay,
    transaction_depth: Math.max(0, raw.transaction_depth_60d),
    recency_days: daysBetween(now, raw.last_transaction_at),
    payment_consistency: paymentConsistency,
    payment_volatility: Math.max(0, secondMoment - avgDelay * avgDelay),
  };

  return {
    ...TRUST_FEATURE_DEFAULTS,
    ...output,
  };
}

export function computeFeatureVector(rawSource, now = new Date()) {
  const sanitized = sanitizeRawFeatureSource(rawSource);
  const rawValidation = validateRawFeatureSource(sanitized);
  const vector = computeFromSanitized(sanitized, now);
  const featureValidation = validateComputedFeatureVector(vector);

  return {
    customer_id: sanitized.customer_id,
    schema: buildFeatureSchemaMetadata(),
    vector,
    validation: {
      valid: rawValidation.valid && featureValidation.valid,
      issues: [...rawValidation.issues, ...featureValidation.issues],
    },
  };
}

export function computeFeatureBatch(rawSources, now = new Date()) {
  const rows = Array.isArray(rawSources) ? rawSources : [];
  const items = rows.map((row) => computeFeatureVector(row, now));
  const quality = buildFeatureQualityReport(items);

  return {
    schema: TRUST_FEATURE_SCHEMA,
    generated_at: now.toISOString(),
    quality,
    items,
  };
}
