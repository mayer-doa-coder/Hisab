const express = require('express');
const {
  createMovement,
  listMovements,
} = require('../../controllers/v1/movementsController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.post('/', withIdempotency(createMovement));
router.get('/', listMovements);

module.exports = router;
