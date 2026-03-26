const buckets = new Map();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 100;

const now = () => Date.now();

const getClientKey = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const cleanupBuckets = (currentTime) => {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= currentTime) {
      buckets.delete(key);
    }
  }
};

const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  keyPrefix = 'global',
} = {}) => {
  return (req, res, next) => {
    const currentTime = now();
    cleanupBuckets(currentTime);

    const clientKey = `${keyPrefix}:${getClientKey(req)}`;
    const existing = buckets.get(clientKey);

    if (!existing || existing.resetAt <= currentTime) {
      buckets.set(clientKey, {
        count: 1,
        resetAt: currentTime + windowMs,
      });
      return next();
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
    }

    existing.count += 1;
    buckets.set(clientKey, existing);
    return next();
  };
};

module.exports = {
  createRateLimiter,
};
