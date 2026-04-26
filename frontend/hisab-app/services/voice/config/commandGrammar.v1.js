/**
 * Hisab Voice Command Grammar v1
 *
 * Grammar structure (canonical): INTENT → NAME → AMOUNT → DATE
 * Common surface order (Bangladeshi speech): NAME INTENT AMOUNT  e.g. "rahim 50 baki"
 *
 * Scope constraint: no free-form sentences accepted.
 * Each slot is a bounded token set; unrecognised tokens trigger a retry prompt.
 *
 * Supported scripts: Bengali Unicode (bn-BD) + Latin Banglish transliteration.
 * Noisy STT output handled via alias expansion + phonetic fuzzy matching.
 */

// ─── Slot type identifiers ────────────────────────────────────────────────────

export const SLOT = Object.freeze({
  INTENT: 'INTENT',
  NAME:   'NAME',
  AMOUNT: 'AMOUNT',
  DATE:   'DATE',
});

// ─── Intent definitions ───────────────────────────────────────────────────────
//
// fsmToken        : canonical token the FSM / decoder accept internally
// apiAction       : string passed to commandExecutor → LOCAL_INTENT_TO_API
// requiresAmount  : whether WAIT_AMOUNT state is mandatory for this intent
// requiresDate    : whether WAIT_DATE  state is mandatory for this intent
// slots           : ordered slot sequence for this intent
// tokens.bengali  : Bengali Unicode variants (exact + common paraphrases)
// tokens.banglish : Latin transliteration variants (all acceptable spellings)
// tokens.misrecognitions : known bad ASR outputs that must still map here

export const INTENTS = Object.freeze({
  ADD_BAKI: {
    fsmToken:       'baki',
    apiAction:      'ADD_DEBT',
    requiresAmount: true,
    requiresDate:   false,
    slots: [SLOT.INTENT, SLOT.NAME, SLOT.AMOUNT, SLOT.DATE],
    tokens: {
      bengali: [
        'বাকি', 'ধার', 'বাকি দাও', 'বাকি রাখো', 'বাকি দে',
        'দেনা', 'উধার',
      ],
      banglish: [
        'baki', 'bakki', 'baqi', 'baky', 'baki dao',
        'baki rakho', 'dhar', 'udhar', 'due',
      ],
      misrecognitions: [
        'barki', 'boke', 'bagi', 'bakhee', 'barkey',
        'bhaki', 'baci', 'baaki', 'baqui',
      ],
    },
    prompts: { bn: 'বাকি কত টাকা?', en: 'How much credit?' },
  },

  PAYMENT: {
    fsmToken:       'joma',
    apiAction:      'PAYMENT',
    requiresAmount: true,
    requiresDate:   false,
    slots: [SLOT.INTENT, SLOT.NAME, SLOT.AMOUNT, SLOT.DATE],
    tokens: {
      bengali: [
        'জমা', 'জমান', 'টাকা জমা', 'টাকা নিন', 'পেমেন্ট',
        'পরিশোধ', 'শোধ', 'টাকা দেওয়া',
      ],
      banglish: [
        'joma', 'jama', 'jumma', 'joma din', 'taka nao',
        'payment', 'pay', 'shod', 'porishod',
      ],
      misrecognitions: [
        'juma', 'joman', 'jomma', 'yoma', 'zoma',
        'jomaa', 'djoma', 'goma',
      ],
    },
    prompts: { bn: 'কত টাকা জমা?', en: 'How much payment?' },
  },

  SALE: {
    fsmToken:       'becha',
    apiAction:      'SALE',
    requiresAmount: true,
    requiresDate:   false,
    slots: [SLOT.INTENT, SLOT.NAME, SLOT.AMOUNT, SLOT.DATE],
    tokens: {
      bengali: [
        'বেচা', 'বিক্রি', 'বিক্রয়', 'বেচলাম', 'বিক্রি করো',
        'কিনবো', 'কিনা', 'কিনুন',
      ],
      banglish: [
        'becha', 'bikri', 'bikree', 'beca', 'sale', 'sell',
        'bikroy', 'kinbo', 'kina', 'purchase', 'buy',
      ],
      misrecognitions: [
        'bika', 'bikhri', 'beshka', 'bechi', 'beci',
        'bikree', 'bikra', 'bechha',
      ],
    },
    prompts: { bn: 'কত টাকার বেচা?', en: 'Sale amount?' },
  },

  CHECK_BALANCE: {
    fsmToken:       'balance',
    apiAction:      'CHECK_BALANCE',
    requiresAmount: false,   // WAIT_AMOUNT is skipped for this intent
    requiresDate:   false,   // WAIT_DATE  is skipped for this intent
    slots: [SLOT.INTENT, SLOT.NAME],
    tokens: {
      bengali: [
        'ব্যালেন্স', 'হিসাব', 'বাকি কত', 'কত বাকি',
        'হিসাব দেখো', 'দেনা কত', 'হিসাব বলো', 'ব্যালেন্স দেখো',
      ],
      banglish: [
        'balance', 'hisab', 'baki koto', 'koto baki',
        'hisab dekho', 'dena koto', 'bal', 'hisab bolo',
        'check balance', 'check',
      ],
      misrecognitions: [
        'balans', 'blns', 'hishab', 'hicab', 'hiseb',
        'balence', 'ballance', 'hisaab',
      ],
    },
    prompts: { bn: 'কার হিসাব দেখবেন?', en: 'Whose balance?' },
  },
});

// ─── Slot definitions ─────────────────────────────────────────────────────────

export const SLOTS = Object.freeze({
  [SLOT.NAME]: {
    type:            'lexicon_match',
    source:          'hotwordDictionary.customers',
    matchStrategy:   'phonetic_fuzzy',
    minConfidence:   0.85,
    required:        true,
  },

  [SLOT.AMOUNT]: {
    type: 'numeric',
    patterns: {
      arabicDigits:  /^\d+(\.\d{1,2})?$/,
      bengaliDigits: /^[০-৯]+(\.[০-৯]{1,2})?$/,
      writtenBengali: [
        'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ',
        'বিশ', 'ত্রিশ', 'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই',
        'একশ', 'দুইশ', 'তিনশ', 'পাঁচশ', 'হাজার', 'দুই হাজার', 'পাঁচ হাজার',
      ],
      suffixes: ['টাকা', 'taka', 'tk'],
    },
    minConfidence:   0.9,
    required:        false, // overridden per intent via requiresAmount
  },

  [SLOT.DATE]: {
    type: 'date_shortcut_or_iso',
    shortcuts: {
      aj:   ['aj', 'aaj', 'আজ', 'today', 'ajke', 'ajkei'],
      kal:  ['kal', 'kaal', 'কাল', 'tomorrow', 'kaalke'],
      next: ['next', 'skip', 'পরে', 'por'],
    },
    isoPattern:   /^\d{4}-\d{2}-\d{2}$/,
    ddmmPattern:  /^\d{2}-\d{2}-\d{4}$/,
    required:     false,
  },
});

// ─── Grammar rules ────────────────────────────────────────────────────────────
//
// canonical  : formal left-to-right order  (INTENT NAME AMOUNT DATE)
// variants   : surface-order variations observed in Bangladeshi speech
//   variant 0: NAME-first   "rahim 50 baki"     → most common
//   variant 1: full form    "baki rahim 50 aj"  → intent-first
//   variant 2: no-date      "rahim 50 baki"     → amount without date
//   variant 3: query-only   "balance rahim"     → CHECK_BALANCE (no amount/date)

export const GRAMMAR_RULES = Object.freeze({
  canonical: [SLOT.INTENT, SLOT.NAME, SLOT.AMOUNT, SLOT.DATE],
  variants: [
    [SLOT.NAME, SLOT.AMOUNT, SLOT.INTENT],              // "rahim 50 baki"
    [SLOT.NAME, SLOT.INTENT, SLOT.AMOUNT, SLOT.DATE],   // "rahim baki 50 aj"
    [SLOT.INTENT, SLOT.NAME, SLOT.AMOUNT],              // no date
    [SLOT.INTENT, SLOT.NAME],                           // CHECK_BALANCE
    [SLOT.NAME, SLOT.INTENT],                           // "rahim balance"
  ],
  // Intents that omit AMOUNT and DATE slots entirely
  amountFreeIntents: ['balance'],
  dateFreeIntents:   ['balance'],
});

// ─── Noise handling ───────────────────────────────────────────────────────────

export const NOISE_RULES = Object.freeze({
  // Patterns in ASR output that signal unusable audio
  noisyPatterns: [
    /xx+/i, /\?\?/, /###/, /noise/i, /golmal/i,
    /unintelligible/i, /unclear/i, /\.\.\./,
  ],
  minTokenCount:   1,  // single-token utterances are valid (e.g. "balance")
  maxTokenCount:   8,  // reject overly-long free-form sentences
  retryOnRejection: true,
  maxRetries:      2,
  // Bengali filler words to strip before parsing
  fillerWords: [
    'একটু', 'আমার', 'আমাকে', 'দয়া করে', 'please', 'bhai', 'ভাই',
    'আপনি', 'তুমি', 'করুন', 'করো', 'দিন',
  ],
});

// ─── Allowed tokens (flat list for STT word-boost / grammar constraint) ───────

export const ALLOWED_TOKENS = Object.freeze([
  // ── Intent tokens (Banglish) ──
  'baki', 'bakki', 'baqi', 'dhar', 'udhar',
  'joma', 'jama', 'jumma', 'payment', 'pay',
  'becha', 'bikri', 'bikree', 'sale', 'sell',
  'kinbo', 'kina', 'purchase', 'buy',
  'balance', 'hisab', 'check',

  // ── Intent tokens (Bengali) ──
  'বাকি', 'ধার', 'দেনা', 'উধার',
  'জমা', 'পেমেন্ট', 'পরিশোধ',
  'বেচা', 'বিক্রি', 'কিনবো', 'কিনা',
  'ব্যালেন্স', 'হিসাব',

  // ── Confirmation tokens ──
  'confirm', 'yes', 'na', 'cancel', 'no',
  'হ্যাঁ', 'হা', 'না', 'বাতিল',

  // ── Date shortcut tokens ──
  'aj', 'aaj', 'kal', 'kaal', 'today', 'tomorrow',
  'আজ', 'কাল', 'next', 'skip', 'পরে',

  // ── Amount suffixes ──
  'টাকা', 'taka', 'tk',

  // ── Control tokens ──
  'back', 'repeat',
]);

// ─── Grammar metadata ─────────────────────────────────────────────────────────

export const GRAMMAR_META = Object.freeze({
  version:             '1.0.0',
  language:            ['bn-BD', 'en'],
  scripts:             ['Bengali', 'Latin'],
  intents:             Object.keys(INTENTS),
  slots:               Object.keys(SLOTS),
  created:             '2026-04-25',
  supportsNoisy:       true,
  maxUtteranceTokens:  8,
  sttWordBoostField:   'ALLOWED_TOKENS',
  maintainer:          'voice-team@hisab',
});

export default {
  SLOT,
  INTENTS,
  SLOTS,
  GRAMMAR_RULES,
  NOISE_RULES,
  ALLOWED_TOKENS,
  GRAMMAR_META,
};
