const express = require('express');
const {
  listAuditLogs,
  getAuditLogById,
} = require('../../controllers/v1/auditLogsController');
const { requireRoles } = require('../../middleware/rbacMiddleware');

const router = express.Router();

router.get('/', requireRoles('owner', 'admin', 'auditor'), listAuditLogs);
router.get('/:auditId', requireRoles('owner', 'admin', 'auditor'), getAuditLogById);

module.exports = router;
