const express = require('express');
const {
  pushSync,
  pullSync,
  ackConflicts,
} = require('../../controllers/v1/syncController');

const router = express.Router();

router.post('/push', pushSync);
router.post('/pull', pullSync);
router.post('/ack-conflicts', ackConflicts);

module.exports = router;
