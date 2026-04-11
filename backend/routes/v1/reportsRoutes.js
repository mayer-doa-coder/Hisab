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

const router = express.Router();

router.get('/dashboard', getDashboardReport);
router.get('/sales-summary', getSalesSummary);
router.get('/baki-aging', getBakiAging);
router.get('/inventory-health', getInventoryHealth);
router.post('/trust-monitoring-snapshot', postTrustMonitoringSnapshot);
router.get('/trust-monitoring-snapshot', getTrustMonitoringSnapshot);

module.exports = router;
