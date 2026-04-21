const express = require('express');
const {
  listAuditLogs,
  getAuditLogById,
} = require('../../controllers/v1/auditLogsController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.AUDIT_VIEW), listAuditLogs);
router.get('/:auditId', requirePermission(ACTIONS.AUDIT_VIEW), getAuditLogById);

module.exports = router;
