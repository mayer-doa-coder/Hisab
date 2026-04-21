const express = require('express');
const {
  addCredit,
  addPayment,
  getCustomerLedger,
  getBakiSummary,
  getCollectionsDashboard,
  createReminder,
  listReminders,
  createPaymentPromise,
  listPaymentPromises,
  updatePaymentPromiseStatus,
  getCustomerStatement,
  exportCustomerStatementCsv,
} = require('../../controllers/v1/bakiController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.post('/credits', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(addCredit));
router.post('/payments', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(addPayment));
router.get('/customers/:customerId/ledger', requirePermission(ACTIONS.CUSTOMERS_VIEW), getCustomerLedger);
router.get('/customers/:customerId/statement', requirePermission(ACTIONS.REPORTS_VIEW), getCustomerStatement);
router.get('/customers/:customerId/statement/export', requirePermission(ACTIONS.REPORTS_VIEW), exportCustomerStatementCsv);
router.post('/customers/:customerId/reminders', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(createReminder));
router.get('/customers/:customerId/reminders', requirePermission(ACTIONS.CUSTOMERS_VIEW), listReminders);
router.post('/customers/:customerId/promises', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(createPaymentPromise));
router.get('/customers/:customerId/promises', requirePermission(ACTIONS.CUSTOMERS_VIEW), listPaymentPromises);
router.patch('/promises/:promiseId/status', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(updatePaymentPromiseStatus));
router.get('/summary', requirePermission(ACTIONS.REPORTS_VIEW), getBakiSummary);
router.get('/collections/dashboard', requirePermission(ACTIONS.REPORTS_VIEW), getCollectionsDashboard);

module.exports = router;
