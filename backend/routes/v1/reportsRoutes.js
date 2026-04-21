const express = require('express');
const {
  getDashboardReport,
  getSalesSummary,
  getBakiAging,
  getInventoryHealth,
} = require('../../controllers/v1/reportsController');
const {
  getComplianceDashboard,
  getSalesReport,
  getInventoryReport,
  getFinanceReport,
  getCollectionsReport,
  getTaxSummary,
  getReconciliationOverview,
  exportReport,
  captureAuditSnapshot,
  listAuditSnapshots,
} = require('../../controllers/v1/complianceReportsController');
const {
  postTrustMonitoringSnapshot,
  getTrustMonitoringSnapshot,
} = require('../../controllers/v1/trustMonitoringController');
const { validateBody } = require('../../middleware/validateRequest');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');
const { trustMonitoringSnapshotSchema } = require('../../validation/reportsSchemas');

const router = express.Router();

router.get('/dashboard', requirePermission(ACTIONS.REPORTS_VIEW), getDashboardReport);
router.get('/dashboard/compliance', requirePermission(ACTIONS.REPORTS_VIEW), getComplianceDashboard);
router.get('/sales-summary', requirePermission(ACTIONS.REPORTS_VIEW), getSalesSummary);
router.get('/baki-aging', requirePermission(ACTIONS.REPORTS_VIEW), getBakiAging);
router.get('/inventory-health', requirePermission(ACTIONS.REPORTS_VIEW), getInventoryHealth);
router.get('/sales-report', requirePermission(ACTIONS.REPORTS_VIEW), getSalesReport);
router.get('/inventory-report', requirePermission(ACTIONS.REPORTS_VIEW), getInventoryReport);
router.get('/finance-report', requirePermission(ACTIONS.REPORTS_VIEW), getFinanceReport);
router.get('/collections-report', requirePermission(ACTIONS.REPORTS_VIEW), getCollectionsReport);
router.get('/tax-summary', requirePermission(ACTIONS.REPORTS_VIEW), getTaxSummary);
router.get('/reconciliation', requirePermission(ACTIONS.REPORTS_VIEW), getReconciliationOverview);
router.get('/export/:reportType', requirePermission(ACTIONS.REPORTS_VIEW), exportReport);
router.post('/audit-snapshots/capture', requirePermission(ACTIONS.REPORTS_VIEW), captureAuditSnapshot);
router.get('/audit-snapshots', requirePermission(ACTIONS.REPORTS_VIEW), listAuditSnapshots);
router.post('/trust-monitoring-snapshot', validateBody(trustMonitoringSnapshotSchema), postTrustMonitoringSnapshot);
router.get('/trust-monitoring-snapshot', requirePermission(ACTIONS.REPORTS_VIEW), getTrustMonitoringSnapshot);

module.exports = router;
