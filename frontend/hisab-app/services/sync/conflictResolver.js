const CONFLICT_TOKENS = [
  'conflict',
  'version_mismatch',
  'requires_client_resolution',
  'idempotency_key_reused_with_different_payload',
];

const toToken = (value) => String(value || '').trim().toLowerCase();

export const isConflictStatus = (value) => {
  const token = toToken(value);
  if (!token) {
    return false;
  }

  return CONFLICT_TOKENS.some((needle) => token.includes(needle));
};

export const buildConflictRecordFromQueueItem = ({ item, ack = null } = {}) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const message = ack?.message || item.last_error || 'Sync conflict detected.';
  const statusToken = toToken(ack?.status || item.last_error || '');

  return {
    conflictId: `local_${Number(item.id || 0)}`,
    entityType: String(item.entity_type || 'unknown').trim() || 'unknown',
    reason: message,
    status: isConflictStatus(statusToken) ? 'open' : 'unknown',
    createdAt: item.created_at || new Date().toISOString(),
    updatedAt: item.updated_at || item.created_at || new Date().toISOString(),
    clientChange: item.payload || null,
    serverSnapshot: ack?.serverSnapshot || null,
    source: 'offline_queue',
  };
};

export const resolveConflictPayload = ({ mode = 'client_wins', localData = null, remoteData = null } = {}) => {
  const normalizedMode = toToken(mode) || 'client_wins';

  if (normalizedMode === 'server_wins') {
    return {
      resolution: 'server_wins',
      mergedData: remoteData && typeof remoteData === 'object' ? remoteData : null,
    };
  }

  if (normalizedMode === 'merge') {
    return {
      resolution: 'merge',
      mergedData: {
        ...(remoteData && typeof remoteData === 'object' ? remoteData : {}),
        ...(localData && typeof localData === 'object' ? localData : {}),
      },
    };
  }

  return {
    resolution: 'client_wins',
    mergedData: localData && typeof localData === 'object' ? localData : null,
  };
};
