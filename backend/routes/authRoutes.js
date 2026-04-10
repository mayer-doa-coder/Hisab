const express = require('express');
const {
	signup,
	login,
	requestEmailVerification,
	verifyEmailCode,
	setupPin,
	loginWithPin,
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

const emailVerificationRequestLimiter = createRateLimiter({
	windowMs: 30 * 60 * 1000,
	maxRequests: 6,
	keyPrefix: 'auth-email-verification-request',
});

const emailVerificationConfirmLimiter = createRateLimiter({
	windowMs: 30 * 60 * 1000,
	maxRequests: 20,
	keyPrefix: 'auth-email-verification-confirm',
});

const pinLoginLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 20,
	keyPrefix: 'auth-pin-login',
});

const pinSetupLimiter = createRateLimiter({
	windowMs: 30 * 60 * 1000,
	maxRequests: 20,
	keyPrefix: 'auth-pin-setup',
});

router.post('/signup', authBurstLimiter, signup);
router.post('/login', authBurstLimiter, loginLimiter, login);
router.post('/verify-email/request', authBurstLimiter, emailVerificationRequestLimiter, requestEmailVerification);
router.post('/verify-email/confirm', authBurstLimiter, emailVerificationConfirmLimiter, verifyEmailCode);
router.post('/pin/login', authBurstLimiter, pinLoginLimiter, loginWithPin);
router.post('/pin/setup', authMiddleware, authBurstLimiter, pinSetupLimiter, setupPin);
router.post('/refresh', authBurstLimiter, refreshLimiter, refreshToken);
router.post('/recover/request', authBurstLimiter, recoveryLimiter, requestPasswordRecovery);
router.post('/recover/reset', authBurstLimiter, recoveryLimiter, resetPassword);
router.post('/update-password', authMiddleware, authBurstLimiter, updatePassword);
router.post('/logout', authBurstLimiter, logout);

module.exports = router;
