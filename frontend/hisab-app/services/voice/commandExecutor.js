import { canonicalizeRole } from '../../security/rbac';
import { VOICE_TUNING_CONFIG } from './config/voiceTuningConfig';

const LOCAL_INTENT_TO_API = Object.freeze({
  ADD_DEBT:      { path: '/api/v1/baki/credits',   method: 'POST' },
  PAYMENT:       { path: '/api/v1/baki/payments',  method: 'POST' },
  SALE:          { path: '/api/v1/transactions',   method: 'POST' },
  CHECK_BALANCE: { path: '/api/v1/baki/balance',   method: 'GET'  },
});

const getApiMappingForIntent = (intent) => {
  return LOCAL_INTENT_TO_API[String(intent || '').trim().toUpperCase()] || null;
};

const ROLE_ACCESS = Object.freeze({
  OWNER:         new Set(['ADD_DEBT', 'PAYMENT', 'SALE', 'CHECK_BALANCE', 'DELETE', 'VOID']),
  CASHIER:       new Set(['ADD_DEBT', 'PAYMENT', 'SALE', 'CHECK_BALANCE']),
  STOCK_MANAGER: new Set(['ADD_DEBT', 'PAYMENT', 'SALE', 'CHECK_BALANCE', 'VOID']),
});

const RECENT_IDEMPOTENCY = new Map();

const nowIsoDate = () => new Date().toISOString().slice(0, 10);

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const shortHash = (text) => {
  let hash = 2166136261;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
};

const toIntent = (token) => {
  const normalized = String(token || '').trim().toLowerCase();
  if (normalized === 'baki') {
    return 'ADD_DEBT';
  }
  if (normalized === 'joma') {
    return 'PAYMENT';
  }
  if (normalized === 'becha' || normalized === 'kinbo') {
    return 'SALE';
  }
  if (normalized === 'balance') {
    return 'CHECK_BALANCE';
  }
  return '';
};

const toRiskLevel = ({ intent, amount }) => {
  const normalized = String(intent || '').toUpperCase();
  const money = Number(amount || 0);

  if (normalized === 'SALE' && money <= 1000) {
    return 'LOW';
  }

  if (normalized === 'ADD_DEBT') {
    return 'MEDIUM';
  }

  if (money >= 5000 || normalized === 'VOID' || normalized === 'DELETE') {
    return 'HIGH';
  }

  return 'MEDIUM';
};

export const evaluateExecutionSafety = ({ payload, context }) => {
  const riskLevel = toRiskLevel({ intent: payload.intent, amount: payload.amount });
  const minConfidence = riskLevel === 'HIGH'
    ? VOICE_TUNING_CONFIG.thresholds.highRiskExecutionMinConfidence
    : VOICE_TUNING_CONFIG.thresholds.executionMinConfidence;

  if (Number(payload.confidence || 0) < Number(minConfidence)) {
    return {
      ok: false,
      riskLevel,
      message: `Confidence ${payload.confidence} is below ${minConfidence} for ${riskLevel} risk execution.`,
    };
  }

  if (riskLevel === 'HIGH' && context?.status !== 'CONFIRMED') {
    return {
      ok: false,
      riskLevel,
      message: 'High-risk command requires explicit CONFIRMED state.',
    };
  }

  return {
    ok: true,
    riskLevel,
    message: 'Safe to execute.',
  };
};

export const validatePayload = (payload) => {
  const isBalanceCheck = String(payload.intent || '').toUpperCase() === 'CHECK_BALANCE';

  const required = isBalanceCheck ? ['intent', 'confidence'] : ['intent', 'amount', 'confidence'];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      return { ok: false, message: `${field} is required.` };
    }
  }

  if (!isBalanceCheck && Number(payload.amount) <= 0) {
    return { ok: false, message: 'amount must be greater than 0.' };
  }

  if (!getApiMappingForIntent(payload.intent)) {
    return { ok: false, message: `Unsupported intent: ${payload.intent}` };
  }

  if (payload.customer_id && String(payload.customer_id).trim().length < 3) {
    return { ok: false, message: 'customer_id is invalid.' };
  }

  if ((payload.intent === 'ADD_DEBT' || payload.intent === 'PAYMENT' || isBalanceCheck) && !payload.customer_id) {
    return { ok: false, message: 'customer_id is required for debt/payment/balance commands.' };
  }

  return { ok: true };
};

export const checkPermissions = ({ role, intent }) => {
  const normalizedRole = canonicalizeRole(role || 'CASHIER');
  const allowed = ROLE_ACCESS[normalizedRole] || new Set();

  if (!allowed.has(String(intent || '').toUpperCase())) {
    return {
      ok: false,
      message: `${normalizedRole} role is not allowed to execute ${intent}.`,
    };
  }

  return { ok: true };
};

export const buildStructuredPayload = ({
  intentToken,
  customerId,
  amount,
  date,
  confidence,
  note = 'voice_fsm',
} = {}) => {
  return {
    intent: toIntent(intentToken),
    customer_id: customerId ? String(customerId) : null,
    amount: Number(amount || 0),
    date: date || nowIsoDate(),
    confidence: Number(confidence || 0),
    note,
  };
};

export const getOrCreateIdempotencyKey = ({ userId, payload }) => {
  const payloadSignature = stableStringify(payload);
  const signature = `${String(userId || 'anonymous')}:${payloadSignature}`;
  const existing = RECENT_IDEMPOTENCY.get(signature);
  if (existing) {
    return existing;
  }

  const timestamp = Date.now();
  const digest = shortHash(payloadSignature).slice(0, 12);
  const key = `idemp_${String(userId || 'anon')}_${timestamp}_${digest}`;
  RECENT_IDEMPOTENCY.set(signature, key);
  return key;
};

export const checkIdempotency = ({ idempotencyKey }) => {
  const key = String(idempotencyKey || '').trim();
  if (!key) {
    return { ok: false, message: 'idempotency_key is required.' };
  }

  if (key.length > 128) {
    return { ok: false, message: 'idempotency_key exceeds allowed length.' };
  }

  return { ok: true };
};

export const executeCommand = async ({
  role,
  userId,
  accessToken,
  context,
}) => {
  try {
    if (String(context?.status || '').toUpperCase() !== 'CONFIRMED') {
      return {
        status: 'FAILED',
        message: 'Execution is blocked until command is explicitly confirmed.',
        data: { code: 'FSM_CONFIRMATION_REQUIRED' },
        idempotency_key: null,
      };
    }

    if (!context?.pinVerified) {
      return {
        status: 'FAILED',
        message: 'PIN verification required before execution.',
        data: { code: 'PIN_VERIFICATION_REQUIRED' },
        idempotency_key: null,
      };
    }

    const payload = buildStructuredPayload({
      intentToken: context?.intent,
      customerId: context?.customerId,
      amount: context?.amount,
      date: context?.date,
      confidence: context?.confidence,
    });

    const validation = validatePayload(payload);
    if (!validation.ok) {
      return {
        status: 'FAILED',
        message: validation.message,
        data: {},
        idempotency_key: null,
      };
    }

    const permission = checkPermissions({ role, intent: payload.intent });
    if (!permission.ok) {
      return {
        status: 'FAILED',
        message: permission.message,
        data: {},
        idempotency_key: null,
      };
    }

    const safety = evaluateExecutionSafety({ payload, context });
    if (!safety.ok) {
      return {
        status: 'FAILED',
        message: safety.message,
        data: {
          risk_level: safety.riskLevel,
        },
        idempotency_key: null,
      };
    }

    const idempotencyKey = getOrCreateIdempotencyKey({ userId, payload });
    const idempotency = checkIdempotency({ idempotencyKey });
    if (!idempotency.ok) {
      return {
        status: 'FAILED',
        message: idempotency.message,
        data: {},
        idempotency_key: null,
      };
    }

    if (!accessToken) {
      return {
        status: 'FAILED',
        message: 'Authenticated access token is required for secure execution.',
        data: {},
        idempotency_key: idempotencyKey,
      };
    }

    // Lazy load to keep Node-based evaluation free from React Native import chains.
    // eslint-disable-next-line global-require
    const { executeMappedIntentOnline } = require('../backend/commandExecutionApi');

    const data = await executeMappedIntentOnline({
      intent: payload.intent,
      payload,
      accessToken,
      idempotencyKey,
    });

    // Audit log for financial-grade traceability of structured execution path.
    console.info('[voice.execute.success]', {
      user_id: String(userId || ''),
      idempotency_key: idempotencyKey,
      intent: payload.intent,
      amount: payload.amount,
      customer_id: payload.customer_id,
    });

    return {
      status: 'SUCCESS',
      message: 'Command executed successfully.',
      data: {
        payload,
        risk_level: safety.riskLevel,
        result: data,
      },
      idempotency_key: idempotencyKey,
    };
  } catch (error) {
    console.error('[voice.execute.failure]', {
      user_id: String(userId || ''),
      intent: String(context?.intent || ''),
      amount: Number(context?.amount || 0),
      code: error?.code || null,
      status: error?.status || null,
      message: error?.message || 'Execution failed.',
    });

    return {
      status: 'FAILED',
      message: error?.message || 'Execution failed.',
      data: {
        code: error?.code || null,
        status: error?.status || null,
      },
      idempotency_key: null,
    };
  }
};

export default {
  buildStructuredPayload,
  validatePayload,
  checkPermissions,
  checkIdempotency,
  evaluateExecutionSafety,
  executeCommand,
};
