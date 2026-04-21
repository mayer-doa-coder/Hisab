const express = require('express');
const {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../../controllers/v1/productsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.PRODUCTS_VIEW), listProducts);
router.get('/:productId', requirePermission(ACTIONS.PRODUCTS_VIEW), getProductById);
router.post('/', requirePermission(ACTIONS.STOCK_MANAGE), withIdempotency(createProduct));
router.patch('/:productId', requirePermission(ACTIONS.STOCK_MANAGE), withIdempotency(updateProduct));
router.delete('/:productId', requirePermission(ACTIONS.STOCK_MANAGE), deleteProduct);

module.exports = router;
