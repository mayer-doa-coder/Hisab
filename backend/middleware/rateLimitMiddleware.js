const buckets = new Map();
const MAX_BUCKETS = 5000;

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

const getUserKey = (req) => {
  const userId = String(req.user_id || req.auth?.user_id || '').trim();
  return userId || null;
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
  scopeByUser = false,
  keyResolver = null,
} = {}) => {
  return (req, res, next) => {
    const currentTime = now();
    cleanupBuckets(currentTime);

    if (buckets.size > MAX_BUCKETS) {
      cleanupBuckets(currentTime);
    }

    const resolvedScope = typeof keyResolver === 'function' ? keyResolver(req) : null;
    const fallbackScope = scopeByUser ? getUserKey(req) || getClientKey(req) : getClientKey(req);
    const scopeValue = String(resolvedScope || fallbackScope || 'unknown').trim() || 'unknown';
    const clientKey = `${keyPrefix}:${scopeValue}`;
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
