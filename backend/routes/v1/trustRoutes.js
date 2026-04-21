const express = require('express');

const {
  getTrustObjectiveDefinition,
  getTrustByCustomerId,
  postTrustScore,
} = require('../../controllers/v1/trustController');

const router = express.Router();

router.get('/objective', getTrustObjectiveDefinition);
router.get('/:customerId', getTrustByCustomerId);
router.post('/', postTrustScore);

module.exports = router;
