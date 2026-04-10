const getRequestId = (req) => req.requestId || null;

const success = (req, res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    requestId: getRequestId(req),
    timestamp: new Date().toISOString(),
    data,
  });
};

const error = (req, res, {
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  message = 'Internal server error.',
  details = null,
} = {}) => {
  return res.status(statusCode).json({
    requestId: getRequestId(req),
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
};

module.exports = {
  success,
  error,
};
