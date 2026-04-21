const express = require('express');
const {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../../controllers/v1/customersController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.CUSTOMERS_VIEW), listCustomers);
router.get('/:customerId', requirePermission(ACTIONS.CUSTOMERS_VIEW), getCustomerById);
router.post('/', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(createCustomer));
router.patch('/:customerId', requirePermission(ACTIONS.SALES_CREATE), withIdempotency(updateCustomer));
router.delete('/:customerId', requirePermission(ACTIONS.SALES_CREATE), deleteCustomer);

module.exports = router;
