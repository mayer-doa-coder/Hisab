const express = require('express');
const { handlePaymentWebhook } = require('../controllers/webhookController');

const router = express.Router();

// Payment webhook — authenticated via X-Webhook-Secret header, not user JWT
router.post('/', handlePaymentWebhook);

module.exports = router;
