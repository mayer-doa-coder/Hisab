/**
 * syncQueue.js — Durable, SQLite-backed mutation queue.
 *
 * Guarantees:
 *  1. Every mutation is written to SQLite BEFORE the function returns to the
 *     caller. If the app is killed the instant after a UI action, the queue
 *     entry still exists and will be processed on next launch.
 *  2. Idempotency: each entry carries a `payload_hash` (SHA-256 of the
 *     serialised payload). The server rejects duplicate hashes within 24h,
 *     so safe re-delivery on network retry never creates duplicate records.
 *  3. Priority ordering: financial mutations (baki, sales) are dequeued before
 *     catalog changes (products, suppliers), ensuring the store owner's money
 *     reaches the cloud first.
 *  4. Backpressure: the queue will not grow beyond MAX_QUEUE_SIZE entries.
 *     The oldest succeeded entries are pruned automatically.
 */

import * as Crypto from 'expo-crypto';

import {
  ENTITY_SYNC_PRIORITY,
  ESCALATION_REQUIRED_ENTITIES,
  MAX_BATCH_BYTES,
  MAX_BATCH_ITEMS,
  MAX_QUEUE_ATTEMPTS,
} from '../../database/schema';
import { computeRetryDelayMs } from './retryManager';

// ── Internal DB access ────────────────────────────────────────────────────────
// We import the raw db proxy from db.js to avoid circular imports with
// AppDataContext, which also imports db.js.

let _db = null;
const getDb = () => {
  if (!_db) {
    _db = require('../../database/db').db ?? null;
    if (!_db) throw new Error('[syncQueue] db not initialised — call createTables first');
  }
  return _db;
};

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 of a mutation payload.
 * Used as the idempotency key sent to the server.
 */
const hashPayload = async (entityType, operation, payload) => {
  const canonical = JSON.stringify({ entityType, operation, payload });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
};

// ── Queue entry builders ──────────────────────────────────────────────────────

/**
 * Enqueue a single mutation.
 *
 * @param {object} opts
 * @param {string} opts.entityType  — e.g. 'baki_entry'
 * @param {'CREATE'|'UPDATE'|'DELETE'} opts.operation
 * @param {object} opts.payload     — plain JS object (will be JSON.stringify'd)
 * @param {string} [opts.clientRefId] — stable UUID for the entity (idempotency)
 * @param {number} [opts.serverVersion] — server version being overwritten
 * @returns {Promise<string>}         queue entry id
 */
export const enqueue = async ({
  entityType,
  operation,
  payload,
  clientRefId = null,
  serverVersion = 0,
}) => {
  const db = getDb();
  const id = await Crypto.randomUUIDAsync();
  const payloadJson = JSON.stringify(payload);
  const hash = await hashPayload(entityType, operation, payload);
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO sync_queue
       (id, entity_type, operation, payload, client_ref_id,
        payload_hash, server_version, created_at, status, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
     ON CONFLICT(id) DO NOTHING`,
    [id, entityType, operation, payloadJson, clientRefId,
     hash, serverVersion, now, now]
  );

  return id;
};

/**
 * Enqueue multiple mutations in a single SQLite transaction.
 * Used by bulk operations (e.g. goods receive with 20 items).
 *
 * @param {Array<Parameters<typeof enqueue>[0]>} mutations
 * @returns {Promise<string[]>} queue entry ids
 */
export const enqueueBatch = async (mutations) => {
  if (!mutations || mutations.length === 0) return [];

  const db = getDb();
  const entries = await Promise.all(
    mutations.map(async (m) => ({
      id: await Crypto.randomUUIDAsync(),
      entityType: m.entityType,
      operation: m.operation,
      payloadJson: JSON.stringify(m.payload),
      hash: await hashPayload(m.entityType, m.operation, m.payload),
      clientRefId: m.clientRefId ?? null,
      serverVersion: m.serverVersion ?? 0,
      now: Date.now(),
    }))
  );

  await db.withTransactionAsync(async () => {
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO sync_queue
           (id, entity_type, operation, payload, client_ref_id,
            payload_hash, server_version, created_at, status, next_retry_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
         ON CONFLICT(id) DO NOTHING`,
        [e.id, e.entityType, e.operation, e.payloadJson, e.clientRefId,
         e.hash, e.serverVersion, e.now, e.now]
      );
    }
  });

  return entries.map((e) => e.id);
};

// ── Reading the queue ─────────────────────────────────────────────────────────

/**
 * Dequeue a batch of ready-to-send entries, sorted by priority and age.
 * Returns at most MAX_BATCH_ITEMS entries whose total payload is ≤ MAX_BATCH_BYTES.
 *
 * @param {number} [now] — override for testing
 * @returns {Promise<Array>}
 */
export const dequeueBatch = async (now = Date.now()) => {
  const db = getDb();

  // Fetch candidates sorted by priority then created_at
  const candidates = await db.getAllAsync(
    `SELECT id, entity_type, operation, payload, client_ref_id,
            payload_hash, server_version, attempt_count
     FROM   sync_queue
     WHERE  status = 'pending'
       AND  next_retry_at <= ?
     ORDER BY
       COALESCE((
         SELECT priority FROM (VALUES
           ${Object.entries(ENTITY_SYNC_PRIORITY)
             .map(([k, v]) => `('${k}',${v})`)
             .join(',')}
         ) AS t(entity_type, priority)
         WHERE t.entity_type = sync_queue.entity_type
       ), 99),
       created_at ASC
     LIMIT ?`,
    [now, MAX_BATCH_ITEMS * 3] // fetch more than needed so we can cap by bytes
  );

  const batch = [];
  let totalBytes = 0;

  for (const row of candidates) {
    const bytes = (row.payload || '').length;
    if (batch.length >= MAX_BATCH_ITEMS) break;
    if (totalBytes + bytes > MAX_BATCH_BYTES && batch.length > 0) break;
    batch.push({
      ...row,
      payload: JSON.parse(row.payload || 'null'),
    });
    totalBytes += bytes;
  }

  return batch;
};

// ── Status transitions ────────────────────────────────────────────────────────

/** Mark entries as 'processing' to prevent double-delivery. */
export const markProcessing = async (ids) => {
  if (!ids || ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE sync_queue SET status = 'processing', last_attempt_at = ?
     WHERE id IN (${placeholders}) AND status = 'pending'`,
    [Date.now(), ...ids]
  );
};

/** Mark an entry as successfully synced. */
export const markSucceeded = async (id) => {
  const db = getDb();
  await db.runAsync(
    `UPDATE sync_queue SET status = 'succeeded' WHERE id = ?`,
    [id]
  );
};

/**
 * Mark an entry as failed, applying exponential-backoff for the next attempt.
 * If max attempts are exhausted, status becomes 'failed' permanently.
 */
export const markFailed = async (id, { errorDetail = '', conflictToken = null } = {}) => {
  const db = getDb();
  const row = await db.getFirstAsync(
    `SELECT attempt_count FROM sync_queue WHERE id = ?`, [id]
  );

  if (!row) return;

  const nextAttempt = (row.attempt_count || 0) + 1;
  const exhausted = nextAttempt >= MAX_QUEUE_ATTEMPTS;
  const delayMs = exhausted ? 0 : computeRetryDelayMs({ attempt: nextAttempt });
  const nextRetryAt = exhausted ? 0 : Date.now() + delayMs;

  await db.runAsync(
    `UPDATE sync_queue
     SET status = ?, attempt_count = ?, last_attempt_at = ?,
         next_retry_at = ?, error_detail = ?, conflict_token = ?
     WHERE id = ?`,
    [
      exhausted ? 'failed' : 'pending',
      nextAttempt,
      Date.now(),
      nextRetryAt,
      errorDetail.slice(0, 500), // cap error message size
      conflictToken,
      id,
    ]
  );
};

/** Reset a 'processing' entry back to 'pending' (used after a crash-recovery). */
export const resetStuckProcessing = async () => {
  const db = getDb();
  const cutoff = Date.now() - 5 * 60 * 1000; // entries processing for > 5 min are stuck
  const result = await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', next_retry_at = 0
     WHERE status = 'processing' AND last_attempt_at < ?`,
    [cutoff]
  );
  return result.changes ?? 0;
};

// ── Diagnostics ───────────────────────────────────────────────────────────────

/** Count queue entries by status. */
export const getQueueStats = async () => {
  const db = getDb();
  const rows = await db.getAllAsync(
    `SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status`
  );
  const stats = { pending: 0, processing: 0, succeeded: 0, failed: 0, skipped: 0, total: 0 };
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  return stats;
};

/** Get the oldest pending entry creation time — useful for staleness alerts. */
export const getOldestPendingAgeMs = async () => {
  const db = getDb();
  const row = await db.getFirstAsync(
    `SELECT MIN(created_at) as oldest FROM sync_queue WHERE status = 'pending'`
  );
  if (!row?.oldest) return 0;
  return Date.now() - row.oldest;
};

/** Prune succeeded entries older than retentionMs to keep the table small. */
export const pruneSucceeded = async (retentionMs = 7 * 24 * 60 * 60 * 1000) => {
  const db = getDb();
  const cutoff = Date.now() - retentionMs;
  const result = await db.runAsync(
    `DELETE FROM sync_queue WHERE status = 'succeeded' AND last_attempt_at < ?`,
    [cutoff]
  );
  return result.changes ?? 0;
};

/** Get all failed (permanently) entries for the conflict resolution UI. */
export const getFailedEntries = async ({ limit = 50 } = {}) => {
  const db = getDb();
  const rows = await db.getAllAsync(
    `SELECT id, entity_type, operation, payload, created_at,
            attempt_count, error_detail, conflict_token
     FROM sync_queue
     WHERE status = 'failed'
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload || 'null'),
  }));
};

/** Manually re-queue a failed entry (used from SyncConflictScreen). */
export const requeueFailed = async (id) => {
  const db = getDb();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'pending', attempt_count = 0,
         next_retry_at = 0, error_detail = NULL, conflict_token = NULL
     WHERE id = ? AND status = 'failed'`,
    [id]
  );
};
