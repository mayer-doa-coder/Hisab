const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { success } = require('../../utils/apiResponse');
const { badRequest } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, getActorUserIdFromReq } = require('./controllerUtils');
const {
  createConflictRecord,
  listConflictRecords,
  resolveConflictRecord,
  summarizeConflictRecords,
  applyConflictRetentionPolicy,
} = require('../../sync/conflictResolver');
const {
  DEFAULT_RETRY_POLICY,
  normalizePolicy,
  evaluateRetryDecision,
  recordQueueSnapshot,
  getQueueSummary,
} = require('../../sync/retryManager');
const {
  trackClientPerformance,
  getPerformanceSnapshot,
} = require('../../monitoring/performanceTracker');
const {
  recordCrashEvent,
  listCrashEvents,
} = require('../../monitoring/crashLogger');

const RELIABILITY_DIR = path.join(__dirname, '..', '..', 'artifacts', 'reliability');
const BACKUP_STORE_FILE = path.join(RELIABILITY_DIR, 'backupStore.json');

const DEFAULT_RETENTION_POLICY = Object.freeze({
  maxBackupsPerUser: 10,
  maxBackupAgeDays: 30,
  maxConflictAgeDays: 30,
  maxConflictRecords: 1000,
});

const CHAOS_SCENARIOS = Object.freeze([
  {
    id: 'network_partition_mobile_sync',
    title: 'Network Partition During Mobile Sync',
    description: 'Simulates packet loss and timeout spikes during sync bursts.',
    blastRadius: 'sync_pipeline',
    expectedSignal: 'Queue backlog grows while retry cooldowns increase.',
  },
  {
    id: 'clock_skew_conflict_spike',
    title: 'Clock Skew Conflict Spike',
    description: 'Simulates client timestamp drift creating optimistic-lock conflicts.',
    blastRadius: 'conflict_resolution',
    expectedSignal: 'Conflict queue rises with repeated version mismatch statuses.',
  },
  {
    id: 'partial_backend_latency',
    title: 'Partial Backend Latency Regression',
    description: 'Injects delayed responses for selected endpoints without full outage.',
    blastRadius: 'api_performance',
    expectedSignal: 'p95 latency increases while error rates remain below hard failure.',
  },
  {
    id: 'corrupted_backup_payload',
    title: 'Corrupted Backup Payload Drill',
    description: 'Tests restore validation against malformed or incomplete backup artifacts.',
    blastRadius: 'backup_restore',
    expectedSignal: 'Restore is rejected with validation errors and no data loss.',
  },
]);

const ensureReliabilityDir = () => {
  if (!fs.existsSync(RELIABILITY_DIR)) {
    fs.mkdirSync(RELIABILITY_DIR, { recursive: true });
  }
};

const safeParseJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const readBackupStore = () => {
  ensureReliabilityDir();
  if (!fs.existsSync(BACKUP_STORE_FILE)) {
    return {
      version: 1,
      retentionPolicy: { ...DEFAULT_RETENTION_POLICY },
      backups: [],
    };
  }

  const raw = fs.readFileSync(BACKUP_STORE_FILE, 'utf8');
  const parsed = safeParseJson(raw, {
    version: 1,
    retentionPolicy: { ...DEFAULT_RETENTION_POLICY },
    backups: [],
  });

  return {
    version: Number(parsed.version || 1),
    retentionPolicy: {
      ...DEFAULT_RETENTION_POLICY,
      ...(parsed.retentionPolicy && typeof parsed.retentionPolicy === 'object' ? parsed.retentionPolicy : {}),
    },
    backups: Array.isArray(parsed.backups) ? parsed.backups : [],
  };
};

const writeBackupStore = (store) => {
  ensureReliabilityDir();
  const payload = {
    version: 1,
    retentionPolicy: {
      ...DEFAULT_RETENTION_POLICY,
      ...(store?.retentionPolicy && typeof store.retentionPolicy === 'object' ? store.retentionPolicy : {}),
    },
    backups: Array.isArray(store?.backups) ? store.backups : [],
  };

  fs.writeFileSync(BACKUP_STORE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
};

const toPositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.trunc(numeric);
};

const sanitizeBackupForList = (row = {}) => ({
  backupId: String(row.backupId || '').trim(),
  userId: String(row.userId || '').trim(),
  label: String(row.label || '').trim() || null,
  createdAt: String(row.createdAt || ''),
  sizeBytes: Number(row.sizeBytes || 0),
  checksum: String(row.checksum || '').trim() || null,
  schemaVersion: String(row.schemaVersion || '').trim() || null,
  itemCount: Number(row.itemCount || 0),
  source: String(row.source || '').trim() || 'device',
});

const applyBackupRetentionPolicy = ({ store, policyOverride = null } = {}) => {
  const safeStore = store && typeof store === 'object' ? store : readBackupStore();
  const policy = {
    ...safeStore.retentionPolicy,
    ...(policyOverride && typeof policyOverride === 'object' ? policyOverride : {}),
  };

  const maxBackupsPerUser = toPositiveInt(policy.maxBackupsPerUser, DEFAULT_RETENTION_POLICY.maxBackupsPerUser);
  const maxBackupAgeDays = toPositiveInt(policy.maxBackupAgeDays, DEFAULT_RETENTION_POLICY.maxBackupAgeDays);
  const cutoffMs = Date.now() - (maxBackupAgeDays * 24 * 60 * 60 * 1000);

  const grouped = new Map();
  for (const row of safeStore.backups || []) {
    const userId = String(row.userId || '').trim();
    if (!userId) {
      continue;
    }

    if (!grouped.has(userId)) {
      grouped.set(userId, []);
    }

    grouped.get(userId).push(row);
  }

  const retained = [];
  for (const rows of grouped.values()) {
    const next = rows
      .filter((row) => {
        const ts = new Date(row.createdAt || 0).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, maxBackupsPerUser);

    retained.push(...next);
  }

  safeStore.backups = retained.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  safeStore.retentionPolicy = {
    ...safeStore.retentionPolicy,
    maxBackupsPerUser,
    maxBackupAgeDays,
  };

  writeBackupStore(safeStore);

  return {
    policy: safeStore.retentionPolicy,
    kept: safeStore.backups.length,
  };
};

const parseLimit = (req, fallback = 100, max = 500) => {
  const value = Number(req.query?.limit);
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return Math.min(value, max);
};

const listSyncConflicts = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const status = String(req.query?.status || 'open').trim().toLowerCase() || 'open';
  const limit = parseLimit(req, 100, 500);

  const items = listConflictRecords({ userId, status, limit });
  const summary = summarizeConflictRecords({ userId });

  return success(req, res, {
    items,
    summary,
  });
});

const createSyncConflict = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const entityType = String(req.body?.entityType || req.body?.entity || '').trim() || 'unknown';
  const reason = String(req.body?.reason || req.body?.message || 'sync_conflict').trim();

  if (!reason) {
    throw badRequest('reason is required to create a conflict record.');
  }

  const item = createConflictRecord({
    userId,
    entityType,
    reason,
    clientChange: req.body?.clientChange || null,
    serverSnapshot: req.body?.serverSnapshot || null,
    metadata: req.body?.metadata || null,
    source: req.body?.source || 'sync',
  });

  return success(req, res, { item }, 201);
});

const resolveSyncConflict = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const actorUserId = getActorUserIdFromReq(req);
  const conflictId = String(req.params?.conflictId || '').trim();
  const resolution = String(req.body?.resolution || '').trim().toLowerCase();

  if (!conflictId) {
    throw badRequest('conflictId is required.');
  }

  if (!resolution) {
    throw badRequest('resolution is required.');
  }

  const item = resolveConflictRecord({
    userId,
    conflictId,
    resolution,
    resolvedBy: actorUserId || userId,
    resolutionNote: req.body?.note || null,
    mergedData: req.body?.mergedData || null,
  });

  if (!item) {
    throw badRequest('Conflict record not found.', null, 'CONFLICT_NOT_FOUND');
  }

  return success(req, res, { item });
});

const getRetryPolicy = asyncHandler(async (req, res) => {
  return success(req, res, {
    policy: normalizePolicy(DEFAULT_RETRY_POLICY),
  });
});

const evaluateRetry = asyncHandler(async (req, res) => {
  const decision = evaluateRetryDecision({
    attempts: req.body?.attempts,
    lastAttemptAt: req.body?.lastAttemptAt,
    lastError: req.body?.lastError,
    policy: req.body?.policy || null,
  });

  return success(req, res, {
    decision,
  });
});

const ingestOfflineQueueSnapshot = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const item = recordQueueSnapshot({
    userId,
    snapshot: req.body?.snapshot || req.body || {},
  });

  return success(req, res, {
    item,
  }, 201);
});

const getOfflineQueueSummary = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const summary = getQueueSummary({ userId });
  return success(req, res, summary);
});

const uploadBackup = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const payload = req.body?.payload;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('payload object is required.');
  }

  const serialized = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes > 2 * 1024 * 1024) {
    throw badRequest('Backup payload is too large. Maximum supported size is 2MB.', {
      sizeBytes,
      maxBytes: 2 * 1024 * 1024,
    });
  }

  const store = readBackupStore();
  const backupId = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const row = {
    backupId,
    userId,
    label: req.body?.label ? String(req.body.label).trim() : null,
    schemaVersion: req.body?.schemaVersion ? String(req.body.schemaVersion).trim() : '1',
    source: req.body?.source ? String(req.body.source).trim() : 'device',
    createdAt: new Date().toISOString(),
    sizeBytes,
    itemCount: Number(req.body?.itemCount || 0),
    checksum: crypto.createHash('sha256').update(serialized).digest('hex'),
    payload,
  };

  store.backups.push(row);
  writeBackupStore(store);
  applyBackupRetentionPolicy({ store });

  return success(req, res, {
    backup: sanitizeBackupForList(row),
  }, 201);
});

const listBackups = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const limit = parseLimit(req, 50, 200);

  const store = readBackupStore();
  const items = store.backups
    .filter((row) => String(row.userId || '').trim() === userId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit)
    .map((row) => sanitizeBackupForList(row));

  return success(req, res, {
    items,
    retentionPolicy: store.retentionPolicy,
  });
});

const downloadBackup = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const backupId = String(req.params?.backupId || '').trim();
  if (!backupId) {
    throw badRequest('backupId is required.');
  }

  const store = readBackupStore();
  const row = store.backups.find((candidate) => {
    return String(candidate.backupId || '').trim() === backupId
      && String(candidate.userId || '').trim() === userId;
  });

  if (!row) {
    throw badRequest('Backup not found.', null, 'BACKUP_NOT_FOUND');
  }

  return success(req, res, {
    backup: sanitizeBackupForList(row),
    payload: row.payload,
  });
});

const deleteBackup = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const backupId = String(req.params?.backupId || '').trim();
  if (!backupId) {
    throw badRequest('backupId is required.');
  }

  const store = readBackupStore();
  const before = store.backups.length;
  store.backups = store.backups.filter((row) => {
    const sameOwner = String(row.userId || '').trim() === userId;
    const sameBackup = String(row.backupId || '').trim() === backupId;
    return !(sameOwner && sameBackup);
  });

  const deleted = before - store.backups.length;
  writeBackupStore(store);

  return success(req, res, {
    deleted,
  });
});

const getRetentionPolicy = asyncHandler(async (req, res) => {
  const store = readBackupStore();
  return success(req, res, {
    retentionPolicy: {
      ...DEFAULT_RETENTION_POLICY,
      ...store.retentionPolicy,
    },
  });
});

const applyRetentionPolicy = asyncHandler(async (req, res) => {
  const store = readBackupStore();
  const nextPolicy = {
    ...store.retentionPolicy,
    ...(req.body?.policy && typeof req.body.policy === 'object' ? req.body.policy : {}),
  };

  const backupResult = applyBackupRetentionPolicy({
    store,
    policyOverride: nextPolicy,
  });

  const conflictResult = applyConflictRetentionPolicy({
    maxAgeDays: nextPolicy.maxConflictAgeDays,
    maxRecords: nextPolicy.maxConflictRecords,
  });

  return success(req, res, {
    retentionPolicy: {
      ...DEFAULT_RETENTION_POLICY,
      ...nextPolicy,
    },
    backupResult,
    conflictResult,
  });
});

const ingestPerformanceSample = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const row = trackClientPerformance({
    route: req.body?.route || req.body?.path || 'unknown',
    method: req.body?.method || 'POST',
    statusCode: req.body?.statusCode || 0,
    durationMs: req.body?.durationMs || req.body?.latencyMs || 0,
    userId,
    metadata: req.body?.metadata || null,
  });

  return success(req, res, { row }, 201);
});

const getPerformanceSummary = asyncHandler(async (req, res) => {
  const windowMinutes = Number(req.query?.windowMinutes || 30);
  const summary = getPerformanceSnapshot({
    windowMinutes,
    limit: parseLimit(req, 1000, 5000),
  });

  return success(req, res, summary);
});

const ingestCrashEvent = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const row = recordCrashEvent({
    source: req.body?.source || 'client',
    severity: req.body?.severity || 'error',
    message: req.body?.message || 'Client crash event',
    stack: req.body?.stack || null,
    metadata: req.body?.metadata || null,
    userId,
    requestId: req.requestId || null,
  });

  return success(req, res, { row }, 201);
});

const getCrashEvents = asyncHandler(async (req, res) => {
  const items = listCrashEvents({
    limit: parseLimit(req, 100, 500),
    severity: req.query?.severity || null,
  });

  return success(req, res, { items });
});

const listChaosScenarios = asyncHandler(async (req, res) => {
  return success(req, res, {
    scenarios: CHAOS_SCENARIOS,
  });
});

const runChaosScenario = asyncHandler(async (req, res) => {
  const scenarioId = String(req.params?.scenarioId || '').trim();
  if (!scenarioId) {
    throw badRequest('scenarioId is required.');
  }

  const scenario = CHAOS_SCENARIOS.find((row) => row.id === scenarioId);
  if (!scenario) {
    throw badRequest('Scenario not found.', null, 'SCENARIO_NOT_FOUND');
  }

  const dryRun = req.body?.dryRun !== false;
  const seededRiskScore = (Date.now() % 1000) / 1000;
  const impactBand = seededRiskScore > 0.66 ? 'high' : seededRiskScore > 0.33 ? 'medium' : 'low';

  return success(req, res, {
    scenario,
    execution: {
      dryRun,
      startedAt: new Date().toISOString(),
      status: dryRun ? 'simulated' : 'scheduled',
      impactBand,
      recommendedActions: [
        'Observe retry backlog growth and conflict open rate.',
        'Verify backup restore validation remains strict.',
        'Confirm p95 latency and error-rate alerts fire as expected.',
      ],
    },
  });
});

module.exports = {
  listSyncConflicts,
  createSyncConflict,
  resolveSyncConflict,
  getRetryPolicy,
  evaluateRetry,
  ingestOfflineQueueSnapshot,
  getOfflineQueueSummary,
  uploadBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  getRetentionPolicy,
  applyRetentionPolicy,
  ingestPerformanceSample,
  getPerformanceSummary,
  ingestCrashEvent,
  getCrashEvents,
  listChaosScenarios,
  runChaosScenario,
};
