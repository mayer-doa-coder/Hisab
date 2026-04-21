const { error: sendError } = require('../utils/apiResponse');
const { checkPermission, canonicalizeRole } = require('../security/rbac');

const requirePermission = (action) => {
  const normalizedAction = String(action || '').trim();

  return (req, res, next) => {
    if (!normalizedAction) {
      return next();
    }

    const role = canonicalizeRole(req.auth?.role || req.user?.role);
    if (!checkPermission(role, normalizedAction)) {
      return sendError(req, res, {
        statusCode: 403,
        code: 'FORBIDDEN_ACTION',
        message: `You do not have permission for action: ${normalizedAction}`,
      });
    }

    return next();
  };
};

module.exports = {
  checkPermission,
  requirePermission,
};
