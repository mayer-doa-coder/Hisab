const express = require('express');
const {
  createIdentity,
  addPhone,
  requestOtp,
  verifyOtp,
  setPin,
  getIdentity,
} = require('../../controllers/v1/globalIdentityController');
const { validateBody } = require('../../middleware/validateRequest');
const { createRateLimiter } = require('../../middleware/rateLimitMiddleware');
const {
  createIdentitySchema,
  addPhoneSchema,
  requestOtpSchema,
  verifyOtpSchema,
  setPinSchema,
} = require('../../validation/globalIdentitySchemas');

const router = express.Router();

const otpRequestLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 3,
  keyPrefix: 'identity-otp-request',
});

const otpVerifyLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'identity-otp-verify',
});

router.post('/', validateBody(createIdentitySchema), createIdentity);
router.get('/:globalId', getIdentity);
router.post('/:globalId/phones', validateBody(addPhoneSchema), addPhone);
router.post('/:globalId/phones/otp/request', otpRequestLimiter, validateBody(requestOtpSchema), requestOtp);
router.post('/:globalId/phones/otp/verify', otpVerifyLimiter, validateBody(verifyOtpSchema), verifyOtp);
router.post('/:globalId/pin', validateBody(setPinSchema), setPin);

module.exports = router;
