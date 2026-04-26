const express = require('express');
const { startSession, processPayment } = require('../controllers/ussdController');

const router = express.Router();

// Simulate USSD gateway — no auth (public endpoint simulating telco gateway)
router.post('/session', startSession);
router.post('/payment', processPayment);

module.exports = router;
