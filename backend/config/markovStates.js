const MARKOV_STATE_CONFIG = Object.freeze({
  version: 'markov_state_space_v1',
  locked: true,
  locked_at: '2026-04-12T00:00:00.000Z',
  fallback_state: 'SIDEWAYS_STABLE',
  states: [
    {
      key: 'LIQUIDITY_STRESS',
      label: 'Liquidity Stress',
      description: 'Insufficient tradable liquidity with elevated spread pressure.',
      priority: 1,
    },
    {
      key: 'QUEUE_PRESSURE',
      label: 'Queue Pressure',
      description: 'Order-flow imbalance indicates one-sided queue pressure.',
      priority: 2,
    },
    {
      key: 'HIGH_VOLATILITY',
      label: 'High Volatility',
      description: 'Large intraperiod price range indicates unstable movement.',
      priority: 3,
    },
    {
      key: 'STRONG_UPTREND',
      label: 'Strong Uptrend',
      description: 'Strong positive trend with supportive momentum and controlled volatility.',
      priority: 4,
    },
    {
      key: 'RECOVERY_PHASE',
      label: 'Recovery Phase',
      description: 'Positive reversal after stress/downtrend with improving liquidity conditions.',
      priority: 5,
    },
    {
      key: 'WEAK_UPTREND',
      label: 'Weak Uptrend',
      description: 'Mild positive trend with low-to-moderate momentum.',
      priority: 6,
    },
    {
      key: 'DOWNTREND',
      label: 'Downtrend',
      description: 'Negative trend and momentum dominate price behavior.',
      priority: 7,
    },
    {
      key: 'SIDEWAYS_STABLE',
      label: 'Sideways Stable',
      description: 'Balanced regime with limited directional bias and contained volatility.',
      priority: 99,
    },
  ],
  thresholds: {
    trend: {
      strong_uptrend_min: 0.02,
      weak_uptrend_min: 0.005,
      downtrend_max: -0.01,
      recovery_min: 0.006,
    },
    momentum: {
      high_min: 0.015,
      weak_min: 0.002,
      downtrend_max: -0.008,
    },
    volatility: {
      high_min: 0.04,
      stable_max: 0.02,
      uptrend_max: 0.05,
    },
    liquidity: {
      stress_score_high: 0.65,
      stress_score_moderate_max: 0.45,
      spread_to_close_stress_min: 0.015,
      volume_to_floor_stress_max: 0.9,
    },
    queue_pressure: {
      absolute_high_min: 0.6,
      absolute_moderate_max: 0.35,
    },
  },
  mapping_rules: [
    {
      state: 'LIQUIDITY_STRESS',
      if: 'liquidity_stress_score >= stress_score_high OR spread_to_close_ratio >= spread_to_close_stress_min OR volume_to_floor_ratio <= volume_to_floor_stress_max',
    },
    {
      state: 'QUEUE_PRESSURE',
      if: 'abs(queue_pressure) >= absolute_high_min AND liquidity_stress_score < stress_score_high',
    },
    {
      state: 'HIGH_VOLATILITY',
      if: 'volatility_ratio >= high_min AND liquidity_stress_score < stress_score_high',
    },
    {
      state: 'STRONG_UPTREND',
      if: 'trend_pct >= strong_uptrend_min AND momentum_pct >= high_min AND volatility_ratio <= uptrend_max',
    },
    {
      state: 'RECOVERY_PHASE',
      if: 'previous_state in [DOWNTREND, LIQUIDITY_STRESS, HIGH_VOLATILITY] AND trend_pct >= recovery_min AND liquidity_stress_score <= stress_score_moderate_max',
    },
    {
      state: 'WEAK_UPTREND',
      if: 'trend_pct >= weak_uptrend_min AND momentum_pct >= weak_min',
    },
    {
      state: 'DOWNTREND',
      if: 'trend_pct <= downtrend_max OR momentum_pct <= downtrend_max',
    },
    {
      state: 'SIDEWAYS_STABLE',
      if: 'default_fallback',
    },
  ],
});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const validateMarkovStateConfig = () => {
  const states = Array.isArray(MARKOV_STATE_CONFIG.states) ? MARKOV_STATE_CONFIG.states : [];
  if (states.length < 4 || states.length > 8) {
    throw new Error('Markov state space must contain between 4 and 8 states.');
  }

  if (MARKOV_STATE_CONFIG.locked !== true) {
    throw new Error('Markov state space must be locked before transition modeling.');
  }

  const keys = states.map((state) => state.key);
  const keySet = new Set(keys);
  if (keySet.size !== keys.length) {
    throw new Error('Duplicate markov state keys detected.');
  }

  if (!keySet.has(MARKOV_STATE_CONFIG.fallback_state)) {
    throw new Error('Fallback markov state is not defined in states list.');
  }

  const ruleStates = new Set(MARKOV_STATE_CONFIG.mapping_rules.map((rule) => rule.state));
  if (!ruleStates.has(MARKOV_STATE_CONFIG.fallback_state)) {
    throw new Error('Markov mapping rules must include fallback state rule.');
  }
};

validateMarkovStateConfig();

const STATE_LABELS = Object.freeze(
  MARKOV_STATE_CONFIG.states.reduce((acc, state) => {
    acc[state.key] = state.label;
    return acc;
  }, {})
);

const getMarkovStateLabel = (key) => {
  const normalized = String(key || '').trim().toUpperCase();
  return STATE_LABELS[normalized] || normalized || MARKOV_STATE_CONFIG.fallback_state;
};

module.exports = {
  MARKOV_STATE_CONFIG,
  MARKOV_STATE_KEYS: Object.freeze(MARKOV_STATE_CONFIG.states.map((state) => state.key)),
  getMarkovStateConfig: () => deepClone(MARKOV_STATE_CONFIG),
  getMarkovStateLabel,
};
