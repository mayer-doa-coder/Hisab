const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const SecurityEvent = require('../models/SecurityEvent');
const { error: sendError } = require('../utils/apiResponse');
const {
  isEmailTransportConfigured,
  isEmailDeliveryRequired,
  sendVerificationCodeEmail,
  sendPinRecoveryEmail,
} = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_PIN_ATTEMPTS = 5;
const PIN_LOCK_DURATION_MS = Number(process.env.PIN_LOCK_DURATION_MS) || 60 * 60 * 1000;
const EMAIL_VERIFICATION_WINDOW_MS = Number(process.env.EMAIL_VERIFICATION_WINDOW_MS) || 10 * 60 * 1000;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) || 60 * 1000;
const EMAIL_VERIFICATION_CODE_LENGTH = 6;
const PIN_RESET_WINDOW_MS = 30 * 60 * 1000;
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const REFRESH_TOKEN_REMEMBER_EXPIRES_IN = process.env.JWT_REFRESH_REMEMBER_EXPIRES_IN || '30d';
const PIN_REGEX = /^\d{4,6}$/;

const formatRetryDuration = (totalSeconds) => {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  if (seconds <= 0) {
    return 'less than 1 minute';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePin = (value) => String(value || '').trim();
const normalizeDeviceId = (value) => String(value || '').trim();
const isProduction = process.env.NODE_ENV === 'production';

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return fallback;
};

const getRequestMeta = (req) => {
  const forwardedFor = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = forwardedFor || req.ip || req.socket?.remoteAddress || null;

  return {
    requestId: req.requestId || null,
    ipAddress,
    userAgent: String(req.headers?.['user-agent'] || '').trim() || null,
  };
};

const sendAuthError = (req, res, {
  statusCode = 500,
  code = 'AUTH_INTERNAL_ERROR',
  message = 'Authentication request failed.',
  details = null,
} = {}) => {
  return sendError(req, res, {
    statusCode,
    code,
    message,
    details,
  });
};

const logSecurityEvent = async (req, {
  eventType,
  severity = 'warning',
  userId = null,
  metadata = null,
} = {}) => {
  if (!eventType) {
    return;
  }

  const requestMeta = getRequestMeta(req);

  try {
    await SecurityEvent.create({
      user: userId || null,
      eventType: String(eventType),
      severity,
      requestId: requestMeta.requestId,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      metadata,
    });
  } catch {
    // Security logging must never block auth actions.
  }
};

const getAccessSecret = () => process.env.JWT_SECRET;

const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;

const buildAccessToken = (userId, { authMethod = 'pin' } = {}) => {
  const secret = getAccessSecret();

  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign({ user_id: String(userId), token_type: 'access', amr: authMethod, jti: crypto.randomUUID() }, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
};

const buildRefreshToken = (userId, { rememberMe = false } = {}) => {
  const secret = getRefreshSecret();

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET (or JWT_SECRET) is not configured.');
  }

  return jwt.sign({ user_id: String(userId), token_type: 'refresh', remember_me: Boolean(rememberMe), jti: crypto.randomUUID() }, secret, {
    expiresIn: rememberMe ? REFRESH_TOKEN_REMEMBER_EXPIRES_IN : REFRESH_TOKEN_EXPIRES_IN,
  });
};

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const decodeTokenUnsafe = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

const clearUserRefreshState = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: null,
    refreshTokenExpiresAt: null,
  });
};

const toIsoFromJwtExp = (token) => {
  const decoded = decodeTokenUnsafe(token);
  const exp = Number(decoded?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return null;
  }

  return new Date(exp * 1000).toISOString();
};

const createOtpCode = (length = EMAIL_VERIFICATION_CODE_LENGTH) => {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
};

const createVerificationDetails = ({ email, expiresAt = null, cooldownSeconds = null, delivery = null } = {}) => ({
  verificationRequired: true,
  email,
  verificationCodeExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  resendAvailableInSeconds: Number.isFinite(Number(cooldownSeconds)) ? Number(cooldownSeconds) : 0,
  ...(delivery ? {
    emailDelivery: {
      delivered: Boolean(delivery?.delivered),
      reason: delivery?.reason || null,
      ...(delivery?.messageId ? { messageId: delivery.messageId } : {}),
      ...(!isProduction && delivery?.errorMessage ? { errorMessage: delivery.errorMessage } : {}),
      transportConfigured: isEmailTransportConfigured(),
    },
  } : {}),
});

const issueEmailVerificationCode = async ({ req, user, reason = 'EMAIL_VERIFICATION', enforceCooldown = true } = {}) => {
  const now = Date.now();
  const lastSentAt = user?.emailVerificationLastSentAt ? new Date(user.emailVerificationLastSentAt).getTime() : 0;

  if (enforceCooldown && lastSentAt > 0 && now - lastSentAt < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.max(1, Math.ceil((EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000));
    return {
      ok: false,
      reason: 'COOLDOWN',
      remainingSeconds,
      expiresAt: user?.emailVerificationExpiresAt || null,
    };
  }

  const code = createOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(now + EMAIL_VERIFICATION_WINDOW_MS);

  user.emailVerificationCodeHash = codeHash;
  user.emailVerificationExpiresAt = expiresAt;
  user.emailVerificationLastSentAt = new Date(now);
  await user.save();

  const delivery = await sendVerificationCodeEmail({
    to: user.email,
    code,
    expiresAt,
  });

  if (!delivery.delivered) {
    await logSecurityEvent(req, {
      eventType: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
      severity: isEmailDeliveryRequired() ? 'critical' : 'warning',
      userId: user._id,
      metadata: {
        reason,
        deliveryReason: delivery?.reason || 'UNKNOWN',
        ...(delivery?.errorMessage && !isProduction ? { deliveryErrorMessage: delivery.errorMessage } : {}),
      },
    });

    if (isEmailDeliveryRequired()) {
      return {
        ok: false,
        reason: 'DELIVERY_FAILED',
        code,
        expiresAt,
        delivery,
      };
    }
  }

  await logSecurityEvent(req, {
    eventType: 'EMAIL_VERIFICATION_CODE_ISSUED',
    severity: 'info',
    userId: user._id,
    metadata: {
      reason,
      expiresAt: expiresAt.toISOString(),
      emailDelivered: Boolean(delivery.delivered),
      emailDeliveryReason: delivery?.reason || null,
    },
  });

  return {
    ok: true,
    code,
    expiresAt,
    delivery,
  };
};

const buildAuthResponse = (userDoc, accessToken, refreshToken) => ({
  accessToken,
  refreshToken,
  accessTokenExpiresAt: toIsoFromJwtExp(accessToken),
  refreshTokenExpiresAt: toIsoFromJwtExp(refreshToken),
  user: toPublicUser(userDoc),
});

const persistRefreshToken = async ({ userId, refreshToken, previousTokenHash = null }) => {
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiresAt = toIsoFromJwtExp(refreshToken);

  await RefreshToken.create({
    user: userId,
    tokenHash: refreshTokenHash,
    expiresAt: refreshTokenExpiresAt ? new Date(refreshTokenExpiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    replacedByTokenHash: null,
  });

  if (previousTokenHash) {
    await RefreshToken.findOneAndUpdate(
      { tokenHash: previousTokenHash, revokedAt: null },
      {
        revokedAt: new Date(),
        replacedByTokenHash: refreshTokenHash,
      }
    );
  }

  await User.findByIdAndUpdate(userId, {
    refreshTokenHash,
    refreshTokenExpiresAt: refreshTokenExpiresAt ? new Date(refreshTokenExpiresAt) : null,
    failedLoginAttempts: 0,
    lockUntil: null,
  });
};

const revokeAllUserRefreshTokens = async (userId) => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
};

const toPublicUser = (userDoc) => ({
  id: String(userDoc._id),
  email: userDoc.email,
  emailVerified: Boolean(userDoc.emailVerifiedAt),
  pinEnabled: Boolean(userDoc.pinSetAt),
  createdAt: userDoc.createdAt,
});

const validateCredentials = ({ email, pin, password, requirePin = false }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPin = normalizePin(pin || password);

  if (!normalizedEmail || !normalizedPin) {
    return { ok: false, message: 'Email and PIN are required.' };
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { ok: false, code: 'INVALID_EMAIL', message: 'Please provide a valid email address.' };
  }

  if (requirePin) {
    const pinPolicy = validatePinPolicy(normalizedPin);
    if (!pinPolicy.ok) {
      return { ok: false, code: pinPolicy.code, message: pinPolicy.message };
    }
  }

  return {
    ok: true,
    email: normalizedEmail,
    pin: normalizedPin,
  };
};

const validatePinPolicy = (pin) => {
  const normalizedPin = normalizePin(pin);

  if (!PIN_REGEX.test(normalizedPin)) {
    return {
      ok: false,
      code: 'INVALID_PIN_FORMAT',
      message: 'PIN must be 4 to 6 digits.',
    };
  }

  return {
    ok: true,
    pin: normalizedPin,
  };
};

const signup = async (req, res) => {
  try {
    const validation = validateCredentials({ ...(req.body || {}), requirePin: true });
    if (!validation.ok) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: validation.code || 'AUTH_VALIDATION_ERROR',
        message: validation.message,
      });
    }

    const existing = await User.findOne({ email: validation.email }).select(
      '+emailVerifiedAt +emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationLastSentAt +pinHash +pinSetAt'
    );
    const pinHash = await bcrypt.hash(validation.pin, 12);

    let user = existing;
    if (user?.emailVerifiedAt) {
      return sendAuthError(req, res, {
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already exists.',
      });
    }

    if (user) {
      user.password = pinHash;
      user.pinHash = pinHash;
      user.passwordChangedAt = new Date();
      user.pinChangedAt = new Date();
      user.pinSetAt = new Date();
      user.failedPinAttempts = 0;
      user.pinLockUntil = null;
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    } else {
      user = await User.create({
        email: validation.email,
        password: pinHash,
        pinHash,
        pinSetAt: new Date(),
        emailVerifiedAt: null,
        failedPinAttempts: 0,
        pinLockUntil: null,
        failedLoginAttempts: 0,
        lockUntil: null,
        passwordChangedAt: new Date(),
        pinChangedAt: new Date(),
      });
    }

    const verification = await issueEmailVerificationCode({
      req,
      user,
      reason: 'SIGNUP',
      enforceCooldown: true,
    });

    if (!verification.ok) {
      if (verification.reason === 'DELIVERY_FAILED') {
        return sendAuthError(req, res, {
          statusCode: 503,
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Could not send verification email. Please try again shortly.',
          details: createVerificationDetails({
            email: user.email,
            code: verification.code,
            expiresAt: verification.expiresAt,
            delivery: verification.delivery,
          }),
        });
      }

      return sendAuthError(req, res, {
        statusCode: 429,
        code: 'OTP_REQUEST_RATE_LIMITED',
        message: 'Please wait before requesting another verification code.',
        details: createVerificationDetails({
          email: user.email,
          expiresAt: verification.expiresAt,
          cooldownSeconds: verification.remainingSeconds,
        }),
      });
    }

    await logSecurityEvent(req, {
      eventType: 'AUTH_SIGNUP_PENDING_VERIFICATION',
      severity: 'info',
      userId: user._id,
    });

    return res.status(202).json({
      message: 'Signup successful. Verify your email code to continue.',
      ...createVerificationDetails({
        email: user.email,
        code: verification.code,
        expiresAt: verification.expiresAt,
        delivery: verification.delivery,
      }),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendAuthError(req, res, {
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already exists.',
      });
    }

    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'SIGNUP_FAILED',
      message: 'Failed to signup user.',
    });
  }
};

const requestEmailVerification = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(200).json({
        message: 'If the account exists, a verification code has been sent.',
      });
    }

    const user = await User.findOne({ email }).select(
      '+emailVerifiedAt +emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationLastSentAt'
    );

    if (!user) {
      return res.status(200).json({
        message: 'If the account exists, a verification code has been sent.',
      });
    }

    if (user.emailVerifiedAt) {
      return res.status(200).json({
        message: 'Email is already verified. Please login.',
      });
    }

    const verification = await issueEmailVerificationCode({
      req,
      user,
      reason: 'MANUAL_RESEND',
      enforceCooldown: true,
    });

    if (!verification.ok) {
      if (verification.reason === 'DELIVERY_FAILED') {
        return sendAuthError(req, res, {
          statusCode: 503,
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Could not send verification email. Please try again shortly.',
          details: createVerificationDetails({
            email,
            code: verification.code,
            expiresAt: verification.expiresAt,
            delivery: verification.delivery,
          }),
        });
      }

      return sendAuthError(req, res, {
        statusCode: 429,
        code: 'OTP_REQUEST_RATE_LIMITED',
        message: 'Please wait before requesting another verification code.',
        details: createVerificationDetails({
          email,
          expiresAt: verification.expiresAt,
          cooldownSeconds: verification.remainingSeconds,
        }),
      });
    }

    return res.status(200).json({
      message: 'Verification code sent.',
      ...createVerificationDetails({
        email,
        code: verification.code,
        expiresAt: verification.expiresAt,
        delivery: verification.delivery,
      }),
    });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'EMAIL_VERIFICATION_REQUEST_FAILED',
      message: 'Failed to process verification code request.',
    });
  }
};

const verifyEmailCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const verificationCode = String(req.body?.verificationCode || '').trim();
    const rememberMe = toBoolean(req.body?.rememberMe, false);

    if (!email || !EMAIL_REGEX.test(email) || !verificationCode) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'AUTH_VALIDATION_ERROR',
        message: 'email and verificationCode are required.',
      });
    }

    const user = await User.findOne({ email }).select(
      '+emailVerifiedAt +emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationLastSentAt +pinSetAt'
    );

    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'INVALID_VERIFICATION_CODE',
        message: 'Verification code is invalid or expired.',
      });
    }

    if (user.emailVerifiedAt) {
      return sendAuthError(req, res, {
        statusCode: 409,
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'Email is already verified. Please login.',
      });
    }

    const nowMs = Date.now();
    const expiresAtMs = user.emailVerificationExpiresAt ? new Date(user.emailVerificationExpiresAt).getTime() : 0;
    if (!user.emailVerificationCodeHash || !expiresAtMs || expiresAtMs <= nowMs) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'VERIFICATION_CODE_EXPIRED',
        message: 'Code expired. Request a new verification code.',
      });
    }

    const incomingCodeHash = hashToken(verificationCode);
    if (incomingCodeHash !== String(user.emailVerificationCodeHash || '')) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'INVALID_VERIFICATION_CODE',
        message: 'Verification code is invalid or expired.',
      });
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationLastSentAt = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    await revokeAllUserRefreshTokens(user._id);
    const accessToken = buildAccessToken(user._id, { authMethod: 'pin' });
    const refreshToken = buildRefreshToken(user._id, { rememberMe });
    await persistRefreshToken({ userId: user._id, refreshToken });

    await logSecurityEvent(req, {
      eventType: 'EMAIL_VERIFICATION_SUCCESS',
      severity: 'info',
      userId: user._id,
      metadata: { rememberMe },
    });

    return res.status(200).json(buildAuthResponse(user, accessToken, refreshToken));
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'EMAIL_VERIFICATION_FAILED',
      message: 'Failed to verify email code.',
    });
  }
};

const login = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    pin: req.body?.pin || req.body?.password || null,
  };

  return loginWithPin(req, res);
};

const setupPin = async (req, res) => {
  try {
    if (!req.user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const pinValidation = validatePinPolicy(req.body?.pin);
    if (!pinValidation.ok) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: pinValidation.code,
        message: pinValidation.message,
      });
    }

    const trustDevice = toBoolean(req.body?.trustDevice, true);
    const normalizedDeviceId = normalizeDeviceId(req.body?.deviceId);

    const user = await User.findById(req.user._id).select('+emailVerifiedAt +pinHash +pinSetAt +trustedDeviceIdHash +failedPinAttempts +pinLockUntil');
    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    if (!user.emailVerifiedAt) {
      return sendAuthError(req, res, {
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email must be verified before setting PIN.',
      });
    }

    const pinHash = await bcrypt.hash(pinValidation.pin, 12);
    user.pinHash = pinHash;
    user.password = pinHash;
    user.passwordChangedAt = new Date();
    user.pinChangedAt = new Date();
    user.pinSetAt = new Date();
    user.failedPinAttempts = 0;
    user.pinLockUntil = null;
    user.trustedDeviceIdHash = trustDevice && normalizedDeviceId ? hashToken(normalizedDeviceId) : null;
    await user.save();

    await logSecurityEvent(req, {
      eventType: 'AUTH_PIN_SETUP_SUCCESS',
      severity: 'info',
      userId: user._id,
      metadata: {
        trustedDeviceBound: Boolean(user.trustedDeviceIdHash),
      },
    });

    return res.status(200).json({
      message: 'PIN set successfully.',
      pinEnabled: true,
      trustedDeviceBound: Boolean(user.trustedDeviceIdHash),
    });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PIN_SETUP_FAILED',
      message: 'Failed to set PIN.',
    });
  }
};

const loginWithPin = async (req, res) => {
  try {
    const credentialValidation = validateCredentials({
      email: req.body?.email,
      pin: req.body?.pin,
      password: req.body?.password,
      requirePin: true,
    });
    const rememberMe = toBoolean(req.body?.rememberMe, true);
    const normalizedDeviceId = normalizeDeviceId(req.body?.deviceId);

    if (!credentialValidation.ok) {
      if (credentialValidation.code === 'INVALID_EMAIL') {
        return sendAuthError(req, res, {
          statusCode: 404,
          code: 'EMAIL_NOT_REGISTERED',
          message: 'Email is not registered.',
        });
      }

      return sendAuthError(req, res, {
        statusCode: 400,
        code: credentialValidation.code || 'AUTH_VALIDATION_ERROR',
        message: credentialValidation.message,
      });
    }

    const email = credentialValidation.email;
    const normalizedPin = credentialValidation.pin;

    const user = await User.findOne({ email }).select(
      '+emailVerifiedAt +emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationLastSentAt +pinHash +pinSetAt +password +failedPinAttempts +pinLockUntil +trustedDeviceIdHash'
    );

    if (!user) {
      await logSecurityEvent(req, {
        eventType: 'AUTH_PIN_LOGIN_FAILED',
        severity: 'warning',
        metadata: {
          reason: 'USER_NOT_FOUND',
          email,
        },
      });

      return sendAuthError(req, res, {
        statusCode: 404,
        code: 'EMAIL_NOT_REGISTERED',
        message: 'Email is not registered.',
      });
    }

    if (!user.emailVerifiedAt) {
      const verification = await issueEmailVerificationCode({
        req,
        user,
        reason: 'PIN_LOGIN_BLOCKED_UNVERIFIED',
        enforceCooldown: true,
      });

      if (!verification.ok) {
        if (verification.reason === 'DELIVERY_FAILED') {
          return sendAuthError(req, res, {
            statusCode: 503,
            code: 'EMAIL_DELIVERY_FAILED',
            message: 'Could not send verification email. Please try again shortly.',
            details: createVerificationDetails({
              email: user.email,
              code: verification.code,
              expiresAt: verification.expiresAt,
              delivery: verification.delivery,
            }),
          });
        }

        return sendAuthError(req, res, {
          statusCode: 403,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email not verified. Use your existing code or request a new one after cooldown.',
          details: createVerificationDetails({
            email: user.email,
            expiresAt: verification.expiresAt,
            cooldownSeconds: verification.remainingSeconds,
          }),
        });
      }

      return sendAuthError(req, res, {
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified. Enter the verification code to continue.',
        details: createVerificationDetails({
          email: user.email,
          code: verification.code,
          expiresAt: verification.expiresAt,
          delivery: verification.delivery,
        }),
      });
    }

    const effectivePinHash = user.pinHash || user.password || null;
    if (!effectivePinHash) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'PIN_NOT_CONFIGURED',
        message: 'PIN is not configured for this account.',
      });
    }

    if (user.pinLockUntil && new Date(user.pinLockUntil).getTime() > Date.now()) {
      const lockUntilTime = new Date(user.pinLockUntil).getTime();
      const remainingSeconds = Math.max(1, Math.ceil((lockUntilTime - Date.now()) / 1000));

      return sendAuthError(req, res, {
        statusCode: 423,
        code: 'PIN_LOCKED',
        message: `PIN login is temporarily blocked. Try again in ${formatRetryDuration(remainingSeconds)}.`,
        details: {
          lockUntil: user.pinLockUntil,
          retryAfterSeconds: remainingSeconds,
        },
      });
    }

    if (user.trustedDeviceIdHash) {
      const incomingDeviceHash = normalizedDeviceId ? hashToken(normalizedDeviceId) : null;
      if (!incomingDeviceHash || incomingDeviceHash !== String(user.trustedDeviceIdHash)) {
        await logSecurityEvent(req, {
          eventType: 'AUTH_PIN_LOGIN_FAILED',
          severity: 'warning',
          userId: user._id,
          metadata: {
            reason: 'UNTRUSTED_DEVICE',
          },
        });

        return sendAuthError(req, res, {
          statusCode: 403,
          code: 'PIN_DEVICE_NOT_TRUSTED',
          message: 'PIN login is not allowed on this device.',
        });
      }
    }

    const pinMatches = await bcrypt.compare(normalizedPin, effectivePinHash);
    if (!pinMatches) {
      const failedAttempts = Number(user.failedPinAttempts || 0) + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_PIN_ATTEMPTS;
      const lockUntil = shouldLock ? new Date(Date.now() + PIN_LOCK_DURATION_MS) : null;

      user.failedPinAttempts = shouldLock ? 0 : failedAttempts;
      user.pinLockUntil = lockUntil;
      await user.save();

      await logSecurityEvent(req, {
        eventType: shouldLock ? 'AUTH_PIN_LOCKED' : 'AUTH_PIN_LOGIN_FAILED',
        severity: shouldLock ? 'critical' : 'warning',
        userId: user._id,
        metadata: {
          reason: 'PIN_MISMATCH',
          failedAttempts,
          lockUntil: shouldLock ? user.pinLockUntil : null,
        },
      });

      return sendAuthError(req, res, {
        statusCode: shouldLock ? 423 : 401,
        code: shouldLock ? 'PIN_LOCKED' : 'INVALID_PIN',
        message: shouldLock
          ? `PIN login is temporarily blocked. Try again in ${formatRetryDuration(Math.max(1, Math.ceil(PIN_LOCK_DURATION_MS / 1000)))}.`
          : 'Wrong PIN. Please try again.',
        ...(shouldLock ? {
          details: {
            lockUntil,
            retryAfterSeconds: Math.max(1, Math.ceil(PIN_LOCK_DURATION_MS / 1000)),
          },
        } : {}),
      });
    }

    user.failedPinAttempts = 0;
    user.pinLockUntil = null;
    if (!user.pinHash) {
      user.pinHash = effectivePinHash;
      user.pinSetAt = user.pinSetAt || new Date();
    }
    await user.save();

    await revokeAllUserRefreshTokens(user._id);
    const accessToken = buildAccessToken(user._id, { authMethod: 'pin' });
    const refreshToken = buildRefreshToken(user._id, { rememberMe });
    await persistRefreshToken({ userId: user._id, refreshToken });

    await logSecurityEvent(req, {
      eventType: 'AUTH_PIN_LOGIN_SUCCESS',
      severity: 'info',
      userId: user._id,
    });

    return res.status(200).json(buildAuthResponse(user, accessToken, refreshToken));
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PIN_LOGIN_FAILED',
      message: 'Failed to login with PIN.',
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const incomingRefreshToken = String(req.body?.refreshToken || '').trim();

    if (!incomingRefreshToken) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required.',
      });
    }

    const secret = getRefreshSecret();
    if (!secret) {
      return sendAuthError(req, res, {
        statusCode: 500,
        code: 'AUTH_CONFIG_ERROR',
        message: 'Server authentication is not configured.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, secret);
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        return sendAuthError(req, res, {
          statusCode: 401,
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired.',
        });
      }

      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token.',
      });
    }

    if (decoded?.token_type !== 'refresh') {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token type.',
      });
    }

    const userId = String(decoded?.user_id || '');
    if (!userId) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token payload.',
      });
    }

    const user = await User.findById(userId).select('+refreshTokenHash +refreshTokenExpiresAt +passwordChangedAt +emailVerifiedAt +pinSetAt');
    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'User no longer exists.',
      });
    }

    if (!user.emailVerifiedAt) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'User email is not verified.',
      });
    }

    if (!user.refreshTokenHash) {
      await logSecurityEvent(req, {
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        severity: 'critical',
        userId: user._id,
        metadata: { reason: 'USER_REFRESH_STATE_EMPTY' },
      });

      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Refresh token reuse detected. Please login again.',
      });
    }

    const incomingTokenHash = hashToken(incomingRefreshToken);
    if (incomingTokenHash !== String(user.refreshTokenHash || '')) {
      await revokeAllUserRefreshTokens(user._id);
      await clearUserRefreshState(user._id);
      await logSecurityEvent(req, {
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        severity: 'critical',
        userId: user._id,
        metadata: { reason: 'USER_REFRESH_HASH_MISMATCH' },
      });

      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Refresh token reuse detected. All sessions have been revoked.',
      });
    }

    if (user.refreshTokenExpiresAt && new Date(user.refreshTokenExpiresAt).getTime() <= Date.now()) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired.',
      });
    }

    const tokenRecord = await RefreshToken.findOne({
      user: user._id,
      tokenHash: incomingTokenHash,
    });

    if (!tokenRecord || tokenRecord.revokedAt) {
      await revokeAllUserRefreshTokens(user._id);
      await clearUserRefreshState(user._id);
      await logSecurityEvent(req, {
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        severity: 'critical',
        userId: user._id,
        metadata: { reason: !tokenRecord ? 'TOKEN_RECORD_NOT_FOUND' : 'TOKEN_ALREADY_REVOKED' },
      });

      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message: 'Refresh token reuse detected. All sessions have been revoked.',
      });
    }

    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired.',
      });
    }

    const rememberMe = toBoolean(decoded?.remember_me, false);
    const nextAccessToken = buildAccessToken(user._id, { authMethod: 'refresh' });
    const nextRefreshToken = buildRefreshToken(user._id, { rememberMe });

    await persistRefreshToken({
      userId: user._id,
      refreshToken: nextRefreshToken,
      previousTokenHash: incomingTokenHash,
    });

    await logSecurityEvent(req, {
      eventType: 'AUTH_REFRESH_SUCCESS',
      severity: 'info',
      userId: user._id,
    });

    return res.status(200).json(buildAuthResponse(user, nextAccessToken, nextRefreshToken));
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'REFRESH_FAILED',
      message: 'Failed to refresh token.',
    });
  }
};

const requestPinRecovery = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return sendAuthError(req, res, {
        statusCode: 404,
        code: 'EMAIL_NOT_REGISTERED',
        message: 'Email is not registered.',
      });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (!user) {
      await logSecurityEvent(req, {
        eventType: 'PIN_RECOVERY_REQUEST_FAILED',
        severity: 'warning',
        metadata: {
          reason: 'USER_NOT_FOUND',
          email: normalizedEmail,
        },
      });

      return sendAuthError(req, res, {
        statusCode: 404,
        code: 'EMAIL_NOT_REGISTERED',
        message: 'Email is not registered.',
      });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + PIN_RESET_WINDOW_MS);

    user.passwordResetTokenHash = resetTokenHash;
    user.passwordResetExpiresAt = expiresAt;
    await user.save();

    await logSecurityEvent(req, {
      eventType: 'PIN_RECOVERY_REQUESTED',
      severity: 'info',
      userId: user._id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    const delivery = await sendPinRecoveryEmail({
      to: normalizedEmail,
      resetToken: rawResetToken,
      expiresAt,
    });

    if (!delivery.delivered) {
      await logSecurityEvent(req, {
        eventType: 'PIN_RECOVERY_DELIVERY_FAILED',
        severity: isEmailDeliveryRequired() ? 'critical' : 'warning',
        userId: user._id,
        metadata: {
          deliveryReason: delivery?.reason || 'UNKNOWN',
          ...(delivery?.errorMessage && !isProduction ? { deliveryErrorMessage: delivery.errorMessage } : {}),
        },
      });

      if (isEmailDeliveryRequired()) {
        return sendAuthError(req, res, {
          statusCode: 503,
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Unable to send PIN recovery email right now. Please try again shortly.',
        });
      }
    }

    return res.status(200).json({
      message: 'PIN recovery instructions were generated.',
      ...(process.env.NODE_ENV !== 'production' ? {
        emailDelivery: {
          delivered: Boolean(delivery?.delivered),
          reason: delivery?.reason || null,
          transportConfigured: isEmailTransportConfigured(),
          ...(delivery?.errorMessage ? { errorMessage: delivery.errorMessage } : {}),
        },
      } : {}),
    });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PIN_RECOVERY_FAILED',
      message: 'Failed to process PIN recovery request.',
    });
  }
};

const resetPin = async (req, res) => {
  try {
    const incomingToken = String(req.body?.resetToken || '').trim();
    const incomingPin = req.body?.newPin ?? req.body?.newPassword;
    const pinValidation = validatePinPolicy(incomingPin);

    if (!incomingToken || !pinValidation.ok) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: pinValidation.code || 'AUTH_VALIDATION_ERROR',
        message: incomingToken ? (pinValidation.message || 'resetToken and newPin are required.') : 'resetToken and newPin are required.',
      });
    }

    const resetTokenHash = hashToken(incomingToken);
    const user = await User.findOne({ passwordResetTokenHash: resetTokenHash }).select(
      '+passwordResetTokenHash +passwordResetExpiresAt +password +pinHash +pinSetAt +failedPinAttempts +pinLockUntil +trustedDeviceIdHash'
    );

    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
        message: 'Invalid or expired reset token.',
      });
    }

    if (!user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt).getTime() <= Date.now()) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'INVALID_RESET_TOKEN',
        message: 'Invalid or expired reset token.',
      });
    }

    const existingCredentialHash = user.pinHash || user.password || null;
    const isReusedPin = existingCredentialHash ? await bcrypt.compare(pinValidation.pin, existingCredentialHash) : false;
    if (isReusedPin) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'PIN_REUSE_NOT_ALLOWED',
        message: 'New PIN must be different from the current PIN.',
      });
    }

    const pinHash = await bcrypt.hash(pinValidation.pin, 12);
    user.password = pinHash;
    user.pinHash = pinHash;
    user.passwordChangedAt = new Date();
    user.pinChangedAt = new Date();
    user.pinSetAt = new Date();
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.failedPinAttempts = 0;
    user.pinLockUntil = null;
    user.trustedDeviceIdHash = null;
    await user.save();

    await revokeAllUserRefreshTokens(user._id);
    await clearUserRefreshState(user._id);

    await logSecurityEvent(req, {
      eventType: 'PIN_RESET_SUCCESS',
      severity: 'warning',
      userId: user._id,
    });

    return res.status(200).json({ message: 'PIN has been reset successfully.' });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PIN_RESET_FAILED',
      message: 'Failed to reset PIN.',
    });
  }
};

const updatePin = async (req, res) => {
  try {
    if (!req.user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const currentPin = req.body?.currentPin ?? req.body?.currentPassword;
    const newPin = req.body?.newPin ?? req.body?.newPassword;
    const currentPinValidation = validatePinPolicy(currentPin);
    const newPinValidation = validatePinPolicy(newPin);

    if (!currentPinValidation.ok || !newPinValidation.ok) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: newPinValidation.code || currentPinValidation.code || 'AUTH_VALIDATION_ERROR',
        message: currentPinValidation.ok ? newPinValidation.message : currentPinValidation.message,
      });
    }

    const user = await User.findById(req.user._id).select('+password +pinHash +pinSetAt +failedPinAttempts +pinLockUntil +trustedDeviceIdHash');
    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    const existingCredentialHash = user.pinHash || user.password || null;
    const isMatch = existingCredentialHash ? await bcrypt.compare(currentPinValidation.pin, existingCredentialHash) : false;
    if (!isMatch) {
      await logSecurityEvent(req, {
        eventType: 'PIN_UPDATE_FAILED',
        severity: 'warning',
        userId: user._id,
        metadata: { reason: 'CURRENT_PIN_MISMATCH' },
      });
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'CURRENT_PIN_INCORRECT',
        message: 'Current PIN is incorrect.',
      });
    }

    const isReusedPin = existingCredentialHash ? await bcrypt.compare(newPinValidation.pin, existingCredentialHash) : false;
    if (isReusedPin) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'PIN_REUSE_NOT_ALLOWED',
        message: 'New PIN must be different from the current PIN.',
      });
    }

    const pinHash = await bcrypt.hash(newPinValidation.pin, 12);
    user.password = pinHash;
    user.pinHash = pinHash;
    user.passwordChangedAt = new Date();
    user.pinChangedAt = new Date();
    user.pinSetAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.failedPinAttempts = 0;
    user.pinLockUntil = null;
    user.trustedDeviceIdHash = null;
    await user.save();

    await revokeAllUserRefreshTokens(user._id);
    await clearUserRefreshState(user._id);

    await logSecurityEvent(req, {
      eventType: 'PIN_UPDATE_SUCCESS',
      severity: 'warning',
      userId: user._id,
    });

    return res.status(200).json({ message: 'PIN updated successfully. Please login again.' });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PIN_UPDATE_FAILED',
      message: 'Failed to update PIN.',
    });
  }
};

const requestPasswordRecovery = requestPinRecovery;
const resetPassword = resetPin;
const updatePassword = updatePin;

const logout = async (req, res) => {
  try {
    const incomingRefreshToken = String(req.body?.refreshToken || '').trim();
    if (!incomingRefreshToken) {
      return sendAuthError(req, res, {
        statusCode: 400,
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required.',
      });
    }

    const incomingTokenHash = hashToken(incomingRefreshToken);
    const tokenRecord = await RefreshToken.findOne({ tokenHash: incomingTokenHash });

    if (!tokenRecord) {
      return res.status(200).json({ message: 'Logged out.' });
    }

    tokenRecord.revokedAt = new Date();
    await tokenRecord.save();

    await clearUserRefreshState(tokenRecord.user);

    await logSecurityEvent(req, {
      eventType: 'AUTH_LOGOUT_SUCCESS',
      severity: 'info',
      userId: tokenRecord.user,
    });

    return res.status(200).json({ message: 'Logged out.' });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'LOGOUT_FAILED',
      message: 'Failed to logout.',
    });
  }
};

const getProfile = async (req, res) => {
  try {
    if (!req.user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
    }

    return res.status(200).json({
      user: toPublicUser(req.user),
    });
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'PROFILE_FETCH_FAILED',
      message: 'Failed to fetch profile.',
    });
  }
};

module.exports = {
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
  getProfile,
};
