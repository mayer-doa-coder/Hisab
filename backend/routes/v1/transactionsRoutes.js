const express = require('express');
const {
  createTransaction,
  listTransactions,
  voidTransaction,
} = require('../../controllers/v1/transactionsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.post('/', requirePermission(ACTIONS.TRANSACTIONS_CREATE), withIdempotency(createTransaction));
router.get('/', requirePermission(ACTIONS.TRANSACTIONS_VIEW), listTransactions);
router.post('/:transactionId/void', requirePermission(ACTIONS.VOID_SALE_REQUEST), withIdempotency(voidTransaction));

module.exports = router;
