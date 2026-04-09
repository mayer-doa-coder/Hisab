const express = require('express');
const {
  createTransaction,
  listTransactions,
  voidTransaction,
} = require('../../controllers/v1/transactionsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.post('/', withIdempotency(createTransaction));
router.get('/', listTransactions);
router.post('/:transactionId/void', withIdempotency(voidTransaction));

module.exports = router;
