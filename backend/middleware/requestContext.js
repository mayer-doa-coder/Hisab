const crypto = require('crypto');

const requestContext = (req, res, next) => {
  const incomingRequestId = String(req.headers['x-request-id'] || '').trim();
  req.requestId = incomingRequestId || crypto.randomUUID();

  res.setHeader('X-Request-Id', req.requestId);
  next();
};

module.exports = requestContext;
