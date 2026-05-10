const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error: sendError } = require('../utils/apiResponse');
const { canonicalizeRole, listPermissions } = require('../security/rbac');

const sendAuthError = (req, res, {
  statusCode = 401,
  code = 'AUTH_UNAUTHORIZED',
  message = 'Unauthorized.',
  details = null,
} = {}) => {
  return sendError(req, res, {
    statusCode,
    code,
    message,
    details,
  });
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'MISSING_ACCESS_TOKEN',
        message: 'Missing or invalid authorization token.',
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'MISSING_ACCESS_TOKEN',
        message: 'Missing or invalid authorization token.',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return sendAuthError(req, res, {
        statusCode: 500,
        code: 'AUTH_CONFIG_ERROR',
        message: 'Server authentication is not configured.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (error) {
      if (error?.name === 'TokenExpiredError') {
        return sendAuthError(req, res, {
          statusCode: 401,
          code: 'ACCESS_TOKEN_EXPIRED',
          message: 'Access token has expired.',
        });
      }

      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid access token.',
      });
    }

    if (decoded?.token_type && decoded.token_type !== 'access') {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid access token type.',
      });
    }

    const userId = decoded?.user_id;
    if (!userId) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid access token payload.',
      });
    }

    const user = await User.findById(userId).select('+passwordChangedAt +pinChangedAt +emailVerifiedAt +pinSetAt');
    if (!user) {
      return sendAuthError(req, res, {
        statusCode: 401,
        code: 'INVALID_ACCESS_TOKEN',
        message: 'User for token no longer exists.',
      });
    }

    const issuedAt = Number(decoded?.iat || 0);
    if ((user.pinChangedAt || user.passwordChangedAt) && issuedAt > 0) {
      const effectiveChangedAt = user.pinChangedAt || user.passwordChangedAt;
      const changedAtSec = Math.floor(new Date(effectiveChangedAt).getTime() / 1000);
      if (changedAtSec > issuedAt) {
        return sendAuthError(req, res, {
          statusCode: 401,
          code: 'TOKEN_REVOKED',
          message: 'Token is no longer valid. Please login again.',
        });
      }
    }

    const status = String(user.status || 'ACTIVE').trim().toUpperCase();
    if (status !== 'ACTIVE') {
      return sendAuthError(req, res, {
        statusCode: 403,
        code: 'USER_INACTIVE',
        message: 'User account is not active.',
      });
    }

    const role = canonicalizeRole(user.role);
    const tenantUserId = String(user.ownerUserId || user._id);
    const actorUserId = String(user._id);
    const branchId = user.branchId ? String(user.branchId) : null;

    req.auth = {
      user_id: actorUserId,
      actor_user_id: actorUserId,
      tenant_user_id: tenantUserId,
      token_type: 'access',
      role,
      branch_id: branchId,
      permissions: listPermissions(role),
    };
    req.user_id = tenantUserId;
    req.actor_user_id = actorUserId;
    req.branch_id = branchId;
    req.user = user;
    req.user.role = role;
    req.user.status = status;
    return next();
  } catch {
    return sendAuthError(req, res, {
      statusCode: 500,
      code: 'AUTHORIZATION_FAILED',
      message: 'Failed to authorize request.',
    });
  }
};

module.exports = authMiddleware;
