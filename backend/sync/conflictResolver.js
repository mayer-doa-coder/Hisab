const fs = require('fs');
const path = require('path');

const RELIABILITY_DIR = path.join(__dirname, '..', 'artifacts', 'reliability');
const CONFLICTS_FILE = path.join(RELIABILITY_DIR, 'syncConflicts.json');

const DEFAULT_STORE = Object.freeze({
  version: 1,
  conflicts: [],
});

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

const readConflictStore = () => {
  ensureReliabilityDir();
  if (!fs.existsSync(CONFLICTS_FILE)) {
    return {
      version: DEFAULT_STORE.version,
      conflicts: [],
    };
  }

  const raw = fs.readFileSync(CONFLICTS_FILE, 'utf8');
  const parsed = safeParseJson(raw, DEFAULT_STORE);
  return {
    version: Number(parsed.version || 1),
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
  };
};

const writeConflictStore = (store) => {
  ensureReliabilityDir();
  const payload = {
    version: 1,
    conflicts: Array.isArray(store?.conflicts) ? store.conflicts : [],
  };

  fs.writeFileSync(CONFLICTS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
};

const normalizeToken = (value) => String(value || '').trim();

const normalizeStatus = (value, fallback = 'open') => {
  const token = normalizeToken(value).toLowerCase();
  if (token === 'open' || token === 'resolved' || token === 'ignored') {
    return token;
  }

  return fallback;
};

const buildConflictId = () => {
  return `cf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const sanitizeConflictForRead = (row = {}) => {
  return {
    conflictId: normalizeToken(row.conflictId),
    userId: normalizeToken(row.userId),
    entityType: normalizeToken(row.entityType) || 'unknown',
    reason: normalizeToken(row.reason) || 'sync_conflict',
    status: normalizeStatus(row.status, 'open'),
    source: normalizeToken(row.source) || 'sync',
    createdAt: normalizeToken(row.createdAt) || new Date().toISOString(),
    updatedAt: normalizeToken(row.updatedAt) || normalizeToken(row.createdAt) || new Date().toISOString(),
    resolvedAt: normalizeToken(row.resolvedAt) || null,
    resolvedBy: normalizeToken(row.resolvedBy) || null,
    resolution: normalizeToken(row.resolution) || null,
    resolutionNote: normalizeToken(row.resolutionNote) || null,
    clientChange: row.clientChange && typeof row.clientChange === 'object' ? row.clientChange : null,
    serverSnapshot: row.serverSnapshot && typeof row.serverSnapshot === 'object' ? row.serverSnapshot : null,
    mergedData: row.mergedData && typeof row.mergedData === 'object' ? row.mergedData : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
};

const createConflictRecord = ({
  userId,
  entityType,
  reason,
  clientChange = null,
  serverSnapshot = null,
  metadata = null,
  source = 'sync',
} = {}) => {
  const normalizedUserId = normalizeToken(userId);
  if (!normalizedUserId) {
    throw new Error('userId is required to create conflict records.');
  }

  const store = readConflictStore();
  const now = new Date().toISOString();

  const row = sanitizeConflictForRead({
    conflictId: buildConflictId(),
    userId: normalizedUserId,
    entityType: normalizeToken(entityType) || 'unknown',
    reason: normalizeToken(reason) || 'sync_conflict',
    status: 'open',
    source,
    createdAt: now,
    updatedAt: now,
    clientChange,
    serverSnapshot,
    metadata,
  });

  store.conflicts.push(row);
  writeConflictStore(store);
  return row;
};

const listConflictRecords = ({ userId, status = 'open', limit = 100 } = {}) => {
  const normalizedUserId = normalizeToken(userId);
  if (!normalizedUserId) {
    return [];
  }

  const normalizedStatus = normalizeToken(status).toLowerCase();
  const effectiveLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;

  const store = readConflictStore();
  return store.conflicts
    .map((row) => sanitizeConflictForRead(row))
    .filter((row) => row.userId === normalizedUserId)
    .filter((row) => normalizedStatus === 'all' || row.status === normalizedStatus)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, effectiveLimit);
};

const resolveConflictRecord = ({
  userId,
  conflictId,
  resolution,
  resolvedBy = null,
  resolutionNote = null,
  mergedData = null,
} = {}) => {
  const normalizedUserId = normalizeToken(userId);
  const normalizedConflictId = normalizeToken(conflictId);
  const normalizedResolution = normalizeToken(resolution).toLowerCase();

  if (!normalizedUserId || !normalizedConflictId) {
    return null;
  }

  if (!normalizedResolution) {
    throw new Error('resolution is required to resolve a conflict.');
  }

  const store = readConflictStore();
  const index = store.conflicts.findIndex((row) => {
    const candidate = sanitizeConflictForRead(row);
    return candidate.userId === normalizedUserId && candidate.conflictId === normalizedConflictId;
  });

  if (index < 0) {
    return null;
  }

  const row = sanitizeConflictForRead(store.conflicts[index]);
  const now = new Date().toISOString();
  const next = {
    ...row,
    status: 'resolved',
    resolution: normalizedResolution,
    resolutionNote: normalizeToken(resolutionNote) || null,
    mergedData: mergedData && typeof mergedData === 'object' ? mergedData : row.mergedData,
    resolvedBy: normalizeToken(resolvedBy) || normalizedUserId,
    resolvedAt: now,
    updatedAt: now,
  };

  store.conflicts[index] = next;
  writeConflictStore(store);
  return next;
};

const summarizeConflictRecords = ({ userId } = {}) => {
  const rows = listConflictRecords({ userId, status: 'all', limit: 5000 });
  const summary = {
    total: rows.length,
    open: 0,
    resolved: 0,
    ignored: 0,
    byReason: {},
    byEntity: {},
  };

  for (const row of rows) {
    const status = normalizeStatus(row.status, 'open');
    summary[status] = (summary[status] || 0) + 1;

    const reason = normalizeToken(row.reason) || 'unknown';
    summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;

    const entity = normalizeToken(row.entityType) || 'unknown';
    summary.byEntity[entity] = (summary.byEntity[entity] || 0) + 1;
  }

  return summary;
};

const applyConflictRetentionPolicy = ({ maxAgeDays = 30, maxRecords = 1000 } = {}) => {
  const normalizedMaxAgeDays = Number.isFinite(Number(maxAgeDays)) ? Math.max(1, Number(maxAgeDays)) : 30;
  const normalizedMaxRecords = Number.isFinite(Number(maxRecords)) ? Math.max(100, Math.trunc(Number(maxRecords))) : 1000;
  const cutoffMs = Date.now() - (normalizedMaxAgeDays * 24 * 60 * 60 * 1000);

  const store = readConflictStore();
  const filtered = store.conflicts
    .map((row) => sanitizeConflictForRead(row))
    .filter((row) => {
      const ts = new Date(row.updatedAt || row.createdAt || 0).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, normalizedMaxRecords);

  const removed = Math.max(0, store.conflicts.length - filtered.length);
  writeConflictStore({ version: 1, conflicts: filtered });

  return {
    kept: filtered.length,
    removed,
    policy: {
      maxAgeDays: normalizedMaxAgeDays,
      maxRecords: normalizedMaxRecords,
    },
  };
};

module.exports = {
  createConflictRecord,
  listConflictRecords,
  resolveConflictRecord,
  summarizeConflictRecords,
  applyConflictRetentionPolicy,
};
