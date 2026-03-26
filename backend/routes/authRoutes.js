const express = require('express');
const {
	signup,
	login,
	refreshToken,
	requestPasswordRecovery,
	resetPassword,
	updatePassword,
	logout,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

const authBurstLimiter = createRateLimiter({
	windowMs: 10 * 60 * 1000,
	maxRequests: 30,
	keyPrefix: 'auth-burst',
});

const loginLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 10,
	keyPrefix: 'auth-login',
});

const refreshLimiter = createRateLimiter({
	windowMs: 10 * 60 * 1000,
	maxRequests: 40,
	keyPrefix: 'auth-refresh',
});

const recoveryLimiter = createRateLimiter({
	windowMs: 30 * 60 * 1000,
	maxRequests: 5,
	keyPrefix: 'auth-recovery',
});

router.post('/signup', authBurstLimiter, signup);
router.post('/login', authBurstLimiter, loginLimiter, login);
router.post('/refresh', authBurstLimiter, refreshLimiter, refreshToken);
router.post('/recover/request', authBurstLimiter, recoveryLimiter, requestPasswordRecovery);
router.post('/recover/reset', authBurstLimiter, recoveryLimiter, resetPassword);
router.post('/update-password', authMiddleware, authBurstLimiter, updatePassword);
router.post('/logout', authBurstLimiter, logout);

module.exports = router;
