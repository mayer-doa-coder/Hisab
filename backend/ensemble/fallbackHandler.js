const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeDistribution = (distribution = {}) => {
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution)) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  const high = Math.max(0, toNumber(distribution.HIGH_DEMAND ?? distribution.high_demand, 0));
  const low = Math.max(0, toNumber(distribution.LOW_DEMAND ?? distribution.low_demand, 0));
  const stable = Math.max(0, toNumber(distribution.STABLE ?? distribution.stable, 0));

  const total = high + low + stable;
  if (total <= 0) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  return {
    HIGH_DEMAND: Number((high / total).toFixed(6)),
    LOW_DEMAND: Number((low / total).toFixed(6)),
    STABLE: Number((stable / total).toFixed(6)),
  };
};

const sanitizeInputs = ({ ema = null, threshold = null, markov = null } = {}) => {
  const fallbackNotes = [];

  const safeThresholdDecision = String(threshold?.decision || '').trim().toUpperCase();
  const safeThreshold = {
    decision: safeThresholdDecision === 'REORDER' || safeThresholdDecision === 'NO_REORDER'
      ? safeThresholdDecision
      : 'NO_REORDER',
    confidence: clamp(toNumber(threshold?.confidence, 0.5), 0, 1),
  };

  if (!threshold || typeof threshold !== 'object') {
    fallbackNotes.push('Threshold model missing; using safe NO_REORDER baseline.');
  }

  const safeEmaTrend = String(ema?.trend || 'NEUTRAL').trim().toUpperCase();
  const safeEma = {
    ema_score: clamp(toNumber(ema?.ema_score, 0.5), 0, 1),
    trend: safeEmaTrend === 'UP' || safeEmaTrend === 'DOWN' || safeEmaTrend === 'NEUTRAL'
      ? safeEmaTrend
      : 'NEUTRAL',
  };

  if (!ema || typeof ema !== 'object') {
    fallbackNotes.push('EMA model missing; using neutral EMA signal.');
  }

  const safeMarkov = {
    confidence: clamp(toNumber(markov?.confidence, 0), 0, 1),
    uncertainty: clamp(toNumber(markov?.uncertainty, 1), 0, 1),
    next_state_distribution: normalizeDistribution(markov?.next_state_distribution || {}),
  };

  if (!markov || typeof markov !== 'object') {
    fallbackNotes.push('Markov model missing; using zero-confidence fallback.');
  }

  return {
    ema: safeEma,
    threshold: safeThreshold,
    markov: safeMarkov,
    fallbackNotes,
  };
};

const applyFallback = ({
  inputs = {},
  context = {},
} = {}) => {
  const sanitized = sanitizeInputs(inputs);

  const allUnavailable =
    (!inputs?.ema || typeof inputs.ema !== 'object')
    && (!inputs?.threshold || typeof inputs.threshold !== 'object')
    && (!inputs?.markov || typeof inputs.markov !== 'object');

  const forceSafeHold = allUnavailable || Boolean(context.force_safe_hold || context.forceSafeHold || false);

  if (forceSafeHold) {
    return {
      sanitized,
      forceSafeHold: true,
      fallbackNotes: [
        ...sanitized.fallbackNotes,
        'All model signals unavailable; applying safe HOLD fallback.',
      ],
    };
  }

  return {
    sanitized,
    forceSafeHold: false,
    fallbackNotes: sanitized.fallbackNotes,
  };
};

module.exports = {
  normalizeDistribution,
  sanitizeInputs,
  applyFallback,
};
