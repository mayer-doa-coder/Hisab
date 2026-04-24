import { STATES } from '../voiceFSM';
import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';
import { buildHotwordDictionary, findBestNameMatch, normalizeText } from '../normalization/nameMatcher';

const INTENT_ALLOWED = Object.freeze(['baki', 'joma', 'becha', 'kinbo']);
const YES_NO_ALLOWED = Object.freeze(['confirm', 'yes', 'na', 'cancel']);

const EXTRA_INTENT_ALIASES = Object.freeze({
  // Devanagari variants commonly returned by multilingual ASR.
  'बाकी': 'baki',
  'बाकि': 'baki',
  'जमा': 'joma',
  'बेचा': 'becha',
  'बिक्री': 'becha',
  'किन्बो': 'kinbo',
  'किना': 'kinbo',
  // Arabic-script variants seen in runtime logs.
  'جاما': 'joma',
  'جا ما': 'joma',
  'بাকি': 'baki',
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
      aliases: [],
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

export const applyGrammarConstraint = ({
  text,
  state,
  knownNames = [],
}) => {
  const normalizedText = cleanText(text);
  const tokens = tokenize(text);

  if (!normalizedText) {
    return {
      text: '',
      tokens: [],
      acceptedToken: '',
      confidence: 0,
      reason: 'EMPTY_TEXT',
    };
  }

  if (state === STATES.WAIT_INTENT) {
    const accepted = resolveIntent(tokens, normalizedText) || pickFirstAllowed(tokens, new Set(INTENT_ALLOWED));
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.9 : 0.2,
      reason: accepted ? 'OK' : 'INTENT_NOT_ALLOWED',
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
    };
  }

  if (state === STATES.WAIT_DATE) {
    const acceptedAlias = resolveCanonicalToken(tokens, DATE_ALIAS_TO_CANONICAL);
    const normalizedTokens = acceptedAlias ? [...tokens, acceptedAlias] : tokens;
    const allowedDateTokens = new Set(['aj', 'kal', 'next', ...normalizedTokens.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t))]);
    const accepted = pickFirstAllowed(normalizedTokens, allowedDateTokens);
    return {
      text: normalizedText,
      tokens,
      acceptedToken: accepted,
      confidence: accepted ? 0.85 : 0.2,
      reason: accepted ? 'OK' : 'DATE_NOT_ALLOWED',
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
    };
  }

  return {
    text: normalizedText,
    tokens,
    acceptedToken: tokens[0] || '',
    confidence: 0.7,
    reason: 'PASSTHROUGH',
  };
};

export default {
  applyGrammarConstraint,
};
