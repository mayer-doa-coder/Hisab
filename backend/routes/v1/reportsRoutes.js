const express = require('express');
const {
  getDashboardReport,
  getSalesSummary,
  getBakiAging,
  getInventoryHealth,
} = require('../../controllers/v1/reportsController');

const router = express.Router();

router.get('/dashboard', getDashboardReport);
router.get('/sales-summary', getSalesSummary);
router.get('/baki-aging', getBakiAging);
router.get('/inventory-health', getInventoryHealth);

module.exports = router;
