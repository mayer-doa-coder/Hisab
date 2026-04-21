const express = require('express');

const {
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
} = require('../../controllers/v1/reliabilityController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/sync/conflicts', requirePermission(ACTIONS.SYNC_READ), listSyncConflicts);
router.post('/sync/conflicts', requirePermission(ACTIONS.SYNC_WRITE), createSyncConflict);
router.post('/sync/conflicts/:conflictId/resolve', requirePermission(ACTIONS.SYNC_WRITE), resolveSyncConflict);

router.get('/sync/retry-policy', requirePermission(ACTIONS.SYNC_READ), getRetryPolicy);
router.post('/sync/retry/evaluate', requirePermission(ACTIONS.SYNC_WRITE), evaluateRetry);

router.post('/offline-queue/snapshot', requirePermission(ACTIONS.SYNC_WRITE), ingestOfflineQueueSnapshot);
router.get('/offline-queue/summary', requirePermission(ACTIONS.SYNC_READ), getOfflineQueueSummary);

router.post('/backup/upload', requirePermission(ACTIONS.SYNC_WRITE), uploadBackup);
router.get('/backup/list', requirePermission(ACTIONS.SYNC_READ), listBackups);
router.get('/backup/:backupId/download', requirePermission(ACTIONS.SYNC_READ), downloadBackup);
router.delete('/backup/:backupId', requirePermission(ACTIONS.SYNC_WRITE), deleteBackup);

router.get('/retention-policy', requirePermission(ACTIONS.AUDIT_VIEW), getRetentionPolicy);
router.post('/retention-policy/apply', requirePermission(ACTIONS.AUDIT_VIEW), applyRetentionPolicy);

router.post('/monitoring/performance', requirePermission(ACTIONS.SYNC_WRITE), ingestPerformanceSample);
router.get('/monitoring/performance', requirePermission(ACTIONS.AUDIT_VIEW), getPerformanceSummary);
router.post('/monitoring/crash', requirePermission(ACTIONS.SYNC_WRITE), ingestCrashEvent);
router.get('/monitoring/crash', requirePermission(ACTIONS.AUDIT_VIEW), getCrashEvents);

router.get('/chaos/scenarios', requirePermission(ACTIONS.AUDIT_VIEW), listChaosScenarios);
router.post('/chaos/scenarios/:scenarioId/run', requirePermission(ACTIONS.AUDIT_VIEW), runChaosScenario);

module.exports = router;
