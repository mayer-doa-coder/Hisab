'use strict';

const CUSTOMER_MARKOV_STATES_CONFIG = Object.freeze({
  version: 'customer_markov_state_space_v1',
  locked: true,
  locked_at: '2026-04-27T00:00:00.000Z',
  fallback_state: 'SLOW_PAYER',
  states: [
    {
      key: 'CHAMPION',
      label: 'Champion Payer',
      label_bn: 'চ্যাম্পিয়ন পরিশোধকারী',
      description: 'Consistent on-time payments, minimal outstanding balance.',
      priority: 1,
    },
    {
      key: 'RELIABLE',
      label: 'Reliable Payer',
      label_bn: 'নির্ভরযোগ্য পরিশোধকারী',
      description: 'Mostly on-time with minor delays, manageable outstanding balance.',
      priority: 2,
    },
    {
      key: 'SLOW_PAYER',
      label: 'Slow Payer',
      label_bn: 'দেরি পরিশোধকারী',
      description: 'Pays consistently but with notable delays (3–14 days late).',
      priority: 3,
    },
    {
      key: 'RECOVERING',
      label: 'Recovering',
      label_bn: 'পুনরুদ্ধারমান',
      description: 'Improving payment trend after a period of strain or risk.',
      priority: 4,
    },
    {
      key: 'STRAINED',
      label: 'Financially Strained',
      label_bn: 'আর্থিক চাপে',
      description: 'High balance or frequent delays; showing signs of financial pressure.',
      priority: 5,
    },
    {
      key: 'AT_RISK',
      label: 'At Risk',
      label_bn: 'ঝুঁকিতে',
      description: 'Very high balance, long delays, low payment consistency.',
      priority: 6,
    },
    {
      key: 'NEW_CUSTOMER',
      label: 'New Customer',
      label_bn: 'নতুন গ্রাহক',
      description: 'Fewer than 3 transactions — insufficient history to classify.',
      priority: 7,
    },
    {
      key: 'DORMANT',
      label: 'Dormant',
      label_bn: 'নিষ্ক্রিয়',
      description: 'No activity for 60+ days with an outstanding balance.',
      priority: 8,
    },
  ],
  // Rule thresholds used by customerStateEngine
  thresholds: {
    dormant:       { recency_days_min: 60 },
    new_customer:  { transaction_depth_max: 3 },
    at_risk:       { due_amount_min_bdt: 3000, avg_delay_days_min: 15, payment_consistency_max: 0.45 },
    strained:      { due_amount_min_bdt: 1200, avg_delay_days_min: 7,  payment_consistency_max: 0.65 },
    recovering:    { recency_days_max: 25, eligible_previous_states: ['AT_RISK', 'STRAINED', 'DORMANT'] },
    slow_payer:    { avg_delay_days_min: 3 },
    reliable:      { payment_consistency_min: 0.72, due_amount_max_bdt: 2000, avg_delay_days_max: 7 },
    champion:      { payment_consistency_min: 0.90, due_amount_max_bdt: 500,  transaction_depth_min: 8 },
  },
});

// ─── Derived exports ──────────────────────────────────────────────────────────

const deepClone = (v) => JSON.parse(JSON.stringify(v));

const CUSTOMER_STATE_KEYS = Object.freeze(
  CUSTOMER_MARKOV_STATES_CONFIG.states.map((s) => s.key)
);

const CUSTOMER_STATE_LABELS = Object.freeze(
  CUSTOMER_MARKOV_STATES_CONFIG.states.reduce((acc, s) => { acc[s.key] = s.label; return acc; }, {})
);

const CUSTOMER_STATE_LABELS_BN = Object.freeze(
  CUSTOMER_MARKOV_STATES_CONFIG.states.reduce((acc, s) => { acc[s.key] = s.label_bn; return acc; }, {})
);

const getCustomerStateLabel = (key, lang = 'en') => {
  const k = String(key || '').trim().toUpperCase();
  return (lang === 'bn' ? CUSTOMER_STATE_LABELS_BN : CUSTOMER_STATE_LABELS)[k] || k;
};

const getCustomerMarkovStatesConfig = () => deepClone(CUSTOMER_MARKOV_STATES_CONFIG);

// Domain prior: base smoothing priors reflecting realistic weekly transition patterns.
// Rows are from-state, columns are to-state.
// Used as the initial count matrix before real data is observed.
const CUSTOMER_DOMAIN_PRIOR = Object.freeze({
  CHAMPION:     { CHAMPION: 12, RELIABLE: 3, SLOW_PAYER: 1, RECOVERING: 0, STRAINED: 0, AT_RISK: 0, NEW_CUSTOMER: 0, DORMANT: 0 },
  RELIABLE:     { CHAMPION: 4, RELIABLE: 10, SLOW_PAYER: 3, RECOVERING: 0, STRAINED: 1, AT_RISK: 0, NEW_CUSTOMER: 0, DORMANT: 0 },
  SLOW_PAYER:   { CHAMPION: 1, RELIABLE: 3, SLOW_PAYER: 12, RECOVERING: 0, STRAINED: 3, AT_RISK: 1, NEW_CUSTOMER: 0, DORMANT: 0 },
  RECOVERING:   { CHAMPION: 1, RELIABLE: 5, SLOW_PAYER: 4, RECOVERING: 8, STRAINED: 2, AT_RISK: 0, NEW_CUSTOMER: 0, DORMANT: 0 },
  STRAINED:     { CHAMPION: 0, RELIABLE: 1, SLOW_PAYER: 2, RECOVERING: 3, STRAINED: 10, AT_RISK: 4, NEW_CUSTOMER: 0, DORMANT: 0 },
  AT_RISK:      { CHAMPION: 0, RELIABLE: 0, SLOW_PAYER: 1, RECOVERING: 1, STRAINED: 2, AT_RISK: 14, NEW_CUSTOMER: 0, DORMANT: 2 },
  NEW_CUSTOMER: { CHAMPION: 2, RELIABLE: 6, SLOW_PAYER: 4, RECOVERING: 0, STRAINED: 1, AT_RISK: 0, NEW_CUSTOMER: 5, DORMANT: 0 },
  DORMANT:      { CHAMPION: 0, RELIABLE: 1, SLOW_PAYER: 1, RECOVERING: 1, STRAINED: 2, AT_RISK: 4, NEW_CUSTOMER: 1, DORMANT: 10 },
});

module.exports = {
  CUSTOMER_MARKOV_STATES_CONFIG,
  CUSTOMER_STATE_KEYS,
  CUSTOMER_STATE_LABELS,
  CUSTOMER_STATE_LABELS_BN,
  CUSTOMER_DOMAIN_PRIOR,
  getCustomerMarkovStatesConfig,
  getCustomerStateLabel,
};
