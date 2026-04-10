const express = require('express');
const {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../../controllers/v1/productsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.get('/', listProducts);
router.get('/:productId', getProductById);
router.post('/', withIdempotency(createProduct));
router.patch('/:productId', withIdempotency(updateProduct));
router.delete('/:productId', deleteProduct);

module.exports = router;
