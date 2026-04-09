const express = require('express');
const {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../../controllers/v1/customersController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.get('/', listCustomers);
router.get('/:customerId', getCustomerById);
router.post('/', withIdempotency(createCustomer));
router.patch('/:customerId', withIdempotency(updateCustomer));
router.delete('/:customerId', deleteCustomer);

module.exports = router;
