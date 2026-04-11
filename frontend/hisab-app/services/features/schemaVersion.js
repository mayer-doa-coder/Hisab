export const FEATURE_SCHEMA_NAME = 'feature_schema_v1';
export const FEATURE_SCHEMA_VERSION = '1.0.0';

// Phase 1 lock: all behavior-based features use a fixed 60-day lookback.
export const FEATURE_LOOKBACK_DAYS = 60;

export const ON_TIME_DELAY_THRESHOLD_DAYS = 7;
export const LATE_DELAY_THRESHOLD_DAYS = 30;

export const FEATURE_SCHEMA_ID = `${FEATURE_SCHEMA_NAME}:${FEATURE_SCHEMA_VERSION}`;

export const TRUST_FEATURE_OUTPUT_KEYS = [
  'due_amount',
  'late_count',
  'avg_delay_days',
  'transaction_depth',
  'recency_days',
  'payment_consistency',
  'payment_volatility',
];

export const buildFeatureSchemaMetadata = () => ({
  schema_name: FEATURE_SCHEMA_NAME,
  schema_version: FEATURE_SCHEMA_VERSION,
  schema_id: FEATURE_SCHEMA_ID,
  lookback_days: FEATURE_LOOKBACK_DAYS,
  on_time_delay_threshold_days: ON_TIME_DELAY_THRESHOLD_DAYS,
  late_delay_threshold_days: LATE_DELAY_THRESHOLD_DAYS,
  output_keys: [...TRUST_FEATURE_OUTPUT_KEYS],
});
