const express = require('express');

const {
  getTrustByCustomerId,
  postTrustScore,
} = require('../../controllers/v1/trustController');

const router = express.Router();

router.get('/:customerId', getTrustByCustomerId);
router.post('/', postTrustScore);

module.exports = router;
