const express = require('express');
const {
  pushSync,
  pullSync,
  ackConflicts,
} = require('../../controllers/v1/syncController');
const { syncUnified } = require('../../controllers/v1/unifiedSyncController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.post('/', requirePermission(ACTIONS.SYNC_WRITE), syncUnified);
router.post('/push', requirePermission(ACTIONS.SYNC_WRITE), pushSync);
router.post('/pull', requirePermission(ACTIONS.SYNC_READ), pullSync);
router.post('/ack-conflicts', requirePermission(ACTIONS.SYNC_WRITE), ackConflicts);

module.exports = router;
