class HttpError extends Error {
  constructor({ statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal server error.', details = null } = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details = null, code = 'VALIDATION_ERROR') =>
  new HttpError({ statusCode: 400, code, message, details });

const notFound = (message = 'Resource not found.', code = 'RESOURCE_NOT_FOUND') =>
  new HttpError({ statusCode: 404, code, message });

const conflict = (message = 'Conflict.', code = 'CONFLICT', details = null) =>
  new HttpError({ statusCode: 409, code, message, details });

const unprocessable = (message = 'Business rule violation.', code = 'BUSINESS_RULE_VIOLATION', details = null) =>
  new HttpError({ statusCode: 422, code, message, details });

module.exports = {
  HttpError,
  badRequest,
  notFound,
  conflict,
  unprocessable,
};
