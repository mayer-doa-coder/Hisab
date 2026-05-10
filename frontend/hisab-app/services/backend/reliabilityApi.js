import { requestBackendJson } from './httpClient';

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
};

export const listSyncConflictsOnline = async ({ accessToken, status = 'open', limit = 100 } = {}) => {
  const query = buildQuery({ status, limit });
  return requestBackendJson({
    path: `/api/v1/reliability/sync/conflicts${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const createSyncConflictOnline = async ({
  accessToken,
  entityType,
  reason,
  clientChange = null,
  serverSnapshot = null,
  metadata = null,
} = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/sync/conflicts',
    method: 'POST',
    accessToken,
    body: {
      entityType,
      reason,
      clientChange,
      serverSnapshot,
      metadata,
    },
    timeoutMs: 12000,
  });
};

export const resolveSyncConflictOnline = async ({
  accessToken,
  conflictId,
  resolution,
  note = null,
  mergedData = null,
} = {}) => {
  return requestBackendJson({
    path: `/api/v1/reliability/sync/conflicts/${conflictId}/resolve`,
    method: 'POST',
    accessToken,
    body: {
      resolution,
      note,
      mergedData,
    },
    timeoutMs: 12000,
  });
};

export const getRetryPolicyOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/sync/retry-policy',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const evaluateRetryOnline = async ({ accessToken, attempts, lastAttemptAt = null, lastError = null, policy = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/sync/retry/evaluate',
    method: 'POST',
    accessToken,
    body: {
      attempts,
      lastAttemptAt,
      lastError,
      policy,
    },
    timeoutMs: 10000,
  });
};

export const pushOfflineQueueSnapshotOnline = async ({ accessToken, snapshot } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/offline-queue/snapshot',
    method: 'POST',
    accessToken,
    body: { snapshot },
    timeoutMs: 12000,
  });
};

export const fetchOfflineQueueSummaryOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/offline-queue/summary',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const uploadBackupOnline = async ({ accessToken, payload, label = null, schemaVersion = 'local-sqlite-v1', itemCount = 0 } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/backup/upload',
    method: 'POST',
    accessToken,
    body: {
      payload,
      label,
      schemaVersion,
      itemCount,
      source: 'mobile_app',
    },
    timeoutMs: 15000,
  });
};

export const listBackupsOnline = async ({ accessToken, limit = 30 } = {}) => {
  const query = buildQuery({ limit });
  return requestBackendJson({
    path: `/api/v1/reliability/backup/list${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const downloadBackupOnline = async ({ accessToken, backupId } = {}) => {
  return requestBackendJson({
    path: `/api/v1/reliability/backup/${backupId}/download`,
    method: 'GET',
    accessToken,
    timeoutMs: 15000,
  });
};

export const deleteBackupOnline = async ({ accessToken, backupId } = {}) => {
  return requestBackendJson({
    path: `/api/v1/reliability/backup/${backupId}`,
    method: 'DELETE',
    accessToken,
    timeoutMs: 10000,
  });
};

export const getRetentionPolicyOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/retention-policy',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const applyRetentionPolicyOnline = async ({ accessToken, policy } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/retention-policy/apply',
    method: 'POST',
    accessToken,
    body: { policy },
    timeoutMs: 12000,
  });
};

export const pushPerformanceSampleOnline = async ({ accessToken, route, method, statusCode, durationMs, metadata = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/monitoring/performance',
    method: 'POST',
    accessToken,
    body: {
      route,
      method,
      statusCode,
      durationMs,
      metadata,
    },
    timeoutMs: 8000,
  });
};

export const fetchPerformanceSummaryOnline = async ({ accessToken, windowMinutes = 30, limit = 1000 } = {}) => {
  const query = buildQuery({ windowMinutes, limit });
  return requestBackendJson({
    path: `/api/v1/reliability/monitoring/performance${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const pushCrashEventOnline = async ({ accessToken, severity = 'error', message, stack = null, metadata = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/monitoring/crash',
    method: 'POST',
    accessToken,
    body: {
      source: 'mobile_app',
      severity,
      message,
      stack,
      metadata,
    },
    timeoutMs: 8000,
  });
};

export const listCrashEventsOnline = async ({ accessToken, limit = 100, severity = null } = {}) => {
  const query = buildQuery({ limit, severity });
  return requestBackendJson({
    path: `/api/v1/reliability/monitoring/crash${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const listChaosScenariosOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/reliability/chaos/scenarios',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
  });
};

export const runChaosScenarioOnline = async ({ accessToken, scenarioId, dryRun = true } = {}) => {
  return requestBackendJson({
    path: `/api/v1/reliability/chaos/scenarios/${scenarioId}/run`,
    method: 'POST',
    accessToken,
    body: { dryRun },
    timeoutMs: 12000,
  });
};
