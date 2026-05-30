/**
 * backgroundSync.js — Autonomous background sync task.
 *
 * React Native equivalent of the browser Background Sync API + Service Worker.
 *
 * The task is registered with expo-task-manager and scheduled via
 * expo-background-fetch. On iOS it runs approximately every 15 minutes
 * (the minimum the OS permits); on Android it runs more frequently.
 *
 * Guarantees:
 *  - The store owner never needs to open the app to push queued mutations.
 *    If they log a sale at 7 PM and close the app, it will be synced during
 *    the night without them doing anything.
 *  - The task is idempotent and safe to interrupt mid-run (each mutation
 *    is either fully committed on the server or rolled back to 'pending').
 *  - The task is a no-op when offline (checked via networkMonitor).
 *
 * Registration:
 *   Call registerBackgroundSync() once during app startup (in App.js).
 *   The task definition (TaskManager.defineTask) must be called at module
 *   import time — it cannot be inside a function or conditional.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { isSyncAllowed, recordFailure, recordSuccess } from './networkMonitor';
import {
  dequeueBatch,
  getQueueStats,
  markFailed,
  markProcessing,
  markSucceeded,
  pruneSucceeded,
  resetStuckProcessing,
} from './syncQueue';

export const BACKGROUND_SYNC_TASK = 'HISAB_BACKGROUND_SYNC';

// ── Task definition (must be at module scope) ─────────────────────────────────

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.info('[backgroundSync] Task started');
    const synced = await runSyncCycle();
    console.info('[backgroundSync] Task completed —', synced, 'items synced');
    return synced > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error('[backgroundSync] Task failed:', err?.message);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Task registration ─────────────────────────────────────────────────────────

/**
 * Register the background sync task with the OS.
 * Call once from App.js after fonts are loaded.
 *
 * @returns {Promise<void>}
 */
export const registerBackgroundSync = async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted
     || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.warn('[backgroundSync] Background fetch is restricted or denied by OS settings');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 15 * 60, // 15 minutes — iOS minimum
        stopOnTerminate: false,   // Keep running after app is terminated
        startOnBoot: true,        // Resume after device reboot
      });
      console.info('[backgroundSync] Background sync task registered');
    }
  } catch (err) {
    // Non-fatal — foreground sync will still work
    console.warn('[backgroundSync] Could not register background task:', err?.message);
  }
};

/**
 * Unregister the background task (call from logout / data wipe flows).
 */
export const unregisterBackgroundSync = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch {}
};

// ── Core sync cycle ───────────────────────────────────────────────────────────

/**
 * Process the sync queue: dequeue a batch → send to server → mark results.
 * This is also called directly from the foreground sync interval in
 * MainDataShell.js so the same logic runs in both contexts.
 *
 * @param {object} opts
 * @param {string} opts.accessToken  — JWT for the server
 * @param {string} opts.apiBaseUrl   — resolved backend URL
 * @returns {Promise<{ synced: number, failed: number, skipped: boolean }>}
 */
export const runSyncCycle = async ({ accessToken, apiBaseUrl } = {}) => {
  // Guard: skip if network is unavailable or circuit is open
  if (!isSyncAllowed()) {
    return { synced: 0, failed: 0, skipped: true, reason: 'network_unavailable' };
  }

  // Guard: skip if no auth token (called from background task before login)
  if (!accessToken || !apiBaseUrl) {
    return { synced: 0, failed: 0, skipped: true, reason: 'no_auth' };
  }

  // Reset any stuck-processing entries from a previous crash
  await resetStuckProcessing();

  // Prune old succeeded entries to keep the table lean
  await pruneSucceeded();

  const batch = await dequeueBatch();
  if (batch.length === 0) {
    return { synced: 0, failed: 0, skipped: false };
  }

  // Mark as processing (prevents double-delivery)
  await markProcessing(batch.map((e) => e.id));

  let synced = 0;
  let failed = 0;

  for (const entry of batch) {
    try {
      const result = await pushMutation(entry, { accessToken, apiBaseUrl });

      if (result.ok) {
        await markSucceeded(entry.id);
        recordSuccess();
        synced++;
      } else if (result.conflict) {
        await markFailed(entry.id, {
          errorDetail: result.message,
          conflictToken: result.conflictToken,
        });
        failed++;
      } else if (result.nonRetryable) {
        // Business rule rejection — skip permanently
        await markFailed(entry.id, { errorDetail: result.message });
        failed++;
      } else {
        // Transient failure — will retry with backoff
        recordFailure();
        await markFailed(entry.id, { errorDetail: result.message });
        failed++;
      }
    } catch (err) {
      recordFailure();
      await markFailed(entry.id, { errorDetail: err?.message || 'Unknown error' });
      failed++;
    }
  }

  return { synced, failed, skipped: false };
};

// ── HTTP push ─────────────────────────────────────────────────────────────────

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 409, 422]);
const CONFLICT_TOKENS = new Set(['conflict', 'version_mismatch', 'requires_client_resolution']);

const toToken = (s) => String(s || '').trim().toLowerCase();

/**
 * Send a single queue entry to the backend sync endpoint.
 * Returns a structured result object — never throws.
 */
const pushMutation = async (entry, { accessToken, apiBaseUrl }) => {
  const url = `${apiBaseUrl}/api/v1/sync`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': entry.payload_hash,
        'X-Client-Ref-Id': entry.client_ref_id || '',
        'X-Entity-Type': entry.entity_type,
        'X-Operation': entry.operation,
      },
      body: JSON.stringify({
        entityType: entry.entity_type,
        operation: entry.operation,
        payload: entry.payload,
        clientRefId: entry.client_ref_id,
        serverVersion: entry.server_version,
        payloadHash: entry.payload_hash,
      }),
      signal: AbortSignal.timeout(20_000), // 20s per mutation
    });
  } catch (networkErr) {
    return { ok: false, nonRetryable: false, conflict: false, message: networkErr?.message };
  }

  if (res.ok) return { ok: true };

  let body = {};
  try { body = await res.json(); } catch {}

  const statusToken = toToken(body?.status || body?.code || '');
  const conflict = CONFLICT_TOKENS.has(statusToken);
  const nonRetryable = !conflict && NON_RETRYABLE_STATUSES.has(res.status);

  return {
    ok: false,
    conflict,
    nonRetryable,
    conflictToken: conflict ? statusToken : null,
    message: body?.message || `HTTP ${res.status}`,
  };
};

// ── Status queries ────────────────────────────────────────────────────────────

/** Returns queue statistics for the OfflineQueueMonitor screen. */
export const getSyncStatus = async () => {
  const stats = await getQueueStats();
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK).catch(() => false);
  return {
    ...stats,
    backgroundTaskRegistered: isRegistered,
  };
};
