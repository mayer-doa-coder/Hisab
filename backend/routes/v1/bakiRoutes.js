const express = require('express');
const {
  addCredit,
  addPayment,
  getCustomerLedger,
  getBakiSummary,
} = require('../../controllers/v1/bakiController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.post('/credits', withIdempotency(addCredit));
router.post('/payments', withIdempotency(addPayment));
router.get('/customers/:customerId/ledger', getCustomerLedger);
router.get('/summary', getBakiSummary);

module.exports = router;
