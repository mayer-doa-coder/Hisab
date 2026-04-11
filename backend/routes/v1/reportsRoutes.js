const express = require('express');
const {
  getDashboardReport,
  getSalesSummary,
  getBakiAging,
  getInventoryHealth,
} = require('../../controllers/v1/reportsController');
const {
  postTrustMonitoringSnapshot,
  getTrustMonitoringSnapshot,
} = require('../../controllers/v1/trustMonitoringController');
const { validateBody } = require('../../middleware/validateRequest');
const { requireRoles } = require('../../middleware/rbacMiddleware');
const { trustMonitoringSnapshotSchema } = require('../../validation/reportsSchemas');

const router = express.Router();

const GENERAL_REPORT_ROLES = ['user', 'manager', 'admin', 'owner', 'auditor'];
const PRIVILEGED_FINANCE_ROLES = ['manager', 'admin', 'owner', 'auditor'];

router.get('/dashboard', requireRoles(...GENERAL_REPORT_ROLES), getDashboardReport);
router.get('/sales-summary', requireRoles(...PRIVILEGED_FINANCE_ROLES), getSalesSummary);
router.get('/baki-aging', requireRoles(...GENERAL_REPORT_ROLES), getBakiAging);
router.get('/inventory-health', requireRoles(...PRIVILEGED_FINANCE_ROLES), getInventoryHealth);
router.post('/trust-monitoring-snapshot', validateBody(trustMonitoringSnapshotSchema), postTrustMonitoringSnapshot);
router.get('/trust-monitoring-snapshot', requireRoles(...GENERAL_REPORT_ROLES), getTrustMonitoringSnapshot);

module.exports = router;
