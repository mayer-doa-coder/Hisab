const express = require('express');
const {
  createMovement,
  listMovements,
} = require('../../controllers/v1/movementsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.post('/', requirePermission(ACTIONS.STOCK_MANAGE), withIdempotency(createMovement));
router.get('/', requirePermission(ACTIONS.PRODUCTS_VIEW), listMovements);

module.exports = router;
