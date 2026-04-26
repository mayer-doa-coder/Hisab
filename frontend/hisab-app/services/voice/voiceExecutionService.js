/**
 * Thin execution layer sitting on top of commandExecutor.
 *
 * Adds:
 *   - Typed EXEC_RESULT codes so callers never inspect raw message strings.
 *   - Retry on transient network/server errors (502/503/504, AbortError).
 *   - TTL-based idempotency store so duplicate taps within the same session
 *     are silently swallowed rather than re-executing.
 */

import { executeCommand } from './commandExecutor';

// ─── Typed result codes ────────────────────────────────────────────────────────

export const EXEC_RESULT = Object.freeze({
  /** API call succeeded and data was written/read. */
  SUCCESS:          'SUCCESS',
  /** FSM was not in CONFIRMED state — guard rejected execution. */
  UNCONFIRMED:      'UNCONFIRMED',
  /** Payload validation failed (missing field, bad amount, etc.). */
  VALIDATION_FAILED:'VALIDATION_FAILED',
  /** Role does not have access to this intent. */
  PERMISSION_DENIED:'PERMISSION_DENIED',
  /** Confidence too low or high-risk gate not satisfied. */
  SAFETY_BLOCKED:   'SAFETY_BLOCKED',
  /** Same command already executed in this session (idempotency hit). */
  DUPLICATE:        'DUPLICATE',
  /** Network timeout or no connectivity — safe to retry. */
  NETWORK_ERROR:    'NETWORK_ERROR',
  /** 5xx or unexpected failure — may indicate a backend problem. */
  SERVER_ERROR:     'SERVER_ERROR',
});

// ─── Idempotency store with TTL ───────────────────────────────────────────────
//
// Map<signature → { key, executedAt }>
// Entries older than TTL_MS are evicted on the next lookup, preventing the Map
// from growing indefinitely in long app sessions.

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const _idempotencyStore = new Map();

const _storeGet = (signature) => {
  const entry = _idempotencyStore.get(signature);
  if (!entry) return null;
  if (Date.now() - entry.executedAt > TTL_MS) {
    _idempotencyStore.delete(signature);
    return null;
  }
  return entry.key;
};

const _storeSet = (signature, key) => {
  _idempotencyStore.set(signature, { key, executedAt: Date.now() });
};

const _makeSignature = (userId, context) =>
  `${String(userId || 'anon')}:${context.intent}:${context.customerId || ''}:${context.amount || 0}:${context.date || ''}`;

// ─── Retry config ─────────────────────────────────────────────────────────────

const RETRYABLE_HTTP_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const _isRetryableError = (error) =>
  Boolean(error?.isNetworkError) || RETRYABLE_HTTP_STATUS.has(Number(error?.status));

// ─── Failure classifier ───────────────────────────────────────────────────────

const _classifyFailure = (result) => {
  const msg  = String(result.message || '').toLowerCase();
  const code = String(result.data?.code || '').toUpperCase();

  if (code === 'FSM_CONFIRMATION_REQUIRED')           return EXEC_RESULT.UNCONFIRMED;
  if (/not allowed|permission|role/i.test(msg))       return EXEC_RESULT.PERMISSION_DENIED;
  if (/required|invalid|unsupported/i.test(msg))      return EXEC_RESULT.VALIDATION_FAILED;
  if (/confidence|high-risk|safety/i.test(msg))       return EXEC_RESULT.SAFETY_BLOCKED;
  if (/idempotency|duplicate/i.test(msg))             return EXEC_RESULT.DUPLICATE;
  if (/timeout|network|reach/i.test(msg))             return EXEC_RESULT.NETWORK_ERROR;
  return EXEC_RESULT.SERVER_ERROR;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a confirmed voice command.
 *
 * @param {Object} params
 * @param {Object}  params.fsmContext   - FSM context (intent, name, amount, date, status, confidence, customerId)
 * @param {string}  params.role         - User role (OWNER | CASHIER | STOCK_MANAGER)
 * @param {string}  params.userId       - Stable user identifier for idempotency key
 * @param {string}  params.accessToken  - Bearer token
 * @param {string}  [params.customerId] - Resolved customer id (overrides fsmContext.customerId if provided)
 *
 * @returns {{ code: EXEC_RESULT, message: string, data: Object, idempotencyKey: string|null }}
 */
export const executeVoiceCommand = async ({
  fsmContext,
  role,
  userId,
  accessToken,
  customerId,
} = {}) => {
  const resolvedContext = {
    ...fsmContext,
    customerId: customerId || fsmContext?.customerId || null,
  };

  // ── Idempotency: swallow duplicate taps ─────────────────────────────────────
  const sig         = _makeSignature(userId, resolvedContext);
  const existingKey = _storeGet(sig);
  if (existingKey) {
    return {
      code:           EXEC_RESULT.DUPLICATE,
      message:        'Command already executed in this session.',
      data:           {},
      idempotencyKey: existingKey,
    };
  }

  // ── Retry loop ───────────────────────────────────────────────────────────────
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await _sleep(RETRY_DELAY_MS);

    try {
      const result = await executeCommand({
        role,
        userId,
        accessToken,
        context: resolvedContext,
      });

      if (result.status === 'SUCCESS') {
        _storeSet(sig, result.idempotency_key);
        return {
          code:           EXEC_RESULT.SUCCESS,
          message:        result.message,
          data:           result.data || {},
          idempotencyKey: result.idempotency_key,
        };
      }

      const code = _classifyFailure(result);
      const retryable = code === EXEC_RESULT.NETWORK_ERROR || code === EXEC_RESULT.SERVER_ERROR;

      if (!retryable || attempt >= MAX_RETRIES) {
        return { code, message: result.message, data: result.data || {}, idempotencyKey: null };
      }

      lastError = { code, message: result.message };
    } catch (error) {
      if (!_isRetryableError(error) || attempt >= MAX_RETRIES) {
        return {
          code:           error?.isNetworkError ? EXEC_RESULT.NETWORK_ERROR : EXEC_RESULT.SERVER_ERROR,
          message:        error?.message || 'Execution failed.',
          data:           { status: error?.status || null },
          idempotencyKey: null,
        };
      }
      lastError = {
        code:    EXEC_RESULT.NETWORK_ERROR,
        message: error?.message || 'Network error.',
      };
    }
  }

  return {
    code:           lastError?.code    || EXEC_RESULT.SERVER_ERROR,
    message:        lastError?.message || 'Max retries exceeded.',
    data:           {},
    idempotencyKey: null,
  };
};

export default { executeVoiceCommand, EXEC_RESULT };
