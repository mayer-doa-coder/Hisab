const { error: sendError } = require('../utils/apiResponse');
const { normalizeRole } = require('../utils/normalization');

const requireRoles = (...roles) => {
  const allowed = new Set(roles.map(normalizeRole).filter(Boolean));

  return (req, res, next) => {
    if (allowed.size === 0) {
      return next();
    }

    const userRole = normalizeRole(req.user?.role || req.auth?.role);
    if (!userRole || !allowed.has(userRole)) {
      return sendError(req, res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource.',
      });
    }

    return next();
  };
};

module.exports = {
  requireRoles,
};
