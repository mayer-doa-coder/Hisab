const STATES = Object.freeze({
  WAIT_INTENT: 'WAIT_INTENT',
  WAIT_NAME: 'WAIT_NAME',
  WAIT_AMOUNT: 'WAIT_AMOUNT',
  WAIT_DATE: 'WAIT_DATE',
  REVIEW: 'REVIEW',
  CONFIRM: 'CONFIRM',
  EXECUTE: 'EXECUTE',
});

const STATE_ORDER = Object.freeze([
  STATES.WAIT_INTENT,
  STATES.WAIT_NAME,
  STATES.WAIT_AMOUNT,
  STATES.WAIT_DATE,
  STATES.REVIEW,
  STATES.CONFIRM,
  STATES.EXECUTE,
]);

const INTENT_TOKENS = Object.freeze(['baki', 'joma', 'becha', 'kinbo', 'balance']);
const DATE_SHORTCUTS = Object.freeze(['aj', 'kal']);
const CONFIRM_TOKENS = Object.freeze(['confirm', 'yes', 'na', 'cancel']);
const GLOBAL_CONTROL_TOKENS = Object.freeze(['next', 'back', 'cancel', 'repeat']);
const DEFAULT_TIMEOUT_RETRY_LIMIT = 2;
const DEFAULT_HIGH_RISK_AMOUNT = 50000;

const BANGLA_DIGITS = Object.freeze({
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
});

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const normalizeDigits = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return raw
    .split('')
    .map((char) => (Object.prototype.hasOwnProperty.call(BANGLA_DIGITS, char) ? BANGLA_DIGITS[char] : char))
    .join('');
};

const toIsoDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const parseDateToken = (token, now = new Date()) => {
  const normalized = normalizeToken(token);

  if (!normalized) {
    return { ok: false, reason: 'DATE_REQUIRED' };
  }

  if (normalized === 'aj') {
    return { ok: true, value: toIsoDateOnly(now), confidence: 1 };
  }

  if (normalized === 'kal') {
    const tomorrow = new Date(now.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { ok: true, value: toIsoDateOnly(tomorrow), confidence: 1 };
  }

  const digitNormalized = normalizeDigits(normalized).replace(/\//g, '-');

  if (/^\d{4}-\d{2}-\d{2}$/.test(digitNormalized)) {
    const parsed = new Date(`${digitNormalized}T00:00:00Z`);
    return {
      ok: !Number.isNaN(parsed.getTime()),
      value: !Number.isNaN(parsed.getTime()) ? digitNormalized : null,
      confidence: 0.95,
      reason: Number.isNaN(parsed.getTime()) ? 'DATE_INVALID' : null,
    };
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(digitNormalized)) {
    const [day, month, year] = digitNormalized.split('-');
    const iso = `${year}-${month}-${day}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return {
      ok: !Number.isNaN(parsed.getTime()),
      value: !Number.isNaN(parsed.getTime()) ? iso : null,
      confidence: 0.9,
      reason: Number.isNaN(parsed.getTime()) ? 'DATE_INVALID' : null,
    };
  }

  return { ok: false, reason: 'DATE_UNSUPPORTED' };
};

const parseAmountToken = (token) => {
  const normalized = normalizeDigits(token).replace(/,/g, '').trim();

  if (!normalized) {
    return { ok: false, reason: 'AMOUNT_REQUIRED' };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }

  return { ok: true, value: amount, confidence: 0.99 };
};

const scoreNameMatch = (needle, target) => {
  if (!needle || !target) {
    return 0;
  }

  if (needle === target) {
    return 1;
  }

  if (target.startsWith(needle)) {
    return 0.93;
  }

  if (target.includes(needle)) {
    return 0.88;
  }

  return 0;
};

const findNameMatches = (token, knownNames = []) => {
  const normalizedToken = normalizeToken(token);
  const ranked = [];

  for (const entry of knownNames) {
    const label = normalizeToken(entry?.name || entry?.label || entry);
    if (!label) {
      continue;
    }

    const score = scoreNameMatch(normalizedToken, label);
    if (score <= 0) {
      continue;
    }

    ranked.push({
      id: entry?.id ?? null,
      name: entry?.name || entry?.label || String(entry),
      normalized: label,
      score,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return String(a.name).localeCompare(String(b.name));
  });

  return ranked;
};

const getPromptForState = (state) => {
  if (state === STATES.WAIT_INTENT) {
    return 'কি করবেন? বলুন: বাকি, জমা, বেচা, বা হিসাব।';
  }

  if (state === STATES.WAIT_NAME) {
    return 'নাম বলুন।';
  }

  if (state === STATES.WAIT_AMOUNT) {
    return 'কত টাকা?';
  }

  if (state === STATES.WAIT_DATE) {
    return 'তারিখ বলুন: আজ, কাল, বা YYYY-MM-DD।';
  }

  if (state === STATES.REVIEW) {
    return 'সারাংশ দেখুন। পরের ধাপে যেতে Next বলুন।';
  }

  if (state === STATES.CONFIRM) {
    return 'নিশ্চিত করতে Confirm বলুন।';
  }

  return 'Executing command.';
};

const buildOutputContract = (context = {}) => ({
  intent: context.intent || null,
  name: context.name || null,
  amount: Number.isFinite(Number(context.amount)) ? Number(context.amount) : null,
  date: context.date || null,
  confidence: Number.isFinite(Number(context.confidence)) ? Number(context.confidence) : 0,
  status: context.status || 'READY',
});

const buildInitialContext = () => ({
  intent: null,
  name: null,
  nameId: null,
  amount: null,
  date: null,
  confidence: 1,
  status: 'READY',
  highRisk: false,
  retriesByState: {},
  flowHistory: [STATES.WAIT_INTENT],
  lastPrompt: getPromptForState(STATES.WAIT_INTENT),
  lastError: '',
});

const getPreviousState = (state, history = []) => {
  const usableHistory = Array.isArray(history) ? history.filter(Boolean) : [];
  if (usableHistory.length <= 1) {
    return state;
  }

  return usableHistory[usableHistory.length - 2] || state;
};

const handleAmbiguity = (candidates = []) => {
  const names = (Array.isArray(candidates) ? candidates : []).slice(0, 2).map((item) => String(item.name || item));
  const suffix = names.length >= 2 ? `${names[0]} or ${names[1]}` : names[0] || 'manual selection';

  return {
    requiresSelection: true,
    candidates: names,
    message: `Did you mean ${suffix}?`,
    fallback: 'manual-touch-selection',
  };
};

const handleTimeout = ({ state, retryCount = 0, maxRetries = DEFAULT_TIMEOUT_RETRY_LIMIT } = {}) => {
  const safeRetryCount = Number.isInteger(retryCount) ? retryCount : 0;

  if (safeRetryCount < maxRetries) {
    return {
      cancelled: false,
      nextRetryCount: safeRetryCount + 1,
      message: `No input detected. ${getPromptForState(state)}`,
      status: 'READY',
    };
  }

  return {
    cancelled: true,
    nextRetryCount: safeRetryCount,
    message: 'Voice flow cancelled due to inactivity.',
    status: 'CANCELLED',
  };
};

const handleGlobalControls = ({ token, state, context }) => {
  const normalized = normalizeToken(token);
  if (!GLOBAL_CONTROL_TOKENS.includes(normalized)) {
    return { handled: false };
  }

  if (normalized === 'repeat') {
    return {
      handled: true,
      state,
      context: {
        ...context,
        lastError: '',
      },
      message: context.lastPrompt || getPromptForState(state),
    };
  }

  if (normalized === 'cancel') {
    return {
      handled: true,
      state: STATES.WAIT_INTENT,
      context: {
        ...buildInitialContext(),
        status: 'CANCELLED',
        lastPrompt: getPromptForState(STATES.WAIT_INTENT),
      },
      message: 'Flow cancelled.',
    };
  }

  if (normalized === 'back') {
    const previousState = getPreviousState(state, context.flowHistory);
    const trimmedHistory = [...(context.flowHistory || [])];
    if (trimmedHistory.length > 1) {
      trimmedHistory.pop();
    }

    return {
      handled: true,
      state: previousState,
      context: {
        ...context,
        flowHistory: trimmedHistory,
        status: 'READY',
        lastError: '',
        lastPrompt: getPromptForState(previousState),
      },
      message: getPromptForState(previousState),
    };
  }

  if (normalized === 'next') {
    if (state === STATES.WAIT_DATE) {
      return {
        handled: true,
        state: STATES.REVIEW,
        context: {
          ...context,
          lastError: '',
          flowHistory: [...(context.flowHistory || []), STATES.REVIEW],
          lastPrompt: getPromptForState(STATES.REVIEW),
        },
        message: getPromptForState(STATES.REVIEW),
      };
    }

    if (state === STATES.REVIEW) {
      return {
        handled: true,
        state: STATES.CONFIRM,
        context: {
          ...context,
          lastError: '',
          flowHistory: [...(context.flowHistory || []), STATES.CONFIRM],
          lastPrompt: getPromptForState(STATES.CONFIRM),
        },
        message: getPromptForState(STATES.CONFIRM),
      };
    }

    return {
      handled: true,
      state,
      context: {
        ...context,
        lastError: `Cannot move next from ${state}.`,
      },
      message: `Cannot move next from ${state}.`,
    };
  }

  return { handled: false };
};

const validateToken = ({ state, token, knownNames = [], confidenceThreshold = 0.84, now = new Date() }) => {
  const normalized = normalizeToken(token);

  if (!normalized) {
    return { ok: false, reason: 'EMPTY_TOKEN', message: 'Please repeat input.' };
  }

  if (state === STATES.WAIT_INTENT) {
    if (!INTENT_TOKENS.includes(normalized)) {
      return { ok: false, reason: 'INTENT_INVALID', message: 'Please say: baki, joma, becha, kinbo, or balance.' };
    }

    return { ok: true, value: normalized, confidence: 0.99 };
  }

  if (state === STATES.WAIT_NAME) {
    const matches = findNameMatches(normalized, knownNames);
    if (matches.length === 0) {
      return { ok: false, reason: 'NAME_NOT_FOUND', message: 'Name not found. Please say a valid customer name.' };
    }

    const top = matches[0];
    const second = matches[1] || null;

    if (second && top.score < 0.95 && Math.abs(top.score - second.score) < 0.05) {
      return {
        ok: false,
        reason: 'AMBIGUOUS_NAME',
        ambiguity: handleAmbiguity([top, second]),
      };
    }

    if (top.score < confidenceThreshold) {
      return {
        ok: false,
        reason: 'LOW_CONFIDENCE_NAME',
        ambiguity: handleAmbiguity([top, ...(second ? [second] : [])]),
      };
    }

    return {
      ok: true,
      value: {
        id: top.id,
        name: top.name,
      },
      confidence: top.score,
    };
  }

  if (state === STATES.WAIT_AMOUNT) {
    const amount = parseAmountToken(normalized);
    if (!amount.ok) {
      return { ok: false, reason: amount.reason, message: 'Please say amount.' };
    }

    return { ok: true, value: amount.value, confidence: amount.confidence };
  }

  if (state === STATES.WAIT_DATE) {
    const date = parseDateToken(normalized, now);
    if (!date.ok) {
      return { ok: false, reason: date.reason, message: 'Please say: aj, kal, or a valid date.' };
    }

    return { ok: true, value: date.value, confidence: date.confidence };
  }

  if (state === STATES.REVIEW) {
    return {
      ok: false,
      reason: 'REVIEW_NO_TOKEN',
      message: 'Review state accepts only global controls. Say next/back/repeat/cancel.',
    };
  }

  if (state === STATES.CONFIRM) {
    if (!CONFIRM_TOKENS.includes(normalized)) {
      return { ok: false, reason: 'CONFIRM_INVALID', message: 'Please say confirm, yes, na, or cancel.' };
    }

    return { ok: true, value: normalized, confidence: 1 };
  }

  return { ok: false, reason: 'STATE_UNSUPPORTED', message: 'Unsupported state token.' };
};

const mergeConfidence = (existing, incoming) => {
  const left = Number.isFinite(Number(existing)) ? Number(existing) : 1;
  const right = Number.isFinite(Number(incoming)) ? Number(incoming) : 1;
  return Math.min(left, right);
};

const withNextStateContext = (context, nextState) => ({
  ...context,
  lastError: '',
  lastPrompt: getPromptForState(nextState),
  flowHistory: [...(context.flowHistory || []), nextState],
  retriesByState: {
    ...(context.retriesByState || {}),
    [nextState]: 0,
  },
});

const transition = ({
  state,
  token,
  context,
  knownNames = [],
  confidenceThreshold = 0.84,
  amountHighRiskThreshold = DEFAULT_HIGH_RISK_AMOUNT,
  now = new Date(),
}) => {
  const activeState = state || STATES.WAIT_INTENT;
  const activeContext = context ? { ...buildInitialContext(), ...context } : buildInitialContext();

  const global = handleGlobalControls({ token, state: activeState, context: activeContext });
  if (global.handled) {
    return {
      state: global.state,
      context: global.context,
      message: global.message,
      output: buildOutputContract(global.context),
      ambiguity: null,
    };
  }

  const validation = validateToken({
    state: activeState,
    token,
    knownNames,
    confidenceThreshold,
    now,
  });

  if (!validation.ok) {
    const nextContext = {
      ...activeContext,
      lastError: validation.message || validation.reason,
      lastPrompt: validation.message || getPromptForState(activeState),
    };

    return {
      state: activeState,
      context: nextContext,
      message: validation.message || 'Invalid token.',
      output: buildOutputContract(nextContext),
      ambiguity: validation.ambiguity || null,
    };
  }

  if (activeState === STATES.WAIT_INTENT) {
    const nextContext = withNextStateContext(
      {
        ...activeContext,
        intent: validation.value,
        status: 'READY',
        confidence: mergeConfidence(activeContext.confidence, validation.confidence),
      },
      STATES.WAIT_NAME
    );

    return {
      state: STATES.WAIT_NAME,
      context: nextContext,
      message: nextContext.lastPrompt,
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_NAME) {
    // CHECK_BALANCE has no amount or date — jump straight to REVIEW.
    const nextState = activeContext.intent === 'balance' ? STATES.REVIEW : STATES.WAIT_AMOUNT;
    const nextContext = withNextStateContext(
      {
        ...activeContext,
        name: validation.value.name,
        nameId: validation.value.id,
        confidence: mergeConfidence(activeContext.confidence, validation.confidence),
      },
      nextState
    );

    return {
      state: nextState,
      context: nextContext,
      message: nextContext.lastPrompt,
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_AMOUNT) {
    const isHighRisk = Number(validation.value) >= Number(amountHighRiskThreshold || DEFAULT_HIGH_RISK_AMOUNT);
    const nextContext = withNextStateContext(
      {
        ...activeContext,
        amount: validation.value,
        highRisk: Boolean(activeContext.intent === 'becha' || activeContext.intent === 'kinbo' || isHighRisk),
        confidence: mergeConfidence(activeContext.confidence, validation.confidence),
      },
      STATES.WAIT_DATE
    );

    return {
      state: STATES.WAIT_DATE,
      context: nextContext,
      message: nextContext.lastPrompt,
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_DATE) {
    const nextContext = withNextStateContext(
      {
        ...activeContext,
        date: validation.value,
        confidence: mergeConfidence(activeContext.confidence, validation.confidence),
      },
      STATES.REVIEW
    );

    return {
      state: STATES.REVIEW,
      context: nextContext,
      message: nextContext.lastPrompt,
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.CONFIRM) {
    const confirmationToken = validation.value;

    if (confirmationToken === 'na' || confirmationToken === 'cancel') {
      const cancelledContext = {
        ...activeContext,
        status: 'CANCELLED',
        lastPrompt: getPromptForState(STATES.WAIT_INTENT),
      };

      return {
        state: STATES.WAIT_INTENT,
        context: cancelledContext,
        message: 'Command cancelled.',
        output: buildOutputContract(cancelledContext),
        ambiguity: null,
      };
    }

    if (activeContext.highRisk && confirmationToken !== 'confirm') {
      const nextContext = {
        ...activeContext,
        lastError: 'High-risk action requires explicit confirm token.',
        lastPrompt: 'High-risk action. Please say confirm to execute.',
      };

      return {
        state: STATES.CONFIRM,
        context: nextContext,
        message: nextContext.lastPrompt,
        output: buildOutputContract(nextContext),
        ambiguity: null,
      };
    }

    const confirmedContext = withNextStateContext(
      {
        ...activeContext,
        status: 'CONFIRMED',
      },
      STATES.EXECUTE
    );

    return {
      state: STATES.EXECUTE,
      context: confirmedContext,
      message: confirmedContext.lastPrompt,
      output: buildOutputContract(confirmedContext),
      ambiguity: null,
    };
  }

  return {
    state: activeState,
    context: activeContext,
    message: getPromptForState(activeState),
    output: buildOutputContract(activeContext),
    ambiguity: null,
  };
};

export {
  STATES,
  STATE_ORDER,
  INTENT_TOKENS,
  DATE_SHORTCUTS,
  CONFIRM_TOKENS,
  GLOBAL_CONTROL_TOKENS,
  DEFAULT_TIMEOUT_RETRY_LIMIT,
  DEFAULT_HIGH_RISK_AMOUNT,
  buildInitialContext,
  buildOutputContract,
  getPromptForState,
  normalizeToken,
  normalizeDigits,
  parseAmountToken,
  parseDateToken,
  validateToken,
  handleGlobalControls,
  handleAmbiguity,
  handleTimeout,
  transition,
};
