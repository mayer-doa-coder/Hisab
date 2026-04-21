const fs = require('fs');
const path = require('path');

const RELIABILITY_DIR = path.join(__dirname, '..', 'artifacts', 'reliability');
const CRASH_LOG_FILE = path.join(RELIABILITY_DIR, 'crashEvents.log');

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

let processHandlersInstalled = false;

const ensureReliabilityDir = () => {
  if (!fs.existsSync(RELIABILITY_DIR)) {
    fs.mkdirSync(RELIABILITY_DIR, { recursive: true });
  }
};

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

  if (typeof value === 'string') {
    if (value.length > 5000) {
      return `${value.slice(0, 5000)}...[truncated]`;
    }
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
    if (shouldRedact(key)) {
      out[key] = '[redacted]';
      continue;
    }

    out[key] = sanitizeValue(row, visited);
  }

  return out;
};

const appendCrashRow = (row) => {
  ensureReliabilityDir();
  fs.appendFileSync(CRASH_LOG_FILE, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
};

const recordCrashEvent = ({
  source = 'server',
  severity = 'error',
  message = 'Unknown crash event',
  stack = null,
  metadata = null,
  userId = null,
  requestId = null,
} = {}) => {
  const row = {
    timestamp: new Date().toISOString(),
    source: String(source || 'server').trim().toLowerCase(),
    severity: String(severity || 'error').trim().toLowerCase(),
    message: String(message || 'Unknown crash event').trim(),
    stack: stack ? String(stack).slice(0, 12000) : null,
    userId: userId ? String(userId) : null,
    requestId: requestId ? String(requestId) : null,
    metadata: sanitizeValue(metadata || {}),
  };

  return appendCrashRow(row);
};

const listCrashEvents = ({ limit = 100, severity = null } = {}) => {
  ensureReliabilityDir();
  if (!fs.existsSync(CRASH_LOG_FILE)) {
    return [];
  }

  const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
  const severityFilter = severity ? String(severity).trim().toLowerCase() : null;

  const lines = fs.readFileSync(CRASH_LOG_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(normalizedLimit * 2, normalizedLimit));

  const output = [];
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      if (severityFilter && String(parsed.severity || '').trim().toLowerCase() !== severityFilter) {
        continue;
      }

      output.push(parsed);
      if (output.length >= normalizedLimit) {
        break;
      }
    } catch {
      // Ignore malformed rows.
    }
  }

  return output;
};

const registerProcessCrashHandlers = ({ logger = console } = {}) => {
  if (processHandlersInstalled) {
    return;
  }

  processHandlersInstalled = true;

  process.on('uncaughtException', (error) => {
    const message = error?.message || String(error || 'Uncaught exception');
    recordCrashEvent({
      source: 'process',
      severity: 'fatal',
      message,
      stack: error?.stack || null,
      metadata: {
        event: 'uncaughtException',
      },
    });

    logger?.error?.('[CRASH][UNCAUGHT_EXCEPTION]', message);

    setTimeout(() => {
      process.exit(1);
    }, 25);
  });

  process.on('unhandledRejection', (reason) => {
    const reasonMessage = reason?.message || String(reason || 'Unhandled rejection');
    recordCrashEvent({
      source: 'process',
      severity: 'error',
      message: reasonMessage,
      stack: reason?.stack || null,
      metadata: {
        event: 'unhandledRejection',
      },
    });

    logger?.error?.('[CRASH][UNHANDLED_REJECTION]', reasonMessage);
  });
};

module.exports = {
  recordCrashEvent,
  listCrashEvents,
  registerProcessCrashHandlers,
  sanitizeValue,
};
