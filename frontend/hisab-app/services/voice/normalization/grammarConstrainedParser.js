/**
 * Grammar-constrained voice command parser for Hisab STT output.
 *
 * Unlike the general normalizer this parser:
 *   1. Validates utterance structure against commandGrammar.v1 rules
 *   2. Tracks which tokens could not be classified into any grammar slot
 *   3. Returns explicit status codes — never guesses below the confidence floor
 *   4. Reports LOW_CONFIDENCE rather than a wrong confident answer
 *
 * Entry point: parseVoiceCommand(transcript, resources?, options?)
 * Returns:     ParseResult  (see typedef below)
 */

import { INTENTS, GRAMMAR_RULES, NOISE_RULES, GRAMMAR_META } from '../config/commandGrammar.v1';
import DEFAULT_HOTWORDS from '../config/hotwordDictionary.json';
import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';
import {
  buildHotwordDictionary,
  findBestNameMatch,
  normalizeText,
} from './nameMatcher';
import { parseAmount } from './numberParser';
import { parseDate } from './dateParser';
import { scoreSlots } from './confidenceScorer';

// ─── Status codes ─────────────────────────────────────────────────────────────

export const PARSE_STATUS = Object.freeze({
  /** All required slots resolved above threshold. Safe to act on. */
  OK:             'OK',
  /** At least one required slot is missing or below threshold. Prompt the user. */
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  /** Input cannot be mapped to a valid command (noise, too many unknowns, etc.). */
  REJECTED:       'REJECTED',
  /** Name slot resolved but two candidates are too close to distinguish. */
  AMBIGUOUS:      'AMBIGUOUS',
});

// ─── Intent alias map ─────────────────────────────────────────────────────────
// Built once from commandGrammar.v1 INTENTS; includes Bengali, Banglish and
// known STT misrecognitions for every intent.

const _buildIntentAliasMap = () => {
  const map = new Map();
  for (const def of Object.values(INTENTS)) {
    const token = def.fsmToken;
    const allAliases = [
      token,
      ...def.tokens.bengali,
      ...def.tokens.banglish,
      ...def.tokens.misrecognitions,
    ];
    for (const alias of allAliases) {
      const normalized = normalizeText(alias);
      if (normalized) map.set(normalized, token);
    }
  }
  return map;
};

const INTENT_ALIAS_MAP = _buildIntentAliasMap();
const AMOUNT_FREE_INTENTS = new Set(GRAMMAR_RULES.amountFreeIntents || []);

const STRIP_TOKENS = new Set([
  'taka', 'tk', 'টাকা', 'tka', 'taaka', 'tks', 'টা', 'bdt',
]);

const FILLER_TOKENS = new Set(
  (NOISE_RULES.fillerWords || []).map(normalizeText).filter(Boolean)
);

// Date shortcuts accepted in WAIT_DATE grammar state
const DATE_SHORTCUT_MAP = Object.freeze({
  aj: 'aj', aaj: 'aj', today: 'aj', ajke: 'aj', ajkei: 'aj', আজ: 'aj',
  kal: 'kal', kaal: 'kal', tomorrow: 'kal', কাল: 'kal',
  next: 'next', skip: 'next', পরে: 'next',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isNoisyInput = (text) => {
  if (!text || !String(text).trim()) return true;
  for (const pattern of NOISE_RULES.noisyPatterns) {
    if (pattern.test(text)) return true;
  }
  return false;
};

const tokenize = (text) =>
  normalizeText(text)
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STRIP_TOKENS.has(t) && !FILLER_TOKENS.has(t));

// Try every prefix/suffix sub-phrase so multi-token intents ("বাকি কত") resolve.
const resolveIntent = (tokens) => {
  // Single-token pass
  for (const token of tokens) {
    const canonical = INTENT_ALIAS_MAP.get(token);
    if (canonical) return { fsmToken: canonical, confidence: 0.96, matchedToken: token };
  }

  // Two-token phrase pass
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    const canonical = INTENT_ALIAS_MAP.get(phrase);
    if (canonical) return { fsmToken: canonical, confidence: 0.90, matchedToken: phrase };
  }

  // Full-phrase pass (rare, e.g. three-word intent alias)
  const joined = tokens.join(' ');
  const canonical = INTENT_ALIAS_MAP.get(joined);
  if (canonical) return { fsmToken: canonical, confidence: 0.88, matchedToken: joined };

  return { fsmToken: null, confidence: 0, matchedToken: null };
};

// Classify each individual token into a grammar slot (or UNKNOWN).
// Used to measure the unknown-token ratio for the REJECTED gate.
const classifyTokens = (tokens, allEntries) => {
  return tokens.map((token) => {
    if (INTENT_ALIAS_MAP.has(token)) {
      return { token, slot: 'INTENT', value: INTENT_ALIAS_MAP.get(token) };
    }

    if (Object.prototype.hasOwnProperty.call(DATE_SHORTCUT_MAP, token)) {
      return { token, slot: 'DATE', value: DATE_SHORTCUT_MAP[token] };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      return { token, slot: 'DATE', value: token };
    }

    const amtResult = parseAmount(token);
    if (amtResult.amount !== null && amtResult.confidence >= 0.80) {
      return { token, slot: 'AMOUNT', value: amtResult.amount, confidence: amtResult.confidence };
    }

    const nameResult = findBestNameMatch({
      query: token,
      entries: allEntries,
      minConfidence: VOICE_TUNING_CONFIG.thresholds.nameMatchMin,
    });
    if (nameResult.match) {
      return { token, slot: 'NAME', value: nameResult.match, confidence: nameResult.confidence };
    }

    return { token, slot: 'UNKNOWN', value: null };
  });
};

// Name resolution across individual tokens AND the full token sequence.
// Multi-token names (e.g. "md rahim") are checked by the joined query.
const resolveName = (tokens, allEntries) => {
  const queries = [tokens.join(' '), ...tokens];
  let best = { match: null, confidence: 0, ambiguous: false, candidates: [] };

  for (const q of queries) {
    const r = findBestNameMatch({
      query: q,
      entries: allEntries,
      minConfidence: VOICE_TUNING_CONFIG.thresholds.nameMatchMin,
      ambiguityDelta: VOICE_TUNING_CONFIG.thresholds.nameAmbiguityDelta,
    });
    if (Number(r.confidence || 0) > Number(best.confidence || 0)) best = r;
  }

  return best;
};

// ─── Status determination ─────────────────────────────────────────────────────

const determineStatus = ({
  intent,
  nameMatch,
  amount,
  nameConfidence,
  overall,
  unknownRatio,
  requiresAmount,
}) => {
  // Hard reject: nothing resolved at all
  if (!intent && !nameMatch && amount === null) return PARSE_STATUS.REJECTED;

  // Hard reject: majority of tokens unrecognised — likely free-form speech
  if (unknownRatio > 0.50) return PARSE_STATUS.REJECTED;

  // Soft failures that still produce a parseable (but unconfident) result
  if (!intent) return PARSE_STATUS.LOW_CONFIDENCE;

  if (!nameMatch || nameConfidence < VOICE_TUNING_CONFIG.thresholds.nameMatchMin) {
    return PARSE_STATUS.LOW_CONFIDENCE;
  }

  if (requiresAmount && amount === null) return PARSE_STATUS.LOW_CONFIDENCE;

  if (overall < 0.75) return PARSE_STATUS.LOW_CONFIDENCE;

  return PARSE_STATUS.OK;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a raw STT transcript into a structured voice command.
 *
 * @param {string}  transcript  Raw text from ElevenLabs (or any STT provider)
 * @param {Object}  resources   { customers?, products?, branches? } merged with defaults
 * @param {Object}  options     { threshold?: number, now?: Date }
 * @returns {ParseResult}
 *
 * ParseResult shape:
 * {
 *   intent:     string | null   — fsmToken: 'baki' | 'joma' | 'becha' | 'balance' | null
 *   name:       string | null   — canonical customer / product name
 *   nameId:     string | null   — entry id from hotword dictionary
 *   amount:     number | null
 *   date:       string | null   — ISO-8601 date (YYYY-MM-DD)
 *   confidence: number          — 0–1 weighted overall score
 *   status:     PARSE_STATUS
 *   flags: {
 *     unknownTokens:   string[]
 *     rejectedReason:  string | null
 *     nameAmbiguous:   boolean
 *     intentFound:     boolean
 *     amountFound:     boolean
 *     nameCandidates:  Array<{ id, name, confidence }>
 *     slotConfidences: { name, amount, intent, date }
 *   }
 * }
 */
export const parseVoiceCommand = (transcript, resources = {}, options = {}) => {
  const confidenceThreshold = Number.isFinite(Number(options.threshold))
    ? Number(options.threshold)
    : VOICE_TUNING_CONFIG.thresholds.normalizationOverall;

  // ── 1. Noise gate ──────────────────────────────────────────────────────────
  if (isNoisyInput(transcript)) {
    return _rejected('NOISY_INPUT');
  }

  const tokens = tokenize(transcript);

  if (tokens.length === 0) return _rejected('EMPTY_INPUT');

  // ── 2. Token-count gate (blocks free-form sentences) ──────────────────────
  if (tokens.length > GRAMMAR_META.maxUtteranceTokens) {
    return _rejected('TOO_MANY_TOKENS', tokens);
  }

  // ── 3. Build dictionary (defaults + caller-supplied) ──────────────────────
  const dictionary = buildHotwordDictionary({
    customers: [...(DEFAULT_HOTWORDS.customers || []), ...(resources.customers || [])],
    products:  [...(DEFAULT_HOTWORDS.products  || []), ...(resources.products  || [])],
    branches:  [...(DEFAULT_HOTWORDS.branches  || []), ...(resources.branches  || [])],
  });

  const allEntries = [
    ...dictionary.customers,
    ...dictionary.products,
    ...dictionary.branches,
  ];

  // ── 4. Token classification — measures unknown-token ratio ────────────────
  const classified    = classifyTokens(tokens, allEntries);
  const unknownTokens = classified.filter((c) => c.slot === 'UNKNOWN').map((c) => c.token);
  const unknownRatio  = tokens.length > 0 ? unknownTokens.length / tokens.length : 0;

  // ── 5. Slot extraction ────────────────────────────────────────────────────
  const intentResult = resolveIntent(tokens);
  const nameResult   = resolveName(tokens, allEntries);
  const amountResult = parseAmount(tokens.join(' '));
  const dateResult   = parseDate(tokens.join(' '), options.now || new Date());

  // ── 6. Confidence scoring ─────────────────────────────────────────────────
  const intentConfidence = intentResult.fsmToken ? intentResult.confidence : 0;
  const nameConfidence   = nameResult.match       ? nameResult.confidence   : 0;
  const amountConfidence = amountResult.amount !== null ? amountResult.confidence : 0;
  const dateConfidence   = dateResult.date         ? dateResult.confidence   : 0;

  const requiresAmount = intentResult.fsmToken
    ? !AMOUNT_FREE_INTENTS.has(intentResult.fsmToken)
    : true;

  const scores = scoreSlots({
    nameConfidence,
    amountConfidence,
    intentConfidence,
    dateConfidence,
    hasAmount: amountResult.amount !== null,
    hasDate:   Boolean(dateResult.date),
  });

  // ── 7. Status determination ───────────────────────────────────────────────
  const nameAmbiguous = Boolean(nameResult.ambiguous);

  const status = nameAmbiguous
    ? PARSE_STATUS.AMBIGUOUS
    : determineStatus({
      intent:         intentResult.fsmToken,
      nameMatch:      nameResult.match,
      amount:         amountResult.amount,
      nameConfidence,
      overall:        scores.overall,
      unknownRatio,
      requiresAmount,
    });

  // ── 8. Rejection reason label (only set when REJECTED) ────────────────────
  let rejectedReason = null;
  if (status === PARSE_STATUS.REJECTED) {
    if (unknownRatio > 0.50) rejectedReason = 'TOO_MANY_UNKNOWN_TOKENS';
    else                     rejectedReason = 'UNRESOLVABLE_INPUT';
  }

  return {
    intent:     intentResult.fsmToken,
    name:       nameResult.match?.name   || null,
    nameId:     nameResult.match?.id     || null,
    amount:     amountResult.amount,
    date:       dateResult.date,
    confidence: scores.overall,
    status,
    flags: {
      unknownTokens,
      rejectedReason,
      nameAmbiguous,
      intentFound:     Boolean(intentResult.fsmToken),
      amountFound:     amountResult.amount !== null,
      nameCandidates:  nameResult.candidates || [],
      slotConfidences: scores.slots,
    },
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const _rejected = (reason, tokens = []) => ({
  intent: null, name: null, nameId: null, amount: null, date: null,
  confidence: 0,
  status: PARSE_STATUS.REJECTED,
  flags: {
    unknownTokens:   tokens,
    rejectedReason:  reason,
    nameAmbiguous:   false,
    intentFound:     false,
    amountFound:     false,
    nameCandidates:  [],
    slotConfidences: { name: 0, amount: 0, intent: 0, date: 0 },
  },
});

export default { parseVoiceCommand, PARSE_STATUS };
