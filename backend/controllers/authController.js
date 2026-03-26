const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 6;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getAccessSecret = () => process.env.JWT_SECRET;

const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const buildAccessToken = (userId) => {
  const secret = getAccessSecret();

  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign({ user_id: String(userId), token_type: 'access' }, secret, {
    expiresIn: '15m',
  });
};

const buildRefreshToken = (userId) => {
  const secret = getRefreshSecret();

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET (or JWT_SECRET) is not configured.');
  }

  return jwt.sign({ user_id: String(userId), token_type: 'refresh' }, secret, {
    expiresIn: '7d',
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

const toIsoFromJwtExp = (token) => {
  const decoded = decodeTokenUnsafe(token);
  const exp = Number(decoded?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return null;
  }

  return new Date(exp * 1000).toISOString();
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
  createdAt: userDoc.createdAt,
});

const validateCredentials = ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');

  if (!normalizedEmail || !normalizedPassword) {
    return { ok: false, message: 'Email and password are required.' };
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { ok: false, message: 'Please provide a valid email address.' };
  }

  if (normalizedPassword.length < 6) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }

  return {
    ok: true,
    email: normalizedEmail,
    password: normalizedPassword,
  };
};

const signup = async (req, res) => {
  try {
    const validation = validateCredentials(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const existing = await User.findOne({ email: validation.email }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const passwordHash = await bcrypt.hash(validation.password, 12);

    const user = await User.create({
      email: validation.email,
      password: passwordHash,
      failedLoginAttempts: 0,
      lockUntil: null,
      passwordChangedAt: new Date(),
    });

    await revokeAllUserRefreshTokens(user._id);
    const accessToken = buildAccessToken(user._id);
    const refreshToken = buildRefreshToken(user._id);
    await persistRefreshToken({ userId: user._id, refreshToken });

    return res.status(201).json(buildAuthResponse(user, accessToken, refreshToken));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    return res.status(500).json({ message: 'Failed to signup user.' });
  }
};

const login = async (req, res) => {
  try {
    const validation = validateCredentials(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const user = await User.findOne({ email: validation.email }).select('+password +failedLoginAttempts +lockUntil');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.lockUntil && new Date(user.lockUntil).getTime() > Date.now()) {
      return res.status(423).json({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to multiple failed login attempts.',
        lockUntil: user.lockUntil,
      });
    }

    const passwordMatch = await bcrypt.compare(validation.password, user.password);
    if (!passwordMatch) {
      const failedAttempts = Number(user.failedLoginAttempts || 0) + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_LOGINS;

      await User.findByIdAndUpdate(user._id, {
        failedLoginAttempts: shouldLock ? 0 : failedAttempts,
        lockUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      });

      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await revokeAllUserRefreshTokens(user._id);
    const accessToken = buildAccessToken(user._id);
    const refreshToken = buildRefreshToken(user._id);
    await persistRefreshToken({ userId: user._id, refreshToken });

    return res.status(200).json(buildAuthResponse(user, accessToken, refreshToken));
  } catch {
    return res.status(500).json({ message: 'Failed to login user.' });
  }
};

const refreshToken = async (req, res) => {
  try {
    const incomingRefreshToken = String(req.body?.refreshToken || '').trim();

    if (!incomingRefreshToken) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }

    const secret = getRefreshSecret();
    if (!secret) {
      return res.status(500).json({ message: 'Server authentication is not configured.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, secret);
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        return res.status(401).json({ code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired.' });
      }

      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token.' });
    }

    if (decoded?.token_type !== 'refresh') {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token type.' });
    }

    const userId = String(decoded?.user_id || '');
    if (!userId) {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token payload.' });
    }

    const user = await User.findById(userId).select('+refreshTokenHash +refreshTokenExpiresAt +passwordChangedAt');
    if (!user) {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'User no longer exists.' });
    }

    if (!user.refreshTokenHash) {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is not active.' });
    }

    if (hashToken(incomingRefreshToken) !== String(user.refreshTokenHash || '')) {
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token does not match.' });
    }

    if (user.refreshTokenExpiresAt && new Date(user.refreshTokenExpiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired.' });
    }

    const incomingTokenHash = hashToken(incomingRefreshToken);
    const tokenRecord = await RefreshToken.findOne({
      user: user._id,
      tokenHash: incomingTokenHash,
    });

    if (!tokenRecord || tokenRecord.revokedAt) {
      await revokeAllUserRefreshTokens(user._id);
      return res.status(401).json({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token has been revoked.' });
    }

    if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired.' });
    }

    const nextAccessToken = buildAccessToken(user._id);
    const nextRefreshToken = buildRefreshToken(user._id);

    await persistRefreshToken({
      userId: user._id,
      refreshToken: nextRefreshToken,
      previousTokenHash: incomingTokenHash,
    });

    return res.status(200).json(buildAuthResponse(user, nextAccessToken, nextRefreshToken));
  } catch {
    return res.status(500).json({ message: 'Failed to refresh token.' });
  }
};

const requestPasswordRecovery = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(200).json({ message: 'If the email exists, recovery instructions were generated.' });
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (!user) {
      return res.status(200).json({ message: 'If the email exists, recovery instructions were generated.' });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_WINDOW_MS);

    user.passwordResetTokenHash = resetTokenHash;
    user.passwordResetExpiresAt = expiresAt;
    await user.save();

    return res.status(200).json({
      message: 'If the email exists, recovery instructions were generated.',
      ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawResetToken, resetTokenExpiresAt: expiresAt } : {}),
    });
  } catch {
    return res.status(500).json({ message: 'Failed to process password recovery request.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const incomingToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!incomingToken || !newPassword) {
      return res.status(400).json({ message: 'resetToken and newPassword are required.' });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
    }

    const resetTokenHash = hashToken(incomingToken);
    const user = await User.findOne({ passwordResetTokenHash: resetTokenHash }).select(
      '+passwordResetTokenHash +passwordResetExpiresAt +password'
    );

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    if (!user.passwordResetExpiresAt || new Date(user.passwordResetExpiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = new Date();
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    await revokeAllUserRefreshTokens(user._id);

    return res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch {
    return res.status(500).json({ message: 'Failed to reset password.' });
  }
};

const updatePassword = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required.' });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    await revokeAllUserRefreshTokens(user._id);

    return res.status(200).json({ message: 'Password updated successfully. Please login again.' });
  } catch {
    return res.status(500).json({ message: 'Failed to update password.' });
  }
};

const logout = async (req, res) => {
  try {
    const incomingRefreshToken = String(req.body?.refreshToken || '').trim();
    if (!incomingRefreshToken) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }

    const incomingTokenHash = hashToken(incomingRefreshToken);
    const tokenRecord = await RefreshToken.findOne({ tokenHash: incomingTokenHash });

    if (!tokenRecord) {
      return res.status(200).json({ message: 'Logged out.' });
    }

    tokenRecord.revokedAt = new Date();
    await tokenRecord.save();

    await User.findByIdAndUpdate(tokenRecord.user, {
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    });

    return res.status(200).json({ message: 'Logged out.' });
  } catch {
    return res.status(500).json({ message: 'Failed to logout.' });
  }
};

const getProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    return res.status(200).json({
      user: toPublicUser(req.user),
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch profile.' });
  }
};

module.exports = {
  signup,
  login,
  refreshToken,
  requestPasswordRecovery,
  resetPassword,
  updatePassword,
  logout,
  getProfile,
};
