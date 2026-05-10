const fs = require('fs');
const path = require('path');

const RELIABILITY_DIR = path.join(__dirname, '..', 'artifacts', 'reliability');
const QUEUE_SNAPSHOTS_FILE = path.join(RELIABILITY_DIR, 'offlineQueueSnapshots.json');

const DEFAULT_RETRY_POLICY = Object.freeze({
  baseDelayMs: 1500,
  maxDelayMs: 5 * 60 * 1000,
  maxAttempts: 8,
  jitterFactor: 0.15,
  nonRetryableTokens: [
    'rejected_validation',
    'rejected_business_rule',
    'pending_approval',
    'invalid',
    'validation',
    'authorization',
    'forbidden',
  ],
});

const ensureReliabilityDir = () => {
  if (!fs.existsSync(RELIABILITY_DIR)) {
    fs.mkdirSync(RELIABILITY_DIR, { recursive: true });
  }
};

const normalizePolicy = (override = null) => {
  const input = override && typeof override === 'object' && !Array.isArray(override)
    ? override
    : {};

  const baseDelayMs = Number.isFinite(Number(input.baseDelayMs)) ? Math.max(100, Number(input.baseDelayMs)) : DEFAULT_RETRY_POLICY.baseDelayMs;
  const maxDelayMs = Number.isFinite(Number(input.maxDelayMs)) ? Math.max(baseDelayMs, Number(input.maxDelayMs)) : DEFAULT_RETRY_POLICY.maxDelayMs;
  const maxAttempts = Number.isFinite(Number(input.maxAttempts)) ? Math.max(1, Math.trunc(Number(input.maxAttempts))) : DEFAULT_RETRY_POLICY.maxAttempts;
  const jitterFactor = Number.isFinite(Number(input.jitterFactor))
    ? Math.max(0, Math.min(1, Number(input.jitterFactor)))
    : DEFAULT_RETRY_POLICY.jitterFactor;
  const nonRetryableTokens = Array.isArray(input.nonRetryableTokens) && input.nonRetryableTokens.length
    ? input.nonRetryableTokens.map((row) => String(row || '').trim().toLowerCase()).filter(Boolean)
    : DEFAULT_RETRY_POLICY.nonRetryableTokens;

  return {
    baseDelayMs,
    maxDelayMs,
    maxAttempts,
    jitterFactor,
    nonRetryableTokens,
  };
};

const computeBackoffMs = ({ attempt = 1, policy = null } = {}) => {
  const config = normalizePolicy(policy);
  const safeAttempt = Math.max(1, Math.trunc(Number(attempt) || 1));

  const pureBackoff = Math.min(
    config.maxDelayMs,
    config.baseDelayMs * (2 ** (safeAttempt - 1))
  );

  if (config.jitterFactor <= 0) {
    return Math.trunc(pureBackoff);
  }

  const jitterWindow = pureBackoff * config.jitterFactor;
  const jitter = (Math.random() * jitterWindow * 2) - jitterWindow;
  return Math.max(100, Math.trunc(pureBackoff + jitter));
};

const isNonRetryableError = ({ message = null, policy = null } = {}) => {
  const token = String(message || '').trim().toLowerCase();
  if (!token) {
    return false;
  }

  const config = normalizePolicy(policy);
  return config.nonRetryableTokens.some((needle) => token.includes(needle));
};

const evaluateRetryDecision = ({
  attempts = 0,
  lastAttemptAt = null,
  lastError = null,
  policy = null,
} = {}) => {
  const config = normalizePolicy(policy);
  const normalizedAttempts = Number.isFinite(Number(attempts)) ? Math.max(0, Math.trunc(Number(attempts))) : 0;
  const nonRetryable = isNonRetryableError({ message: lastError, policy: config });

  if (nonRetryable) {
    return {
      shouldRetryNow: false,
      retryExhausted: true,
      retryInMs: null,
      nextRetryAt: null,
      attemptNumber: normalizedAttempts,
      reason: 'non_retryable_error',
      policy: config,
    };
  }

  if (normalizedAttempts >= config.maxAttempts) {
    return {
      shouldRetryNow: false,
      retryExhausted: true,
      retryInMs: null,
      nextRetryAt: null,
      attemptNumber: normalizedAttempts,
      reason: 'max_attempts_reached',
      policy: config,
    };
  }

  const nextAttempt = normalizedAttempts + 1;
  const backoffMs = computeBackoffMs({ attempt: nextAttempt, policy: config });
  const baseline = lastAttemptAt ? new Date(lastAttemptAt).getTime() : Date.now();
  const safeBaseline = Number.isFinite(baseline) ? baseline : Date.now();
  const nextRetryAtMs = safeBaseline + backoffMs;
  const retryInMs = Math.max(0, nextRetryAtMs - Date.now());

  return {
    shouldRetryNow: retryInMs <= 0,
    retryExhausted: false,
    retryInMs,
    nextRetryAt: new Date(nextRetryAtMs).toISOString(),
    attemptNumber: nextAttempt,
    reason: retryInMs <= 0 ? 'ready' : 'cooldown',
    policy: config,
  };
};

const readQueueSnapshotStore = () => {
  ensureReliabilityDir();

  if (!fs.existsSync(QUEUE_SNAPSHOTS_FILE)) {
    return {
      version: 1,
      snapshots: [],
    };
  }

  try {
    const raw = fs.readFileSync(QUEUE_SNAPSHOTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: Number(parsed?.version || 1),
      snapshots: Array.isArray(parsed?.snapshots) ? parsed.snapshots : [],
    };
  } catch {
    return {
      version: 1,
      snapshots: [],
    };
  }
};

const writeQueueSnapshotStore = (store) => {
  ensureReliabilityDir();
  const payload = {
    version: 1,
    snapshots: Array.isArray(store?.snapshots) ? store.snapshots : [],
  };

  fs.writeFileSync(QUEUE_SNAPSHOTS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
};

const recordQueueSnapshot = ({ userId, snapshot } = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('userId is required for queue snapshot tracking.');
  }

  const safeSnapshot = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot
    : {};

  const store = readQueueSnapshotStore();
  const entry = {
    snapshotId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: normalizedUserId,
    createdAt: new Date().toISOString(),
    pending: Number.isFinite(Number(safeSnapshot.pending)) ? Math.max(0, Math.trunc(Number(safeSnapshot.pending))) : 0,
    failed: Number.isFinite(Number(safeSnapshot.failed)) ? Math.max(0, Math.trunc(Number(safeSnapshot.failed))) : 0,
    maxAttempts: Number.isFinite(Number(safeSnapshot.maxAttempts)) ? Math.max(0, Math.trunc(Number(safeSnapshot.maxAttempts))) : 0,
    oldestQueuedAt: safeSnapshot.oldestQueuedAt ? String(safeSnapshot.oldestQueuedAt) : null,
    newestQueuedAt: safeSnapshot.newestQueuedAt ? String(safeSnapshot.newestQueuedAt) : null,
    byEntity: safeSnapshot.byEntity && typeof safeSnapshot.byEntity === 'object' ? safeSnapshot.byEntity : {},
    recentErrors: Array.isArray(safeSnapshot.recentErrors) ? safeSnapshot.recentErrors.slice(0, 20) : [],
  };

  store.snapshots.push(entry);

  store.snapshots = store.snapshots
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 2000);

  writeQueueSnapshotStore(store);
  return entry;
};

const listQueueSnapshots = ({ userId, limit = 30 } = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return [];
  }

  const effectiveLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
  const store = readQueueSnapshotStore();

  return store.snapshots
    .filter((row) => String(row?.userId || '') === normalizedUserId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, effectiveLimit);
};

const getQueueSummary = ({ userId } = {}) => {
  const snapshots = listQueueSnapshots({ userId, limit: 50 });
  const latest = snapshots[0] || null;

  const trend = snapshots
    .slice(0, 12)
    .reverse()
    .map((row) => ({
      at: row.createdAt,
      pending: Number(row.pending || 0),
      failed: Number(row.failed || 0),
    }));

  return {
    hasData: Boolean(latest),
    latest,
    trend,
    samples: snapshots.length,
  };
};

module.exports = {
  DEFAULT_RETRY_POLICY,
  normalizePolicy,
  computeBackoffMs,
  evaluateRetryDecision,
  recordQueueSnapshot,
  listQueueSnapshots,
  getQueueSummary,
};
