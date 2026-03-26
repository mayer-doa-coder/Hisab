const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid authorization token.' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ message: 'Missing or invalid authorization token.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Server authentication is not configured.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        return res.status(401).json({ code: 'ACCESS_TOKEN_EXPIRED', message: 'Access token has expired.' });
      }

      return res.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'Invalid access token.' });
    }

    if (decoded?.token_type && decoded.token_type !== 'access') {
      return res.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'Invalid access token type.' });
    }

    const userId = decoded?.user_id;
    if (!userId) {
      return res.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'Invalid access token payload.' });
    }

    const user = await User.findById(userId).select('+passwordChangedAt');
    if (!user) {
      return res.status(401).json({ code: 'INVALID_ACCESS_TOKEN', message: 'User for token no longer exists.' });
    }

    const issuedAt = Number(decoded?.iat || 0);
    if (user.passwordChangedAt && issuedAt > 0) {
      const changedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (changedAtSec >= issuedAt) {
        return res.status(401).json({
          code: 'TOKEN_REVOKED',
          message: 'Token is no longer valid. Please login again.',
        });
      }
    }

    req.auth = {
      user_id: String(userId),
      token_type: 'access',
    };
    req.user_id = String(userId);
    req.user = user;
    return next();
  } catch {
    return res.status(500).json({ message: 'Failed to authorize request.' });
  }
};

module.exports = authMiddleware;
