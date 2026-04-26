import { STATES } from '../voiceFSM';
import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';
import { buildHotwordDictionary, findBestNameMatch, normalizeText } from '../normalization/nameMatcher';

const INTENT_ALLOWED = Object.freeze(['baki', 'joma', 'becha', 'kinbo', 'balance']);
const YES_NO_ALLOWED = Object.freeze(['confirm', 'yes', 'na', 'cancel']);

const EXTRA_INTENT_ALIASES = Object.freeze({
  // Devanagari variants commonly returned by multilingual ASR.
  'बाकी':  'baki',
  'बाकि':  'baki',
  'जमा':   'joma',
  'बेचा':  'becha',
  'बिक्री': 'becha',
  'किन्बो': 'kinbo',
  'किना':  'kinbo',
  // Arabic-script variants seen in runtime logs.
  'جاما':  'joma',
  'جا ما': 'joma',
  'بাকি':  'baki',
  // CHECK_BALANCE — Bengali Unicode variants.
  'ব্যালেন্স':  'balance',
  'হিসাব':      'balance',
  'বাকি কত':   'balance',
  'কত বাকি':   'balance',
  // CHECK_BALANCE — common misrecognitions from STT.
  'balans':     'balance',
  'hishab':     'balance',
  'hiseb':      'balance',
  'hicab':      'balance',
  'balence':    'balance',
  'ballance':   'balance',
  'hisaab':     'balance',
  'blns':       'balance',
});

const INTENT_ALIAS_TO_CANONICAL = Object.freeze(
  Object.entries(VOICE_TUNING_CONFIG?.intents || {}).reduce((acc, [canonical, aliases]) => {
    const values = [canonical, ...(Array.isArray(aliases) ? aliases : [])];
    for (const value of values) {
      const normalized = normalizeText(value);
      if (!normalized) {
        continue;
      }
      acc[normalized] = canonical;
    }
    return acc;
  }, Object.entries(EXTRA_INTENT_ALIASES).reduce((seed, [alias, canonical]) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) {
      return seed;
    }

    seed[normalizedAlias] = canonical;
    return seed;
  }, {}))
);

const CONFIRM_ALIAS_TO_CANONICAL = Object.freeze({
  confirm: 'confirm',
  yes: 'yes',
  y: 'yes',
  ha: 'yes',
  haa: 'yes',
  hya: 'yes',
  'হ্যাঁ': 'yes',
  'হা': 'yes',
  na: 'na',
  no: 'na',
  'না': 'na',
  cancel: 'cancel',
  batil: 'cancel',
  'বাতিল': 'cancel',
});

const DATE_ALIAS_TO_CANONICAL = Object.freeze({
  aj: 'aj',
  aaj: 'aj',
  today: 'aj',
  'আজ': 'aj',
  kal: 'kal',
  kaal: 'kal',
  tomorrow: 'kal',
  'কাল': 'kal',
  next: 'next',
  skip: 'next',
});

const cleanText = (value) => normalizeText(value);

// ─── Noise / filler constants ─────────────────────────────────────────────────

const FILLER_WORDS_SET = new Set([
  'একটু', 'আমার', 'আমাকে', 'দয়া করে', 'please', 'bhai', 'ভাই',
  'আপনি', 'তুমি', 'করুন', 'করো', 'দিন', 'এটা', 'ekhon', 'just',
  'mane', 'eta', 'ota', 'একটা', 'ekta',
]);

const NOISE_INDICATORS = new Set([
  'xxx', 'xx', 'noise', 'golmal', 'unintelligible', 'unclear', '###',
]);

// Flat intent vocabulary: all aliases normalized → used by vocabulary filter
const _buildIntentVocabSet = () => {
  const set = new Set();
  for (const t of INTENT_ALLOWED) {
    const n = cleanText(t);
    if (n) set.add(n);
  }
  for (const k of Object.keys(INTENT_ALIAS_TO_CANONICAL)) {
    const n = cleanText(k);
    if (n) set.add(n);
  }
  return set;
};
const INTENT_VOCAB_SET = _buildIntentVocabSet();

const NUMERIC_PATTERN = /^([0-9]+(\.[0-9]{1,2})?)$/;

const BENGALI_DIGIT_MAP = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const normalizeBengaliDigits = (s) => s.replace(/[০-৯]/g, (c) => BENGALI_DIGIT_MAP[c] ?? c);

const tokenize = (text) => cleanText(text).split(/\s+/).filter(Boolean);
const compactText = (value) => cleanText(value).replace(/\s+/g, '');

const resolveCanonicalToken = (tokens, aliasMap = {}) => {
  for (const token of tokens) {
    const canonical = aliasMap[token];
    if (canonical) {
      return canonical;
    }
  }

  return '';
};

const resolveIntent = (tokens, normalizedText) => {
  const byToken = resolveCanonicalToken(tokens, INTENT_ALIAS_TO_CANONICAL);
  if (byToken) {
    return byToken;
  }

  const compactNormalized = compactText(normalizedText);

  for (const [alias, canonical] of Object.entries(INTENT_ALIAS_TO_CANONICAL)) {
    const compactAlias = compactText(alias);
    if (normalizedText.includes(alias) || (compactAlias && compactNormalized.includes(compactAlias))) {
      return canonical;
    }
  }

  return '';
};

const pickFirstAllowed = (tokens, allowedSet) => {
  for (const token of tokens) {
    if (allowedSet.has(token)) {
      return token;
    }
  }
  return '';
};

const pickNumeric = (tokens) => {
  for (const token of tokens) {
    const ascii = normalizeBengaliDigits(token);
    if (NUMERIC_PATTERN.test(ascii)) {
      return ascii;
    }
  }
  return '';
};

const pickName = (tokens, knownNames = []) => {
  const lexicon = new Map();
  for (const item of knownNames) {
    const label = cleanText(item?.name || item?.label || item);
    if (!label) {
      continue;
    }
    lexicon.set(label, item?.name || item?.label || String(item));
  }

  const joined = tokens.join(' ');
  if (lexicon.has(joined)) {
    return lexicon.get(joined);
  }

  for (const token of tokens) {
    if (lexicon.has(token)) {
      return lexicon.get(token);
    }
  }

  for (const [key, value] of lexicon.entries()) {
    if (joined.includes(key)) {
      return value;
    }
  }

  const dictionary = buildHotwordDictionary({
    customers: (Array.isArray(knownNames) ? knownNames : []).map((item) => ({
      id: item?.id ?? null,
      name: item?.name || item?.label || String(item || ''),
      aliases: Array.isArray(item?.aliases) ? item.aliases : [],
    })),
  });

  const candidates = [joined, ...tokens];
  let best = { match: null, confidence: 0 };
  for (const query of candidates) {
    const row = findBestNameMatch({
      query,
      entries: dictionary.customers,
      minConfidence: 0.72,
      ambiguityDelta: Number(VOICE_TUNING_CONFIG?.thresholds?.nameAmbiguityDelta || 0.08),
    });

    if (Number(row?.confidence || 0) > Number(best.confidence || 0)) {
      best = row;
    }
  }

  if (best?.match?.name) {
    return String(best.match.name);
  }

  return '';
};

// ─── Per-state vocabulary API ─────────────────────────────────────────────────

/**
 * Build the vocabulary descriptor for a specific FSM state.
 * `tokens` is the flat list for STT word-boost; `pattern` matches tokens
 * that belong to the slot even if not explicitly listed (e.g. numeric amounts).
 */
export const buildStateVocabulary = (state, knownNames = []) => {
  if (state === STATES.WAIT_INTENT) {
    return {
      type: 'intent',
      tokens: Array.from(INTENT_VOCAB_SET),
      pattern: null,
    };
  }

  if (state === STATES.WAIT_NAME) {
    const nameTokens = knownNames
      .map((n) => cleanText(n?.name || n?.label || n))
      .filter(Boolean);
    return {
      type: 'name',
      tokens: nameTokens,
      pattern: null,
    };
  }

  if (state === STATES.WAIT_AMOUNT) {
    return {
      type: 'numeric',
      tokens: ['taka', 'tk', 'টাকা', 'টা', 'bdt'],
      pattern: /^[0-9০-৯]+(\.[0-9০-৯]{1,2})?$/,
    };
  }

  if (state === STATES.WAIT_DATE) {
    return {
      type: 'date',
      tokens: Object.keys(DATE_ALIAS_TO_CANONICAL),
      pattern: /^\d{4}-\d{2}-\d{2}$/,
    };
  }

  if (state === STATES.CONFIRM) {
    return {
      type: 'confirm',
      tokens: Object.keys(CONFIRM_ALIAS_TO_CANONICAL),
      pattern: null,
    };
  }

  return { type: 'passthrough', tokens: [], pattern: null };
};

/**
 * Filter raw STT tokens to those valid for the current FSM state.
 * Strips filler words, noise indicators, and off-vocabulary tokens.
 *
 * Returns:
 *   filtered   — tokens that match the current state's grammar
 *   stripped   — tokens removed as noise or out-of-vocabulary
 *   noiseRatio — fraction of input tokens removed (0–1)
 */
export const filterTokensByVocabulary = (rawTokens, state, knownNames = []) => {
  const vocab = buildStateVocabulary(state, knownNames);
  const vocabSet = new Set(vocab.tokens.map((t) => cleanText(t)).filter(Boolean));

  const filtered = [];
  const stripped = [];

  for (const token of rawTokens) {
    const normalized = cleanText(token);
    if (!normalized) continue;

    if (NOISE_INDICATORS.has(normalized) || FILLER_WORDS_SET.has(normalized)) {
      stripped.push(token);
      continue;
    }

    if (vocab.type === 'passthrough') {
      filtered.push(token);
      continue;
    }

    if (vocab.type === 'numeric') {
      // Whitelist: digits + amount suffixes.
      // Inverse rule: also keep tokens that are NOT clearly intent/date/name
      // — written number words (eksho, pachash, tin hajar, …) must not be
      // stripped even though they don't match NUMERIC_PATTERN.
      const ascii = normalizeBengaliDigits(normalized);
      const isDigit  = NUMERIC_PATTERN.test(ascii) || /^[০-৯]+(\.[০-৯]{1,2})?$/.test(normalized);
      const isSuffix = vocabSet.has(normalized);
      const isIntent = INTENT_ALIAS_TO_CANONICAL[normalized] !== undefined || INTENT_VOCAB_SET.has(normalized);
      const isDate   = Object.prototype.hasOwnProperty.call(DATE_ALIAS_TO_CANONICAL, normalized)
                    || /^\d{4}-\d{2}-\d{2}$/.test(normalized);
      if (isDigit || isSuffix || (!isIntent && !isDate)) {
        filtered.push(token);
      } else {
        stripped.push(token);
      }
      continue;
    }

    if (vocab.type === 'date') {
      if (vocabSet.has(normalized) || /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        filtered.push(token);
      } else {
        stripped.push(token);
      }
      continue;
    }

    if (vocab.type === 'intent') {
      if (vocabSet.has(normalized) || INTENT_ALIAS_TO_CANONICAL[normalized] !== undefined) {
        filtered.push(token);
      } else {
        stripped.push(token);
      }
      continue;
    }

    if (vocab.type === 'name') {
      // Inverse-filter strategy: strip tokens we are CERTAIN are not names.
      // Phonetic variants and unknown spellings pass through to fuzzy matching.
      const ascii           = normalizeBengaliDigits(normalized);
      const isDigit         = NUMERIC_PATTERN.test(ascii) || /^[০-৯]+(\.[০-৯]{1,2})?$/.test(normalized);
      const isIntent        = INTENT_ALIAS_TO_CANONICAL[normalized] !== undefined || INTENT_VOCAB_SET.has(normalized);
      const isDate          = Object.prototype.hasOwnProperty.call(DATE_ALIAS_TO_CANONICAL, normalized)
                           || /^\d{4}-\d{2}-\d{2}$/.test(normalized);
      // Also strip amount-suffix words (taka, tk, টাকা …) which are never names
      const isAmountSuffix  = new Set(['taka', 'tk', 'টাকা', 'টা', 'bdt', 'tka', 'taaka', 'tks']).has(normalized);
      if (isDigit || isIntent || isDate || isAmountSuffix) {
        stripped.push(token);
      } else {
        filtered.push(token);
      }
      continue;
    }

    if (vocab.type === 'confirm') {
      if (vocabSet.has(normalized)) {
        filtered.push(token);
      } else {
        stripped.push(token);
      }
      continue;
    }

    stripped.push(token);
  }

  const noiseRatio = rawTokens.length > 0
    ? Number((stripped.length / rawTokens.length).toFixed(3))
    : 0;

  return { filtered, stripped, noiseRatio };
};

/**
 * Dynamic grammar switch — call on every FSM state transition.
 * Returns the vocabulary descriptor and an sttHints array ready to pass
 * to the STT request so the provider word-boosts for the new state.
 */
export const switchGrammar = (nextState, knownNames = []) => {
  const vocabulary = buildStateVocabulary(nextState, knownNames);
  const sttHints = vocabulary.type === 'passthrough'
    ? []
    : vocabulary.tokens.slice(0, 30);

  return {
    state: nextState,
    vocabulary,
    sttHints,
  };
};

// ─── Grammar constraint (public entry point) ──────────────────────────────────

export const applyGrammarConstraint = ({
  text,
  state,
  knownNames = [],
}) => {
  const normalizedText = cleanText(text);
  const rawTokens = tokenize(text);

  if (!normalizedText) {
    return {
      text: '',
      tokens: [],
      acceptedToken: '',
      confidence: 0,
      reason: 'EMPTY_TEXT',
      strippedTokens: [],
      noiseRatio: 0,
    };
  }

  // Vocabulary filter: strip noise and off-state tokens before resolution.
  // Fall back to raw tokens if filtering removed everything (prevents silent
  // failure when the user spoke valid content the filter missed).
  const { filtered, stripped, noiseRatio } = filterTokensByVocabulary(rawTokens, state, knownNames);
  const tokens = filtered.length > 0 ? filtered : rawTokens;
  const base = { strippedTokens: stripped, noiseRatio };

  if (state === STATES.WAIT_INTENT) {
    const accepted = resolveIntent(tokens, normalizedText) || pickFirstAllowed(tokens, new Set(INTENT_ALLOWED));
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.9 : 0.2,
      reason: accepted ? 'OK' : 'INTENT_NOT_ALLOWED',
      ...base,
    };
  }

  if (state === STATES.WAIT_NAME) {
    const accepted = pickName(tokens, knownNames);
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.88 : 0.25,
      reason: accepted ? 'OK' : 'NAME_NOT_IN_LEXICON',
      ...base,
    };
  }

  if (state === STATES.WAIT_AMOUNT) {
    const accepted = pickNumeric(tokens);
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.92 : 0.15,
      reason: accepted ? 'OK' : 'AMOUNT_NOT_NUMERIC',
      ...base,
    };
  }

  if (state === STATES.WAIT_DATE) {
    const acceptedAlias = resolveCanonicalToken(tokens, DATE_ALIAS_TO_CANONICAL);
    const normalizedTokens = acceptedAlias ? [...tokens, acceptedAlias] : tokens;
    const allowedDateTokens = new Set([
      'aj', 'kal', 'next',
      ...normalizedTokens.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)),
    ]);
    const accepted = pickFirstAllowed(normalizedTokens, allowedDateTokens);
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.85 : 0.2,
      reason: accepted ? 'OK' : 'DATE_NOT_ALLOWED',
      ...base,
    };
  }

  if (state === STATES.CONFIRM) {
    const accepted = resolveCanonicalToken(tokens, CONFIRM_ALIAS_TO_CANONICAL) || pickFirstAllowed(tokens, new Set(YES_NO_ALLOWED));
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.95 : 0.2,
      reason: accepted ? 'OK' : 'CONFIRMATION_REQUIRED',
      ...base,
    };
  }

  return {
    text: normalizedText,
    tokens,
    acceptedToken: tokens[0] || '',
    confidence: 0.7,
    reason: 'PASSTHROUGH',
    ...base,
  };
};

export default {
  applyGrammarConstraint,
  buildStateVocabulary,
  filterTokensByVocabulary,
  switchGrammar,
};
