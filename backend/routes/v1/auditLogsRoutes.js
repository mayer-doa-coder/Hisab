const express = require('express');
const {
  listAuditLogs,
  getAuditLogById,
} = require('../../controllers/v1/auditLogsController');

const router = express.Router();

router.get('/', listAuditLogs);
router.get('/:auditId', getAuditLogById);

module.exports = router;
