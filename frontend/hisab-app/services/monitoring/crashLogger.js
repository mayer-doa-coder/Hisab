const MAX_CRASH_EVENTS = 100;

const crashEvents = [];

const REDACT_KEYS = [
  'token',
  'password',
  'pin',
  'secret',
  'authorization',
  'cookie',
  'refresh',
  'access',
  'credential',
];

const shouldRedact = (key) => {
  const token = String(key || '').trim().toLowerCase();
  if (!token) {
    return false;
  }

  return REDACT_KEYS.some((needle) => token.includes(needle));
};

const sanitizeValue = (value, visited = new Set()) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (visited.has(value)) {
    return '[circular]';
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((row) => sanitizeValue(row, visited));
  }

  const out = {};
  for (const [key, row] of Object.entries(value)) {
    out[key] = shouldRedact(key) ? '[redacted]' : sanitizeValue(row, visited);
  }

  return out;
};

export const recordLocalCrash = ({ severity = 'error', message, stack = null, metadata = null } = {}) => {
  const row = {
    timestamp: new Date().toISOString(),
    severity: String(severity || 'error').trim().toLowerCase() || 'error',
    message: String(message || 'Unknown error').trim(),
    stack: stack ? String(stack).slice(0, 12000) : null,
    metadata: sanitizeValue(metadata || {}),
  };

  crashEvents.push(row);
  if (crashEvents.length > MAX_CRASH_EVENTS) {
    crashEvents.shift();
  }

  return row;
};

export const listLocalCrashes = ({ limit = 50 } = {}) => {
  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
  return [...crashEvents].slice(-safeLimit).reverse();
};

export const captureWithCrashLogger = async (fn, context = null) => {
  try {
    return await fn();
  } catch (error) {
    recordLocalCrash({
      severity: 'error',
      message: error?.message || 'Unhandled operation error',
      stack: error?.stack || null,
      metadata: context && typeof context === 'object' ? context : null,
    });
    throw error;
  }
};
