import {
  FEATURE_LOOKBACK_DAYS,
  ON_TIME_DELAY_THRESHOLD_DAYS,
  LATE_DELAY_THRESHOLD_DAYS,
  buildFeatureSchemaMetadata,
} from './schemaVersion.js';

export const TRUST_FEATURE_DEFINITIONS = [
  {
    key: 'due_amount',
    dataType: 'float',
    unit: 'BDT',
    windowDays: 'snapshot',
    sourceFields: ['due_amount_raw'],
    formula: 'max(0, due_amount_raw)',
    description: 'Current outstanding customer due amount.',
  },
  {
    key: 'late_count',
    dataType: 'int',
    unit: 'count',
    windowDays: FEATURE_LOOKBACK_DAYS,
    sourceFields: ['late_count_60d'],
    formula: `count(payment_delay_days > ${LATE_DELAY_THRESHOLD_DAYS}) in last ${FEATURE_LOOKBACK_DAYS} days`,
    description: 'Number of late payments in the 60-day behavior window.',
  },
  {
    key: 'avg_delay_days',
    dataType: 'float',
    unit: 'days',
    windowDays: FEATURE_LOOKBACK_DAYS,
    sourceFields: ['avg_delay_days_60d'],
    formula: `mean(payment_delay_days) over payments in last ${FEATURE_LOOKBACK_DAYS} days`,
    description: 'Average payment delay in days during the 60-day window.',
  },
  {
    key: 'transaction_depth',
    dataType: 'int',
    unit: 'count',
    windowDays: FEATURE_LOOKBACK_DAYS,
    sourceFields: ['transaction_depth_60d'],
    formula: `count(credit + payment transactions) in last ${FEATURE_LOOKBACK_DAYS} days`,
    description: 'Total observed credit/payment transactions in the 60-day window.',
  },
  {
    key: 'recency_days',
    dataType: 'float',
    unit: 'days',
    windowDays: 'all-time to now',
    sourceFields: ['last_transaction_at'],
    formula: 'max(0, days_between(now, last_transaction_at))',
    description: 'Days since latest customer transaction event.',
  },
  {
    key: 'payment_consistency',
    dataType: 'float',
    unit: 'ratio',
    windowDays: FEATURE_LOOKBACK_DAYS,
    sourceFields: ['on_time_payment_count_60d', 'payment_count_60d'],
    formula: `on_time_payment_count_60d / max(1, payment_count_60d), on-time means delay <= ${ON_TIME_DELAY_THRESHOLD_DAYS} days`,
    description: 'On-time payment ratio in the 60-day behavior window.',
  },
  {
    key: 'payment_volatility',
    dataType: 'float',
    unit: 'days^2',
    windowDays: FEATURE_LOOKBACK_DAYS,
    sourceFields: ['delay_sum_sq_60d', 'avg_delay_days_60d', 'payment_count_60d'],
    formula: 'max(0, (delay_sum_sq_60d / max(1, payment_count_60d)) - avg_delay_days_60d^2)',
    description: 'Variance of payment delay behavior in the 60-day window.',
  },
];

export const TRUST_FEATURE_SCHEMA = {
  ...buildFeatureSchemaMetadata(),
  features: TRUST_FEATURE_DEFINITIONS,
};

export const TRUST_FEATURE_DEFAULTS = {
  due_amount: 0,
  late_count: 0,
  avg_delay_days: 0,
  transaction_depth: 0,
  recency_days: FEATURE_LOOKBACK_DAYS,
  payment_consistency: 0.5,
  payment_volatility: 0,
};
