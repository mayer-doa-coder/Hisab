const { ZodError } = require('zod');
const { error: sendError } = require('../utils/apiResponse');

const formatIssues = (issues = []) => {
  return issues.map((issue) => ({
    field: Array.isArray(issue?.path) && issue.path.length > 0 ? issue.path.join('.') : 'body',
    reason: issue?.message || 'invalid',
  }));
};

const deriveValidationCode = (details = []) => {
  const pinIssue = details.find((item) => {
    const field = String(item?.field || '').toLowerCase();
    const reason = String(item?.reason || '').toLowerCase();
    return ['pin', 'newpin', 'currentpin', 'password', 'newpassword', 'currentpassword'].includes(field)
      && reason.includes('pin must be 4 to 6 digits');
  });

  if (pinIssue) {
    return 'INVALID_PIN_FORMAT';
  }

  const emailIssue = details.find((item) => {
    const field = String(item?.field || '').toLowerCase();
    const reason = String(item?.reason || '').toLowerCase();
    return field === 'email' && reason.includes('valid email');
  });

  if (emailIssue) {
    return 'INVALID_EMAIL';
  }

  return 'AUTH_VALIDATION_ERROR';
};

const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body || {});
      req.body = parsed;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatIssues(error.issues);
        return sendError(req, res, {
          statusCode: 400,
          code: deriveValidationCode(details),
          message: 'Request validation failed.',
          details,
        });
      }

      return sendError(req, res, {
        statusCode: 400,
        code: 'AUTH_VALIDATION_ERROR',
        message: 'Invalid request payload.',
      });
    }
  };
};

module.exports = {
  validateBody,
};
