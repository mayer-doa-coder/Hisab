const express = require('express');

const {
  getPilotSetupStructure,
  createPilotShop,
  listPilotShops,
  updatePilotShopStatus,
  trackAnalyticsEvent,
  listAnalyticsEvents,
  getMetrics,
  submitFeedbackEntry,
  listFeedbackEntries,
  getOnboardingTemplates,
  getHelpCenterArticles,
  getActivityMetricsInsightExample,
} = require('../../controllers/v1/pilotController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/setup/structure', requirePermission(ACTIONS.REPORTS_VIEW), getPilotSetupStructure);

router.post('/shops', requirePermission(ACTIONS.AUDIT_VIEW), createPilotShop);
router.get('/shops', requirePermission(ACTIONS.CUSTOMERS_VIEW), listPilotShops);
router.patch('/shops/:shopId/status', requirePermission(ACTIONS.AUDIT_VIEW), updatePilotShopStatus);

router.post('/analytics/events', requirePermission(ACTIONS.SYNC_WRITE), trackAnalyticsEvent);
router.get('/analytics/events', requirePermission(ACTIONS.REPORTS_VIEW), listAnalyticsEvents);
router.get('/metrics/overview', requirePermission(ACTIONS.REPORTS_VIEW), getMetrics);

router.post('/feedback', requirePermission(ACTIONS.CUSTOMERS_VIEW), submitFeedbackEntry);
router.get('/feedback', requirePermission(ACTIONS.REPORTS_VIEW), listFeedbackEntries);

router.get('/onboarding/templates', requirePermission(ACTIONS.CUSTOMERS_VIEW), getOnboardingTemplates);
router.get('/help-center/articles', requirePermission(ACTIONS.CUSTOMERS_VIEW), getHelpCenterArticles);

router.get('/example/activity-metrics-insight', requirePermission(ACTIONS.REPORTS_VIEW), getActivityMetricsInsightExample);

module.exports = router;
