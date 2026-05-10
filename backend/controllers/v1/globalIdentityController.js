const { randomInt } = require('crypto');
const bcrypt = require('bcrypt');
const GlobalCustomerIdentity = require('../../models/GlobalCustomerIdentity');
const { findOrCreate, markPhoneVerified, setPinHash } = require('../../services/globalIdentityService');
const { asyncHandler } = require('./controllerUtils');
const { badRequest, notFound, conflict } = require('../../services/v1/httpError');
const { success } = require('../../utils/apiResponse');

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

// Stub: replace with actual SMS gateway call
const dispatchOtp = async (phoneNumber, otp) => {
  // TODO: wire to SMS provider (Vonage / BD local gateway)
  console.log(`[OTP STUB] ${phoneNumber} → ${otp}`);
};

const serializeIdentity = (doc) => ({
  global_id: doc.global_id,
  name: doc.name,
  phones: doc.phones.map((p) => ({
    number: p.number,
    isPrimary: p.isPrimary,
    verified: p.verified,
    verifiedAt: p.verifiedAt ?? null,
  })),
  verification_level: doc.verification_level,
  trust_score: doc.trust_score,
  risk_score: doc.risk_score,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// POST /api/v1/identity
// Step 1 — create identity; phone is optional
const createIdentity = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  if (phone) {
    const existing = await GlobalCustomerIdentity.findByPhone(phone);
    if (existing) {
      throw conflict(
        'A customer with this phone already exists.',
        'IDENTITY_PHONE_CONFLICT',
        { global_id: existing.global_id }
      );
    }
  }

  const { identity, created } = await findOrCreate({ name, phone: phone || null });

  return success(req, res, serializeIdentity(identity), created ? 201 : 200);
});

// POST /api/v1/identity/:globalId/phones
// Step 2 — add an extra phone (optional, max 5)
const addPhone = asyncHandler(async (req, res) => {
  const { globalId } = req.params;
  const { phone, isPrimary = false } = req.body;

  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId, status: 'ACTIVE' });
  if (!identity) throw notFound('Identity not found.');

  if (identity.phones.some((p) => p.number === phone)) {
    throw conflict('Phone already registered on this identity.', 'PHONE_ALREADY_EXISTS');
  }
  if (identity.phones.length >= 5) {
    throw badRequest('Maximum of 5 phone numbers allowed.', null, 'PHONE_LIMIT_EXCEEDED');
  }

  if (isPrimary) {
    identity.phones.forEach((p) => { p.isPrimary = false; });
  }

  identity.phones.push({ number: phone, isPrimary, verified: false });
  await identity.save();

  return success(req, res, serializeIdentity(identity));
});

// POST /api/v1/identity/:globalId/phones/otp/request
// Step 3 — send OTP to a registered phone
const requestOtp = asyncHandler(async (req, res) => {
  const { globalId } = req.params;
  const { phone } = req.body;

  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId, status: 'ACTIVE' })
    .select('+phones.otpHash +phones.otpExpiresAt +phones.otpAttempts');
  if (!identity) throw notFound('Identity not found.');

  const entry = identity.phones.find((p) => p.number === phone);
  if (!entry) throw badRequest('Phone not registered on this identity.', [{ field: 'phone', reason: 'not_found' }]);
  if (entry.verified) throw badRequest('Phone is already verified.', null, 'PHONE_ALREADY_VERIFIED');

  // enforce 5-minute cooldown: reuse existing OTP if not yet expired
  const now = Date.now();
  if (entry.otpExpiresAt && entry.otpExpiresAt.getTime() > now) {
    return success(req, res, { sent: true, expiresAt: entry.otpExpiresAt });
  }

  const otp = String(randomInt(100000, 999999));
  entry.otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  entry.otpExpiresAt = new Date(now + OTP_EXPIRY_MS);
  entry.otpAttempts = 0;

  await identity.save();
  await dispatchOtp(phone, otp);

  return success(req, res, { sent: true, expiresAt: entry.otpExpiresAt });
});

// POST /api/v1/identity/:globalId/phones/otp/verify
// Step 4 — confirm OTP → marks phone verified, advances verification_level
const verifyOtp = asyncHandler(async (req, res) => {
  const { globalId } = req.params;
  const { phone, otp } = req.body;

  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId, status: 'ACTIVE' })
    .select('+phones.otpHash +phones.otpExpiresAt +phones.otpAttempts');
  if (!identity) throw notFound('Identity not found.');

  const entry = identity.phones.find((p) => p.number === phone);
  if (!entry) throw badRequest('Phone not registered on this identity.', [{ field: 'phone', reason: 'not_found' }]);
  if (entry.verified) throw badRequest('Phone is already verified.', null, 'PHONE_ALREADY_VERIFIED');

  if (!entry.otpHash || !entry.otpExpiresAt) {
    throw badRequest('No OTP requested for this phone. Call /otp/request first.', null, 'OTP_NOT_REQUESTED');
  }
  if (entry.otpExpiresAt.getTime() < Date.now()) {
    throw badRequest('OTP has expired. Request a new one.', null, 'OTP_EXPIRED');
  }
  if (entry.otpAttempts >= MAX_OTP_ATTEMPTS) {
    throw badRequest('Too many failed attempts. Request a new OTP.', null, 'OTP_MAX_ATTEMPTS');
  }

  const matches = await bcrypt.compare(otp, entry.otpHash);
  if (!matches) {
    entry.otpAttempts += 1;
    await identity.save();
    throw badRequest('Invalid OTP.', [{ field: 'otp', reason: 'invalid' }], 'OTP_INVALID');
  }

  // clear OTP state after successful verification
  entry.otpHash = null;
  entry.otpExpiresAt = null;
  entry.otpAttempts = 0;
  await identity.save();

  const updated = await markPhoneVerified(globalId, phone);
  return success(req, res, serializeIdentity(updated));
});

// POST /api/v1/identity/:globalId/pin
// Step 5 — set PIN hash; advances L1 → L2
const setPin = asyncHandler(async (req, res) => {
  const { globalId } = req.params;
  const { pin } = req.body;

  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId, status: 'ACTIVE' });
  if (!identity) throw notFound('Identity not found.');

  if (identity.verification_level === 'L0') {
    throw badRequest(
      'Phone must be verified before setting a PIN.',
      null,
      'PHONE_VERIFICATION_REQUIRED'
    );
  }

  const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const updated = await setPinHash(globalId, hash);

  return success(req, res, serializeIdentity(updated));
});

// GET /api/v1/identity/:globalId
const getIdentity = asyncHandler(async (req, res) => {
  const identity = await GlobalCustomerIdentity.findOne({
    global_id: req.params.globalId,
    status: 'ACTIVE',
  });
  if (!identity) throw notFound('Identity not found.');
  return success(req, res, serializeIdentity(identity));
});

module.exports = {
  createIdentity,
  addPhone,
  requestOtp,
  verifyOtp,
  setPin,
  getIdentity,
};
