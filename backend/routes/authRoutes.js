const express = require('express');
const {
	signup,
	login,
	requestEmailVerification,
	verifyEmailCode,
	setupPin,
	loginWithPin,
	refreshToken,
	requestPinRecovery,
	resetPin,
	updatePin,
	requestPasswordRecovery,
	resetPassword,
	updatePassword,
	logout,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');
const { validateBody } = require('../middleware/validateRequest');
const {
	signupSchema,
	loginSchema,
	verifyEmailRequestSchema,
	verifyEmailConfirmSchema,
	pinLoginSchema,
	pinSetupSchema,
	refreshSchema,
	recoveryRequestSchema,
	resetPinSchema,
	updatePinSchema,
	logoutSchema,
} = require('../validation/authSchemas');

const router = express.Router();

const authEmailLimiterKey = (req) => {
	const email = String(req.body?.email || '').trim().toLowerCase();
	const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
	const ip = forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
	return email ? `${email}:${ip}` : ip;
};

const authBurstLimiter = createRateLimiter({
	windowMs: 10 * 60 * 1000,
	maxRequests: 30,
	keyPrefix: 'auth-burst',
});

const loginLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 10,
	keyPrefix: 'auth-login',
	keyResolver: authEmailLimiterKey,
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
	keyResolver: authEmailLimiterKey,
});

const pinSetupLimiter = createRateLimiter({
	windowMs: 30 * 60 * 1000,
	maxRequests: 20,
	keyPrefix: 'auth-pin-setup',
});

router.post('/signup', authBurstLimiter, validateBody(signupSchema), signup);
router.post('/login', authBurstLimiter, loginLimiter, validateBody(loginSchema), login);
router.post('/verify-email/request', authBurstLimiter, emailVerificationRequestLimiter, validateBody(verifyEmailRequestSchema), requestEmailVerification);
router.post('/verify-email/confirm', authBurstLimiter, emailVerificationConfirmLimiter, validateBody(verifyEmailConfirmSchema), verifyEmailCode);
router.post('/pin/login', authBurstLimiter, pinLoginLimiter, validateBody(pinLoginSchema), loginWithPin);
router.post('/pin/setup', authMiddleware, authBurstLimiter, pinSetupLimiter, validateBody(pinSetupSchema), setupPin);
router.post('/refresh', authBurstLimiter, refreshLimiter, validateBody(refreshSchema), refreshToken);
router.post('/recover/request', authBurstLimiter, recoveryLimiter, validateBody(recoveryRequestSchema), requestPinRecovery);
router.post('/recover/reset', authBurstLimiter, recoveryLimiter, validateBody(resetPinSchema), resetPin);
router.post('/recover/request-pin', authBurstLimiter, recoveryLimiter, validateBody(recoveryRequestSchema), requestPinRecovery);
router.post('/recover/reset-pin', authBurstLimiter, recoveryLimiter, validateBody(resetPinSchema), resetPin);
router.post('/update-pin', authMiddleware, authBurstLimiter, validateBody(updatePinSchema), updatePin);
router.post('/update-password', authMiddleware, authBurstLimiter, validateBody(updatePinSchema), updatePassword);
router.post('/recover/request-password', authBurstLimiter, recoveryLimiter, validateBody(recoveryRequestSchema), requestPasswordRecovery);
router.post('/recover/reset-password', authBurstLimiter, recoveryLimiter, validateBody(resetPinSchema), resetPassword);
router.post('/logout', authBurstLimiter, validateBody(logoutSchema), logout);

module.exports = router;
