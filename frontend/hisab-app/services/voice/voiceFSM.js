const STATES = Object.freeze({
  WAIT_INTENT: 'WAIT_INTENT',
  WAIT_NAME: 'WAIT_NAME',
  WAIT_CUSTOMER_SELECTION: 'WAIT_CUSTOMER_SELECTION',
  WAIT_AMOUNT: 'WAIT_AMOUNT',
  WAIT_DATE: 'WAIT_DATE',
  REVIEW: 'REVIEW',
  CONFIRM: 'CONFIRM',
  WAIT_PIN: 'WAIT_PIN',
  EXECUTE: 'EXECUTE',
  // identity-conflict resolution sub-flow
  WAIT_CONFLICT_RESOLVE:    'WAIT_CONFLICT_RESOLVE',
  // unknown-customer registration sub-flow
  WAIT_CREATE_CONFIRM:      'WAIT_CREATE_CONFIRM',
  WAIT_NEW_CUSTOMER_NAME:   'WAIT_NEW_CUSTOMER_NAME',
  WAIT_NEW_CUSTOMER_PHONE:  'WAIT_NEW_CUSTOMER_PHONE',
  WAIT_OTP:                 'WAIT_OTP',
  WAIT_NEW_PIN:             'WAIT_NEW_PIN',
  WAIT_NEW_PIN_CONFIRM:     'WAIT_NEW_PIN_CONFIRM',
});

const STATE_ORDER = Object.freeze([
  STATES.WAIT_INTENT,
  STATES.WAIT_NAME,
  STATES.WAIT_CUSTOMER_SELECTION,
  STATES.WAIT_AMOUNT,
  STATES.WAIT_DATE,
  STATES.REVIEW,
  STATES.CONFIRM,
  STATES.WAIT_PIN,
  STATES.EXECUTE,
]);

const INTENT_TOKENS = Object.freeze(['baki', 'joma', 'becha', 'kinbo', 'balance']);
const DATE_SHORTCUTS = Object.freeze(['aj', 'kal']);
const CONFIRM_TOKENS = Object.freeze(['confirm', 'yes', 'na', 'cancel']);
const GLOBAL_CONTROL_TOKENS = Object.freeze(['next', 'back', 'cancel', 'repeat']);
const DEFAULT_TIMEOUT_RETRY_LIMIT = 2;
const DEFAULT_HIGH_RISK_AMOUNT = 50000;

// After this many failed attempts on a single state the FSM signals the UI
// to switch to touch input instead of asking the user to speak again.
const MAX_RETRIES_BEFORE_TOUCH = 2;

// Minimum confidence required to accept a token in each state.
// Deliberately more lenient than the execution gate so the FSM can accept
// slightly-noisy input that is still clearly correct.
const CONFIDENCE_THRESHOLDS_BY_STATE = Object.freeze({
  WAIT_INTENT:              0.80,
  WAIT_NAME:                0.84,
  WAIT_CUSTOMER_SELECTION:  0.99,
  WAIT_AMOUNT:              0.88,
  WAIT_DATE:                0.80,
  CONFIRM:                  0.95,
  WAIT_PIN:                 1.00,
  WAIT_CONFLICT_RESOLVE:    0.95,
  WAIT_CREATE_CONFIRM:      0.95,
  WAIT_NEW_CUSTOMER_NAME:   0.84,
  WAIT_NEW_CUSTOMER_PHONE:  1.00,
  WAIT_OTP:                 1.00,
  WAIT_NEW_PIN:             1.00,
  WAIT_NEW_PIN_CONFIRM:     1.00,
});

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

// Produces a Bengali yes/no confirmation prompt so users can hear what the
// system understood before being forced to re-speak.
// e.g.  "আপনি কি রহিম বলেছিলেন?"
const buildConfirmationPrompt = ({ state, value, candidates = [] } = {}) => {
  const names = (Array.isArray(candidates) ? candidates : []).slice(0, 2).map(String);

  if (state === STATES.WAIT_NAME) {
    if (names.length >= 2) {
      return `আপনি কি "${names[0]}" না "${names[1]}" বলেছিলেন?`;
    }
    if (value) return `আপনি কি "${value}" বলেছিলেন?`;
    return 'নামটি আরও স্পষ্ট করে বলুন।';
  }

  if (state === STATES.WAIT_AMOUNT && value !== undefined && value !== null) {
    return `আপনি কি ${value} টাকা বলেছিলেন?`;
  }

  if (state === STATES.WAIT_INTENT && value) {
    const INTENT_LABELS_BN = { baki: 'বাকি', joma: 'জমা', becha: 'বেচা', kinbo: 'কিনবো', balance: 'হিসাব' };
    return `আপনি কি "${INTENT_LABELS_BN[value] || value}" বলেছিলেন?`;
  }

  if (state === STATES.WAIT_DATE && value) {
    return `আপনি কি "${value}" তারিখ বলেছিলেন?`;
  }

  return 'আমি ঠিকমতো শুনতে পাইনি। আবার বলুন।';
};

// Minimum confidence to advance from CONFIRM to WAIT_PIN.
// High-risk transactions require a stricter threshold.
const CONFIRM_MIN_CONFIDENCE      = 0.80;
const HIGH_RISK_CONFIRM_MIN_CONFIDENCE = 0.90;

const INTENT_ACTION_BN = Object.freeze({
  baki:    (name, amount) => `${name}কে ${amount} টাকা বাকি দেওয়া হবে`,
  joma:    (name, amount) => `${name} থেকে ${amount} টাকা জমা নেওয়া হবে`,
  becha:   (name, amount) => `${name}কে ${amount} টাকার পণ্য বিক্রয় করা হবে`,
  kinbo:   (name, amount) => `${name} থেকে ${amount} টাকার পণ্য কেনা হবে`,
  balance: (name)         => `${name}-এর হিসাব দেখা হবে`,
});

// Builds the spoken confirmation sentence shown at the CONFIRM state.
// e.g. "রহিমকে ৫০ টাকা বাকি দেওয়া হবে, ঠিক আছে?"
const buildConfirmSummary = (context = {}) => {
  const intent = String(context.intent || '').toLowerCase();
  const name   = context.name   || 'গ্রাহক';
  const amount = context.amount ?? 0;

  const builder = INTENT_ACTION_BN[intent];
  const action  = builder ? builder(name, amount) : `${intent} করা হবে`;

  const riskTag = context.highRisk ? ' ⚠ উচ্চ ঝুঁকি।' : '';
  return `${action}, ঠিক আছে?${riskTag} নিশ্চিত করতে "confirm" বলুন।`;
};

// Ensures all slots required for the current intent are filled before the
// flow advances from REVIEW to CONFIRM.  Called by handleGlobalControls
// when the user says "next" in REVIEW state.
const validateSlotCompleteness = (context) => {
  const intent = context?.intent;

  if (!intent) {
    return { ok: false, missingSlot: 'intent', message: 'কোন কাজ করবেন তা বলুন।' };
  }

  if (!context?.name) {
    return { ok: false, missingSlot: 'name', message: 'নাম এখনও নেওয়া হয়নি।' };
  }

  // CHECK_BALANCE does not require amount or date
  if (intent === 'balance') {
    return { ok: true };
  }

  if (context?.amount === null || context?.amount === undefined || Number(context.amount) <= 0) {
    return { ok: false, missingSlot: 'amount', message: 'টাকার পরিমাণ এখনও নেওয়া হয়নি।' };
  }

  return { ok: true };
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

  if (state === STATES.WAIT_CUSTOMER_SELECTION) {
    return 'কোন গ্রাহক? এক বা দুই বলুন।';
  }

  if (state === STATES.WAIT_PIN) {
    return 'পিন বলুন।';
  }

  if (state === STATES.WAIT_CONFLICT_RESOLVE) {
    return 'পরিচয় দ্বন্দ্ব পাওয়া গেছে। হ্যাঁ বললে পুরানো পরিচয় ব্যবহার হবে, না বললে শুধু এই দোকানে রাখা হবে।';
  }

  if (state === STATES.WAIT_CREATE_CONFIRM) {
    return 'এই নামে কোনো গ্রাহক নেই। নতুন গ্রাহক তৈরি করবেন? হ্যাঁ বা না বলুন।';
  }

  if (state === STATES.WAIT_NEW_CUSTOMER_NAME) {
    return 'গ্রাহকের নাম বলুন।';
  }

  if (state === STATES.WAIT_NEW_CUSTOMER_PHONE) {
    return 'গ্রাহকের ফোন নম্বর বলুন।';
  }

  if (state === STATES.WAIT_OTP) {
    return 'ফোনে পাঠানো OTP কোড বলুন।';
  }

  if (state === STATES.WAIT_NEW_PIN) {
    return 'নতুন পিন বলুন। ৪ থেকে ৬ সংখ্যার।';
  }

  if (state === STATES.WAIT_NEW_PIN_CONFIRM) {
    return 'পিনটি আবার বলুন নিশ্চিত করতে।';
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
  nameCandidates: null,
  amount: null,
  date: null,
  confidence: 1,
  status: 'READY',
  highRisk: false,
  pinVerified: false,
  retriesByState: {},
  flowHistory: [STATES.WAIT_INTENT],
  lastPrompt: getPromptForState(STATES.WAIT_INTENT),
  lastError: '',
  // unknown-customer sub-flow scratch pad; null when not in registration
  newCustomer: null,
  // active identity conflict; null when no conflict is pending
  conflict: null,
});

const getPreviousState = (state, history = []) => {
  const usableHistory = Array.isArray(history) ? history.filter(Boolean) : [];
  if (usableHistory.length <= 1) {
    return state;
  }

  return usableHistory[usableHistory.length - 2] || state;
};

const handleAmbiguity = (candidates = []) => {
  const full = (Array.isArray(candidates) ? candidates : []).slice(0, 2);
  const names = full.map((item) => String(item.name || item));
  const suffix = names.length >= 2 ? `${names[0]} or ${names[1]}` : names[0] || 'manual selection';

  return {
    requiresSelection: true,
    candidates: names,
    fullCandidates: full, // {id, name, score} — used by WAIT_CUSTOMER_SELECTION to resolve selection
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
    // PIN entry is a security gate — navigating back would let callers skip it.
    if (state === STATES.WAIT_PIN) {
      return {
        handled: true,
        state: STATES.WAIT_PIN,
        context: {
          ...context,
          lastError: 'PIN_BACK_BLOCKED',
          lastPrompt: getPromptForState(STATES.WAIT_PIN),
        },
        message: 'পিন না দিয়ে পেছানো যাবে না। বাতিল করতে cancel বলুন।',
      };
    }

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
      // Prevent advancing to CONFIRM if any required slot is still empty —
      // guards against edge cases where the user navigated back and skipped a step.
      const slotCheck = validateSlotCompleteness(context);
      if (!slotCheck.ok) {
        return {
          handled: true,
          state,
          context: {
            ...context,
            lastError: slotCheck.message,
            lastPrompt: slotCheck.message,
          },
          message: slotCheck.message,
        };
      }

      const confirmSummary = buildConfirmSummary(context);
      return {
        handled: true,
        state: STATES.CONFIRM,
        context: {
          ...context,
          lastError: '',
          flowHistory: [...(context.flowHistory || []), STATES.CONFIRM],
          lastPrompt: confirmSummary,
        },
        message: confirmSummary,
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

  if (state === STATES.WAIT_CONFLICT_RESOLVE) {
    const YES_TOKENS      = ['ha', 'হ্যাঁ', 'হা', 'yes', 'হ্যা', 'link', 'same', 'এক'];
    const NO_TOKENS       = ['na', 'না', 'no', 'keep_local', 'আলাদা', 'different'];
    const DIGIT_MAP = {
      '1': 0, '১': 0, 'এক': 0, 'প্রথম': 0, 'first': 0, 'one': 0,
      '2': 1, '২': 1, 'দুই': 1, 'দ্বিতীয়': 1, 'second': 1, 'two': 1,
      '3': 2, '৩': 2, 'তিন': 2, 'তৃতীয়': 2, 'third': 2, 'three': 2,
    };
    const digitNorm = normalizeDigits(normalized);
    if (Object.prototype.hasOwnProperty.call(DIGIT_MAP, digitNorm)) {
      return { ok: true, value: { answer: 'select', index: DIGIT_MAP[digitNorm] }, confidence: 1 };
    }
    if (Object.prototype.hasOwnProperty.call(DIGIT_MAP, normalized)) {
      return { ok: true, value: { answer: 'select', index: DIGIT_MAP[normalized] }, confidence: 1 };
    }
    if (YES_TOKENS.includes(normalized)) return { ok: true, value: { answer: 'link' },       confidence: 1 };
    if (NO_TOKENS.includes(normalized))  return { ok: true, value: { answer: 'keep_local' }, confidence: 1 };
    return { ok: false, reason: 'CONFLICT_RESOLVE_INVALID', message: 'হ্যাঁ, না, এক, বা দুই বলুন।' };
  }

  if (state === STATES.WAIT_CREATE_CONFIRM) {
    const YES_TOKENS = ['ha', 'hа', 'হ্যাঁ', 'হা', 'yes', 'হ্যা'];
    const NO_TOKENS  = ['na', 'না', 'no', 'cancel'];
    if (YES_TOKENS.includes(normalized)) return { ok: true, value: 'yes', confidence: 1 };
    if (NO_TOKENS.includes(normalized))  return { ok: true, value: 'no',  confidence: 1 };
    return { ok: false, reason: 'CREATE_CONFIRM_INVALID', message: 'হ্যাঁ বা না বলুন।' };
  }

  if (state === STATES.WAIT_NEW_CUSTOMER_NAME) {
    if (!normalized || normalized.length < 2) {
      return { ok: false, reason: 'NEW_NAME_TOO_SHORT', message: 'নামটি স্পষ্ট করে বলুন।' };
    }
    return { ok: true, value: normalized, confidence: 0.90 };
  }

  if (state === STATES.WAIT_NEW_CUSTOMER_PHONE) {
    const digits = normalizeDigits(normalized).replace(/[\s\-]/g, '');
    let e164 = null;
    if (/^01[3-9]\d{8}$/.test(digits)) {
      e164 = `+880${digits}`;
    } else if (/^\+8801[3-9]\d{8}$/.test(normalized.replace(/\s/g, ''))) {
      e164 = normalized.replace(/\s/g, '');
    } else if (/^8801[3-9]\d{8}$/.test(digits)) {
      e164 = `+${digits}`;
    }
    if (!e164) {
      return { ok: false, reason: 'PHONE_INVALID', message: 'সঠিক ফোন নম্বর বলুন। যেমন: ০১৭XXXXXXXX।' };
    }
    return { ok: true, value: e164, confidence: 1 };
  }

  if (state === STATES.WAIT_OTP) {
    const digits = normalizeDigits(normalized).replace(/\s/g, '');
    if (!/^\d{4,6}$/.test(digits)) {
      return { ok: false, reason: 'OTP_FORMAT_INVALID', message: 'OTP কোডটি সঠিক নয়। আবার বলুন।' };
    }
    return { ok: true, value: digits, confidence: 1 };
  }

  if (state === STATES.WAIT_NEW_PIN) {
    const digits = normalizeDigits(normalized).replace(/\s/g, '');
    if (!/^\d{4,6}$/.test(digits)) {
      return { ok: false, reason: 'PIN_FORMAT_INVALID', message: 'পিন ৪ থেকে ৬ সংখ্যার হতে হবে।' };
    }
    return { ok: true, value: digits, confidence: 1 };
  }

  if (state === STATES.WAIT_NEW_PIN_CONFIRM) {
    const digits = normalizeDigits(normalized).replace(/\s/g, '');
    if (!/^\d{4,6}$/.test(digits)) {
      return { ok: false, reason: 'PIN_FORMAT_INVALID', message: 'পিন ৪ থেকে ৬ সংখ্যার হতে হবে।' };
    }
    return { ok: true, value: digits, confidence: 1 };
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

  if (state === STATES.WAIT_CUSTOMER_SELECTION) {
    const SELECTION_MAP = {
      '1': 0, '১': 0, 'এক': 0, 'প্রথম': 0, 'first': 0, 'one': 0,
      '2': 1, '২': 1, 'দুই': 1, 'দ্বিতীয়': 1, 'second': 1, 'two': 1,
    };
    const digitNorm = normalizeDigits(normalized);
    const index = Object.prototype.hasOwnProperty.call(SELECTION_MAP, digitNorm)
      ? SELECTION_MAP[digitNorm]
      : Object.prototype.hasOwnProperty.call(SELECTION_MAP, normalized)
        ? SELECTION_MAP[normalized]
        : -1;

    if (index === -1) {
      return { ok: false, reason: 'SELECTION_INVALID', message: 'এক বা দুই বলুন।' };
    }

    return { ok: true, value: index, confidence: 1 };
  }

  if (state === STATES.WAIT_PIN) {
    const digits = normalizeDigits(normalized).replace(/\s/g, '');
    if (!/^\d{4,6}$/.test(digits)) {
      return { ok: false, reason: 'PIN_FORMAT_INVALID', message: 'পিন সঠিক নয়। আবার বলুন।' };
    }
    // value carries the raw digits for caller-side bcrypt verification; never echoed in prompts
    return { ok: true, value: digits, confidence: 1 };
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
    // Reset the counter for the new state; the current state's counter is kept
    // for analytics (it reflects how many retries the user needed).
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
  pinVerifyResult = null,
  otpVerifyResult = null,
  identityCreateResult = null,
  // optional: array of { global_id, name, score } from a server-side global name search.
  // when provided, a near-tie triggers WAIT_CONFLICT_RESOLVE instead of silently picking the top hit.
  globalNameCandidates = null,
  // result after shopkeeper resolves a conflict in WAIT_CONFLICT_RESOLVE
  conflictResolveResult = null,
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
    // No match at all → offer to create a new customer instead of looping on error.
    if (activeState === STATES.WAIT_NAME && validation.reason === 'NAME_NOT_FOUND') {
      const createContext = withNextStateContext(
        { ...activeContext, newCustomer: { spokenName: token } },
        STATES.WAIT_CREATE_CONFIRM
      );
      return {
        state: STATES.WAIT_CREATE_CONFIRM,
        context: createContext,
        message: getPromptForState(STATES.WAIT_CREATE_CONFIRM),
        output: buildOutputContract(createContext),
        ambiguity: null,
      };
    }

    // Ambiguous or low-confidence name match → enter explicit selection state.
    if (
      activeState === STATES.WAIT_NAME &&
      (validation.reason === 'AMBIGUOUS_NAME' || validation.reason === 'LOW_CONFIDENCE_NAME')
    ) {
      const fullCandidates = validation.ambiguity?.fullCandidates || [];
      const displayNames = fullCandidates.map((c) => String(c.name || c)).slice(0, 2);
      const selectionPrompt = displayNames.length >= 2
        ? `"${displayNames[0]}" না "${displayNames[1]}"? এক বা দুই বলুন।`
        : getPromptForState(STATES.WAIT_CUSTOMER_SELECTION);
      const selectionContext = withNextStateContext(
        { ...activeContext, nameCandidates: fullCandidates },
        STATES.WAIT_CUSTOMER_SELECTION
      );
      return {
        state: STATES.WAIT_CUSTOMER_SELECTION,
        context: { ...selectionContext, lastPrompt: selectionPrompt },
        message: selectionPrompt,
        output: buildOutputContract(selectionContext),
        ambiguity: validation.ambiguity || null,
      };
    }

    // Increment the per-state retry counter so callers and the touch-escalation
    // gate below can see how many attempts have been made without success.
    const prevRetries = Number((activeContext.retriesByState || {})[activeState] || 0);
    const nextRetries = prevRetries + 1;

    // Choose between a generic error message and a Bengali confirmation prompt.
    // For low-confidence or ambiguous name results we prefer the confirmation
    // form ("আপনি কি রহিম বলেছিলেন?") so the user can simply say "yes" or "no".
    const ambigCandidates = (validation.ambiguity?.candidates || []).map((c) => String(c.name || c));
    const isLowConfidenceOrAmbiguous = (
      validation.reason === 'LOW_CONFIDENCE_NAME'
      || validation.reason === 'AMBIGUOUS_NAME'
    );
    const userMessage = isLowConfidenceOrAmbiguous
      ? buildConfirmationPrompt({ state: activeState, value: ambigCandidates[0], candidates: ambigCandidates })
      : (validation.message || getPromptForState(activeState));

    const nextContext = {
      ...activeContext,
      lastError: validation.message || validation.reason,
      lastPrompt: userMessage,
      retriesByState: {
        ...(activeContext.retriesByState || {}),
        [activeState]: nextRetries,
      },
    };

    // Once the user has hit MAX_RETRIES_BEFORE_TOUCH on a single state include
    // a touchEscalation payload so the UI can switch to touch input without
    // waiting for another failed voice attempt.
    const touchEscalation = nextRetries >= MAX_RETRIES_BEFORE_TOUCH
      ? {
        state:      activeState,
        retryCount: nextRetries,
        reason:     validation.reason,
        candidates: ambigCandidates,
      }
      : null;

    return {
      state:          activeState,
      context:        nextContext,
      message:        userMessage,
      output:         buildOutputContract(nextContext),
      ambiguity:      validation.ambiguity || null,
      touchEscalation,
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
    // If caller supplied global-registry candidates that are ambiguous (NAME_MULTIPLE_GLOBAL),
    // we must ask the shopkeeper before proceeding — never auto-select.
    if (Array.isArray(globalNameCandidates) && globalNameCandidates.length >= 2) {
      const top    = globalNameCandidates[0];
      const second = globalNameCandidates[1];
      const delta  = Math.abs((top?.score || 0) - (second?.score || 0));
      if (delta <= 0.07) {
        const conflictData = {
          type: 'NAME_MULTIPLE_GLOBAL',
          data: {
            spokenName: token,
            candidates: globalNameCandidates.slice(0, 3).map((c) => ({
              global_id: c.global_id,
              name:      c.name,
              score:     Number((c.score || 0).toFixed(3)),
              phone:     c.phone ?? null,
            })),
          },
        };
        const names = conflictData.data.candidates.slice(0, 2).map((c, i) => `${i + 1}. ${c.name}`).join(', ');
        const conflictPrompt = `এই নামে একাধিক পরিচয় পাওয়া গেছে: ${names}। এক বা দুই বলুন, বা "আলাদা" বলুন।`;
        const conflictContext = withNextStateContext(
          { ...activeContext, conflict: { ...conflictData, prompt: conflictPrompt } },
          STATES.WAIT_CONFLICT_RESOLVE
        );
        return {
          state: STATES.WAIT_CONFLICT_RESOLVE,
          context: { ...conflictContext, lastPrompt: conflictPrompt },
          message: conflictPrompt,
          output: buildOutputContract(conflictContext),
          ambiguity: null,
        };
      }
    }

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

  if (activeState === STATES.WAIT_CUSTOMER_SELECTION) {
    const candidates = Array.isArray(activeContext.nameCandidates) ? activeContext.nameCandidates : [];
    const selected = candidates[validation.value];
    if (!selected) {
      return {
        state: STATES.WAIT_CUSTOMER_SELECTION,
        context: {
          ...activeContext,
          lastError: 'SELECTION_OUT_OF_RANGE',
          lastPrompt: getPromptForState(STATES.WAIT_CUSTOMER_SELECTION),
        },
        message: getPromptForState(STATES.WAIT_CUSTOMER_SELECTION),
        output: buildOutputContract(activeContext),
        ambiguity: null,
      };
    }

    const nextState = activeContext.intent === 'balance' ? STATES.REVIEW : STATES.WAIT_AMOUNT;
    const nextContext = withNextStateContext(
      {
        ...activeContext,
        name: selected.name,
        nameId: selected.id,
        nameCandidates: null,
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
      const summary = buildConfirmSummary(activeContext);
      const nextContext = {
        ...activeContext,
        lastError: 'HIGH_RISK_CONFIRM_REQUIRED',
        lastPrompt: `উচ্চ ঝুঁকির কাজ। নিশ্চিত করতে স্পষ্টভাবে "confirm" বলুন। ${summary}`,
      };

      return {
        state: STATES.CONFIRM,
        context: nextContext,
        message: nextContext.lastPrompt,
        output: buildOutputContract(nextContext),
        ambiguity: null,
      };
    }

    // Doubt block: if accumulated confidence is below the threshold the FSM
    // refuses to advance to PIN entry and asks the shopkeeper to review again.
    // This prevents low-confidence voice errors from committing financial records.
    const minConf = activeContext.highRisk
      ? HIGH_RISK_CONFIRM_MIN_CONFIDENCE
      : CONFIRM_MIN_CONFIDENCE;

    if (Number(activeContext.confidence || 0) < minConf) {
      const summary = buildConfirmSummary(activeContext);
      const doubtContext = {
        ...activeContext,
        lastError: 'CONFIDENCE_TOO_LOW',
        lastPrompt: `আমি নিশ্চিত নই (${Math.round(Number(activeContext.confidence) * 100)}%)। আবার যাচাই করুন। ${summary}`,
      };
      return {
        state: STATES.CONFIRM,
        context: doubtContext,
        message: doubtContext.lastPrompt,
        output: buildOutputContract(doubtContext),
        ambiguity: null,
        doubtBlock: true,
        confidence: activeContext.confidence,
        minRequired: minConf,
      };
    }

    const pinContext = withNextStateContext(
      { ...activeContext, status: 'CONFIRMED' },
      STATES.WAIT_PIN
    );

    return {
      state: STATES.WAIT_PIN,
      context: pinContext,
      message: pinContext.lastPrompt,
      output: buildOutputContract(pinContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_PIN) {
    // Caller must verify the PIN externally (bcrypt) and pass the result back.
    if (!pinVerifyResult) {
      return {
        state: STATES.WAIT_PIN,
        context: { ...activeContext, status: 'PENDING_PIN_VERIFY' },
        message: getPromptForState(STATES.WAIT_PIN),
        output: buildOutputContract({ ...activeContext, status: 'PENDING_PIN_VERIFY' }),
        ambiguity: null,
        pendingPinVerify: true,
        pinToken: validation.value, // raw digits for caller to verify; never log or display
      };
    }

    if (!pinVerifyResult.ok) {
      // Wrong PIN — abort immediately, no retries (no guessing rule).
      const abortContext = {
        ...buildInitialContext(),
        status: 'CANCELLED',
        lastError: 'PIN_INCORRECT',
        lastPrompt: getPromptForState(STATES.WAIT_INTENT),
      };
      return {
        state: STATES.WAIT_INTENT,
        context: abortContext,
        message: 'পিন সঠিক নয়। লেনদেন বাতিল।',
        output: buildOutputContract(abortContext),
        ambiguity: null,
      };
    }

    const executingContext = withNextStateContext(
      { ...activeContext, pinVerified: true, status: 'CONFIRMED' },
      STATES.EXECUTE
    );

    return {
      state: STATES.EXECUTE,
      context: executingContext,
      message: executingContext.lastPrompt,
      output: buildOutputContract(executingContext),
      ambiguity: null,
    };
  }

  // ── Identity-conflict resolution sub-flow ──────────────────────────────────

  if (activeState === STATES.WAIT_CONFLICT_RESOLVE) {
    const { answer, index } = validation.value || {};
    const conflict = activeContext.conflict || {};

    // Caller must resolve the conflict externally and pass conflictResolveResult back.
    if (!conflictResolveResult) {
      const voiceAnswer = answer === 'link' ? 'link'
        : answer === 'keep_local' ? 'keep_local'
        : answer === 'select'     ? index
        : null;

      return {
        state: STATES.WAIT_CONFLICT_RESOLVE,
        context: { ...activeContext, status: 'PENDING_CONFLICT_RESOLVE' },
        message: getPromptForState(STATES.WAIT_CONFLICT_RESOLVE),
        output: buildOutputContract({ ...activeContext, status: 'PENDING_CONFLICT_RESOLVE' }),
        ambiguity: null,
        pendingConflictResolve: true,
        conflictType:  conflict.type   || null,
        voiceAnswer,
        conflictData:  conflict.data   || null,
      };
    }

    if (!conflictResolveResult.ok) {
      const failContext = {
        ...activeContext,
        lastError: 'CONFLICT_RESOLVE_FAILED',
        lastPrompt: 'সমস্যা সমাধান করা সম্ভব হয়নি। আবার চেষ্টা করুন।',
      };
      return {
        state: STATES.WAIT_CONFLICT_RESOLVE,
        context: failContext,
        message: failContext.lastPrompt,
        output: buildOutputContract(failContext),
        ambiguity: null,
      };
    }

    // Resolution accepted — clear conflict, resume original intent flow.
    const resumeState = activeContext.intent === 'balance' ? STATES.REVIEW : STATES.WAIT_AMOUNT;
    const resumeContext = withNextStateContext(
      {
        ...activeContext,
        name:        conflictResolveResult.name       || activeContext.newCustomer?.name || activeContext.name,
        nameId:      conflictResolveResult.customerId || activeContext.nameId,
        conflict:    null,
        newCustomer: null,
        status:      'READY',
      },
      resumeState
    );
    return {
      state:   resumeState,
      context: resumeContext,
      message: resumeContext.lastPrompt,
      output:  buildOutputContract(resumeContext),
      ambiguity: null,
    };
  }

  // ── Unknown-customer registration sub-flow ─────────────────────────────────

  if (activeState === STATES.WAIT_CREATE_CONFIRM) {
    if (validation.value === 'no') {
      // User declined — go back to WAIT_NAME so they can try a different name.
      const backContext = withNextStateContext(
        { ...activeContext, newCustomer: null },
        STATES.WAIT_NAME
      );
      return {
        state: STATES.WAIT_NAME,
        context: backContext,
        message: getPromptForState(STATES.WAIT_NAME),
        output: buildOutputContract(backContext),
        ambiguity: null,
      };
    }

    // User said yes — enter name collection.
    const nextContext = withNextStateContext(activeContext, STATES.WAIT_NEW_CUSTOMER_NAME);
    return {
      state: STATES.WAIT_NEW_CUSTOMER_NAME,
      context: nextContext,
      message: getPromptForState(STATES.WAIT_NEW_CUSTOMER_NAME),
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_NEW_CUSTOMER_NAME) {
    const nextContext = withNextStateContext(
      { ...activeContext, newCustomer: { ...(activeContext.newCustomer || {}), name: validation.value } },
      STATES.WAIT_NEW_CUSTOMER_PHONE
    );
    return {
      state: STATES.WAIT_NEW_CUSTOMER_PHONE,
      context: nextContext,
      message: getPromptForState(STATES.WAIT_NEW_CUSTOMER_PHONE),
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_NEW_CUSTOMER_PHONE) {
    // Store the phone and signal caller to send OTP; FSM advances to WAIT_OTP.
    const nextContext = withNextStateContext(
      { ...activeContext, newCustomer: { ...(activeContext.newCustomer || {}), phone: validation.value } },
      STATES.WAIT_OTP
    );
    return {
      state: STATES.WAIT_OTP,
      context: nextContext,
      message: getPromptForState(STATES.WAIT_OTP),
      output: buildOutputContract(nextContext),
      ambiguity: null,
      pendingOtpSend: true,          // caller must send OTP to newCustomer.phone
      otpPhone: validation.value,
    };
  }

  if (activeState === STATES.WAIT_OTP) {
    // Caller must verify the OTP externally and pass otpVerifyResult back.
    if (!otpVerifyResult) {
      return {
        state: STATES.WAIT_OTP,
        context: { ...activeContext, status: 'PENDING_OTP_VERIFY' },
        message: getPromptForState(STATES.WAIT_OTP),
        output: buildOutputContract({ ...activeContext, status: 'PENDING_OTP_VERIFY' }),
        ambiguity: null,
        pendingOtpVerify: true,
        otpToken: validation.value,
      };
    }

    if (!otpVerifyResult.ok) {
      const failContext = {
        ...activeContext,
        lastError: 'OTP_INCORRECT',
        lastPrompt: 'OTP কোড সঠিক নয়। আবার বলুন।',
      };
      return {
        state: STATES.WAIT_OTP,
        context: failContext,
        message: failContext.lastPrompt,
        output: buildOutputContract(failContext),
        ambiguity: null,
      };
    }

    const nextContext = withNextStateContext(
      { ...activeContext, newCustomer: { ...(activeContext.newCustomer || {}), otpVerified: true } },
      STATES.WAIT_NEW_PIN
    );
    return {
      state: STATES.WAIT_NEW_PIN,
      context: nextContext,
      message: getPromptForState(STATES.WAIT_NEW_PIN),
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_NEW_PIN) {
    // Store pending PIN (plaintext digits) in context — caller will bcrypt-hash it at create time.
    const nextContext = withNextStateContext(
      { ...activeContext, newCustomer: { ...(activeContext.newCustomer || {}), pendingPin: validation.value } },
      STATES.WAIT_NEW_PIN_CONFIRM
    );
    return {
      state: STATES.WAIT_NEW_PIN_CONFIRM,
      context: nextContext,
      message: getPromptForState(STATES.WAIT_NEW_PIN_CONFIRM),
      output: buildOutputContract(nextContext),
      ambiguity: null,
    };
  }

  if (activeState === STATES.WAIT_NEW_PIN_CONFIRM) {
    const pendingPin = activeContext.newCustomer?.pendingPin;
    if (validation.value !== pendingPin) {
      const mismatchContext = {
        ...activeContext,
        lastError: 'PIN_MISMATCH',
        lastPrompt: 'পিন মিলেনি। প্রথম থেকে আবার পিন বলুন।',
        newCustomer: { ...(activeContext.newCustomer || {}), pendingPin: null },
      };
      return {
        state: STATES.WAIT_NEW_PIN,
        context: { ...mismatchContext, flowHistory: [...(activeContext.flowHistory || []), STATES.WAIT_NEW_PIN] },
        message: mismatchContext.lastPrompt,
        output: buildOutputContract(mismatchContext),
        ambiguity: null,
      };
    }

    // PINs match. Signal caller to create the identity.
    if (!identityCreateResult) {
      return {
        state: STATES.WAIT_NEW_PIN_CONFIRM,
        context: { ...activeContext, status: 'PENDING_IDENTITY_CREATE' },
        message: getPromptForState(STATES.WAIT_NEW_PIN_CONFIRM),
        output: buildOutputContract({ ...activeContext, status: 'PENDING_IDENTITY_CREATE' }),
        ambiguity: null,
        pendingIdentityCreate: true,
        newCustomerData: {
          name:  activeContext.newCustomer?.name,
          phone: activeContext.newCustomer?.phone,
          pin:   pendingPin,          // plaintext — caller must hash before storing
        },
      };
    }

    // Caller detected a conflict and requires shopkeeper resolution.
    if (!identityCreateResult.ok && identityCreateResult.conflict) {
      const conflictContext = withNextStateContext(
        {
          ...activeContext,
          conflict: identityCreateResult.conflict,
          status: 'CONFLICT',
        },
        STATES.WAIT_CONFLICT_RESOLVE
      );
      return {
        state: STATES.WAIT_CONFLICT_RESOLVE,
        context: { ...conflictContext, lastPrompt: identityCreateResult.conflict.prompt || getPromptForState(STATES.WAIT_CONFLICT_RESOLVE) },
        message: identityCreateResult.conflict.prompt || getPromptForState(STATES.WAIT_CONFLICT_RESOLVE),
        output: buildOutputContract(conflictContext),
        ambiguity: null,
      };
    }

    if (!identityCreateResult.ok) {
      const failContext = {
        ...activeContext,
        lastError: 'IDENTITY_CREATE_FAILED',
        lastPrompt: 'গ্রাহক তৈরি করা সম্ভব হয়নি। আবার চেষ্টা করুন।',
      };
      return {
        state: STATES.WAIT_NEW_PIN_CONFIRM,
        context: failContext,
        message: failContext.lastPrompt,
        output: buildOutputContract(failContext),
        ambiguity: null,
      };
    }

    // Identity created — resume the original intent flow.
    const resumeState = activeContext.intent === 'balance' ? STATES.REVIEW : STATES.WAIT_AMOUNT;
    const resumeContext = withNextStateContext(
      {
        ...activeContext,
        name:        identityCreateResult.name  || activeContext.newCustomer?.name,
        nameId:      identityCreateResult.customerId,
        newCustomer: null,           // clear scratch pad
        status:      'READY',
      },
      resumeState
    );
    return {
      state:   resumeState,
      context: resumeContext,
      message: resumeContext.lastPrompt,
      output:  buildOutputContract(resumeContext),
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
  CONFIDENCE_THRESHOLDS_BY_STATE,
  CONFIRM_MIN_CONFIDENCE,
  HIGH_RISK_CONFIRM_MIN_CONFIDENCE,
  buildConfirmSummary,
  INTENT_TOKENS,
  DATE_SHORTCUTS,
  CONFIRM_TOKENS,
  GLOBAL_CONTROL_TOKENS,
  DEFAULT_TIMEOUT_RETRY_LIMIT,
  DEFAULT_HIGH_RISK_AMOUNT,
  MAX_RETRIES_BEFORE_TOUCH,
  buildInitialContext,
  buildOutputContract,
  buildConfirmationPrompt,
  validateSlotCompleteness,
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

// FSM state flow (identity-aware):
//
//   WAIT_INTENT
//     → WAIT_NAME
//         → (ambiguous/low-conf) → WAIT_CUSTOMER_SELECTION → resolved
//         → (NAME_MULTIPLE_GLOBAL via globalNameCandidates) → WAIT_CONFLICT_RESOLVE
//         → (NAME_NOT_FOUND)     → WAIT_CREATE_CONFIRM
//             na  → WAIT_NAME
//             yes → WAIT_NEW_CUSTOMER_NAME
//                     → WAIT_NEW_CUSTOMER_PHONE  [pendingOtpSend=true]
//                         → WAIT_OTP             [pendingOtpVerify=true]
//                             → WAIT_NEW_PIN
//                                 → WAIT_NEW_PIN_CONFIRM
//                                     mismatch → WAIT_NEW_PIN
//                                     match    → [pendingIdentityCreate=true]
//                                         → (conflict in identityCreateResult) → WAIT_CONFLICT_RESOLVE
//                                         → resumes at WAIT_AMOUNT (or REVIEW for balance)
//         → (clear match)
//
//   WAIT_CONFLICT_RESOLVE  [pendingConflictResolve=true]
//       PHONE_NAME_MISMATCH:    হ্যাঁ → link existing global identity  → resume
//                               না   → keep local (no global link)     → resume
//       NAME_MULTIPLE_GLOBAL:   এক/দুই → select candidate              → resume
//                               আলাদা  → keep local                    → resume
//       rule: never auto-merge; shopkeeper must speak an answer; default = keep local
//
//     → WAIT_AMOUNT → WAIT_DATE → REVIEW → CONFIRM
//     → WAIT_PIN   ← caller verifies bcrypt; wrong = CANCELLED (no retry)
//     → EXECUTE
