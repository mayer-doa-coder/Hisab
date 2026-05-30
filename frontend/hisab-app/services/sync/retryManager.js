export const DEFAULT_RETRY_POLICY = Object.freeze({
  baseDelayMs: 1500,
  maxDelayMs: 5 * 60 * 1000,
  maxAttempts: 8,
  nonRetryableTokens: [
    'rejected_validation',
    'rejected_business_rule',
    'pending_approval',
    'invalid',
    'authorization',
    'forbidden',
  ],
});

const toToken = (value) => String(value || '').trim().toLowerCase();

export const normalizeRetryPolicy = (override = null) => {
  const source = override && typeof override === 'object' && !Array.isArray(override) ? override : {};
  const baseDelayMs = Number.isFinite(Number(source.baseDelayMs)) ? Math.max(100, Number(source.baseDelayMs)) : DEFAULT_RETRY_POLICY.baseDelayMs;
  const maxDelayMs = Number.isFinite(Number(source.maxDelayMs)) ? Math.max(baseDelayMs, Number(source.maxDelayMs)) : DEFAULT_RETRY_POLICY.maxDelayMs;
  const maxAttempts = Number.isFinite(Number(source.maxAttempts)) ? Math.max(1, Math.trunc(Number(source.maxAttempts))) : DEFAULT_RETRY_POLICY.maxAttempts;
  const nonRetryableTokens = Array.isArray(source.nonRetryableTokens) && source.nonRetryableTokens.length
    ? source.nonRetryableTokens.map((row) => toToken(row)).filter(Boolean)
    : DEFAULT_RETRY_POLICY.nonRetryableTokens;

  return {
    baseDelayMs,
    maxDelayMs,
    maxAttempts,
    nonRetryableTokens,
  };
};

/**
 * Computes the delay before the next retry using exponential backoff with
 * full-jitter (±30%). Jitter spreads burst retries from many devices that
 * all lost connectivity at the same time (e.g., tower outage), preventing
 * a thundering-herd when connectivity returns.
 *
 * Schedule (baseDelayMs=1500, jitter excluded):
 *   attempt 1 →  1.5s
 *   attempt 2 →    3s
 *   attempt 3 →    6s
 *   attempt 4 →   12s
 *   attempt 5 →   24s
 *   attempt 6 →   48s
 *   attempt 7 →  96s  (~1.6 min)
 *   attempt 8 → 300s  (5 min cap)
 */
export const computeRetryDelayMs = ({ attempt = 1, policy = null } = {}) => {
  const config = normalizeRetryPolicy(policy);
  const safeAttempt = Math.max(1, Math.trunc(Number(attempt) || 1));
  const exponential = config.baseDelayMs * (2 ** (safeAttempt - 1));
  const capped = Math.min(config.maxDelayMs, exponential);
  // Full jitter: uniform random in [0, capped] — keeps average = capped/2
  // but fully eliminates correlated retry spikes.
  const jitter = Math.random() * capped * 0.3; // ±30%
  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.max(500, Math.round(capped + sign * jitter));
};

export const evaluateRetryVisibility = ({ attempts = 0, lastAttemptAt = null, lastError = null, policy = null } = {}) => {
  const config = normalizeRetryPolicy(policy);
  const safeAttempts = Number.isFinite(Number(attempts)) ? Math.max(0, Math.trunc(Number(attempts))) : 0;
  const errorToken = toToken(lastError);

  const nonRetryable = config.nonRetryableTokens.some((needle) => errorToken.includes(needle));
  if (nonRetryable) {
    return {
      shouldRetry: false,
      exhausted: true,
      reason: 'non_retryable',
      nextRetryAt: null,
      retryInMs: null,
      attempts: safeAttempts,
      policy: config,
    };
  }

  if (safeAttempts >= config.maxAttempts) {
    return {
      shouldRetry: false,
      exhausted: true,
      reason: 'max_attempts',
      nextRetryAt: null,
      retryInMs: null,
      attempts: safeAttempts,
      policy: config,
    };
  }

  const nextAttempt = safeAttempts + 1;
  const delayMs = computeRetryDelayMs({ attempt: nextAttempt, policy: config });
  const baselineMs = lastAttemptAt ? new Date(lastAttemptAt).getTime() : Date.now();
  const safeBaselineMs = Number.isFinite(baselineMs) ? baselineMs : Date.now();
  const nextRetryMs = safeBaselineMs + delayMs;
  const retryInMs = Math.max(0, nextRetryMs - Date.now());

  return {
    shouldRetry: retryInMs <= 0,
    exhausted: false,
    reason: retryInMs <= 0 ? 'ready' : 'cooldown',
    nextRetryAt: new Date(nextRetryMs).toISOString(),
    retryInMs,
    attempts: nextAttempt,
    policy: config,
  };
};
