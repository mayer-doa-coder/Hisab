const BANGLA_DIGIT_MAP = Object.freeze({
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

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDigits = (value) =>
  String(value || '')
    .split('')
    .map((char) => (Object.prototype.hasOwnProperty.call(BANGLA_DIGIT_MAP, char) ? BANGLA_DIGIT_MAP[char] : char))
    .join('');

// Sentinel used inside NUMBER_WORDS to flag the সাড়ে (+0.5) modifier.
// When encountered in the token stream the parser sets halfModifier=true
// and applies +0.5 to the base of the next scale group.
const HALF_MODIFIER = '__HALF__';

const NUMBER_WORDS = Object.freeze({
  // ── Zero ─────────────────────────────────────────────────────────────────
  zero: 0, shunno: 0, sunno: 0, শূন্য: 0,

  // ── 1–9 (Banglish) ───────────────────────────────────────────────────────
  ek: 1, eka: 1, one: 1,
  dui: 2, duiho: 2, du: 2, two: 2,
  tin: 3, three: 3,
  char: 4, chaar: 4, four: 4,
  pach: 5, panch: 5, five: 5,
  choy: 6, chhoy: 6, six: 6,
  sat: 7, saat: 7, seven: 7,
  at: 8, aat: 8, eight: 8,
  noy: 9, nine: 9,

  // ── 1–9 (Bengali Unicode) ─────────────────────────────────────────────────
  এক: 1, দুই: 2, তিন: 3, চার: 4,
  পাঁচ: 5, ছয়: 6, সাত: 7, আট: 8, নয়: 9,

  // ── 10–19 (Banglish + Bengali) ───────────────────────────────────────────
  dosh: 10, desh: 10, ten: 10, দশ: 10,
  egaro: 11, এগারো: 11, এগার: 11,
  baro: 12, বারো: 12, বার: 12,
  tero: 13, তেরো: 13, তের: 13,
  choddho: 14, চৌদ্দ: 14, chawddo: 14,
  ponesh: 15, ponero: 15, pnero: 15, পনেরো: 15, পনের: 15,
  sholo: 16, ষোল: 16, ষোলো: 16,
  shotero: 17, সতেরো: 17, সতের: 17,
  atharo: 18, আঠারো: 18, আঠার: 18,
  unish: 19, উনিশ: 19,

  // ── 20–29 ─────────────────────────────────────────────────────────────────
  bish: 20, বিশ: 20, বিশো: 20, twenty: 20,
  ekush: 21, একুশ: 21,
  baish: 22, বাইশ: 22,
  teish: 23, তেইশ: 23,
  chobbish: 24, চব্বিশ: 24,
  panchish: 25, পঁচিশ: 25,
  chabbish: 26, ছাব্বিশ: 26,
  satash: 27, সাতাশ: 27,
  athash: 28, আঠাশ: 28,
  unotrish: 29, উনত্রিশ: 29,

  // ── 30–39 ─────────────────────────────────────────────────────────────────
  trish: 30, tirish: 30, তিরিশ: 30, ত্রিশ: 30, thirty: 30,
  ektrish: 31, একত্রিশ: 31,
  battish: 32, বত্রিশ: 32,
  tettish: 33, তেত্রিশ: 33,
  chhottrish: 34, চৌত্রিশ: 34,
  panchtrish: 35, পঁয়ত্রিশ: 35,
  chhattish: 36, ছত্রিশ: 36,
  satattrish: 37, সাতত্রিশ: 37,
  atattrish: 38, আটত্রিশ: 38,
  unocholish: 39, উনচল্লিশ: 39,

  // ── 40–49 ─────────────────────────────────────────────────────────────────
  chollish: 40, challish: 40, চল্লিশ: 40, forty: 40,
  ekchollish: 41, একচল্লিশ: 41,
  byallish: 42, বিয়াল্লিশ: 42,
  teyallish: 43, তেতাল্লিশ: 43,
  choallish: 44, চৌল্লিশ: 44,
  poycholish: 45, পঁয়তাল্লিশ: 45,
  chiyallish: 46, ছেচল্লিশ: 46,
  satcollish: 47, সাতচল্লিশ: 47,
  athcollish: 48, আটচল্লিশ: 48,
  unchobbish: 49, উনপঞ্চাশ: 49,

  // ── 50–59 ─────────────────────────────────────────────────────────────────
  panchash: 50, pachash: 50, pachas: 50, pacash: 50,
  পঞ্চাশ: 50, পঞ্চাস: 50, fifty: 50,
  ekanno: 51, একান্ন: 51,
  bawan: 52, বায়ান্ন: 52,
  tirpanna: 53, তিপান্ন: 53,
  chauwan: 54, চৌয়ান্ন: 54,
  panchanna: 55, পঞ্চান্ন: 55,
  chappanna: 56, ছাপান্ন: 56,
  sattaanna: 57, সাতান্ন: 57,
  attaanna: 58, আটান্ন: 58,
  unashat: 59, উনষাট: 59,

  // ── 60–90 ─────────────────────────────────────────────────────────────────
  shat: 60, shot: 60,ষাট: 60, sixty: 60,
  shottor: 70, sattor: 70, sotter: 70, সত্তর: 70, seventy: 70,
  ashi: 80, aashi: 80, আশি: 80, eighty: 80,
  nobboi: 90, nobbui: 90, noboi: 90, নব্বই: 90, ninety: 90,

  // ── Scale words ───────────────────────────────────────────────────────────
  // value === 100 triggers multiplier branch in the algorithm
  sho: 100, shoo: 100, shoto: 100,
  শত: 100, শো: 100,
  eksho: 100, ekso: 100, aksho: 100,
  একশ: 100, একশো: 100, একশত: 100,

  // value === 1000 / 100000 triggers multiplier + total-flush
  hajar: 1000, হাজার: 1000, thousand: 1000,
  lakh: 100000, লক্ষ: 100000, লাখ: 100000, লক্ষ্য: 100000,

  // ── Common compound hundreds stored as direct values ──────────────────────
  // Avoids false-positive scale multiplication when spoken as one token.
  dersho: 150, dershoo: 150, দেড়শ: 150, দেড়শো: 150,
  duisho: 200, duiso: 200, dusho: 200, দুইশ: 200, দুইশো: 200, দুশো: 200, দুশ: 200,
  tinsho: 300, তিনশ: 300, তিনশো: 300, তিনশত: 300, tinsha: 300,
  charsho: 400, চারশ: 400, চারশো: 400, চারশত: 400,
  pachsho: 500, panchsho: 500, panso: 500, পাঁচশ: 500, পাঁচশো: 500,
  choysho: 600, choisho: 600, ছয়শ: 600, ছয়শো: 600,
  satsho: 700, সাতশ: 700, সাতশো: 700,
  atsho: 800, আটশ: 800, আটশো: 800,
  noysho: 900, নয়শ: 900, নয়শো: 900,

  // ── Fractional bases ──────────────────────────────────────────────────────
  // der / দেড় = 1.5; when followed by হাজার → 1500, etc.
  der: 1.5, দেড়: 1.5,

  // arai / আড়াই = 2.5; functions identically to der
  arai: 2.5, adhai: 2.5, আড়াই: 2.5, আড়াইশো: 250, araisho: 250, adhaisho: 250,

  // ── সাড়ে / sade — +0.5 modifier on the next scale group ─────────────────
  // "সাড়ে তিন হাজার" = (3 + 0.5) × 1000 = 3500
  সাড়ে: HALF_MODIFIER, sade: HALF_MODIFIER, shade: HALF_MODIFIER,

  // ── Common compound thousands ─────────────────────────────────────────────
  barosho: 1200, বারোশো: 1200,
  ponersho: 1500, পনেরোশো: 1500,
  duihajar: 2000, 'দুই হাজার': 2000,
  panchhajar: 5000, 'পাঁচ হাজার': 5000,
  dashajar: 10000, 'দশ হাজার': 10000,
});

const STRIP_WORDS = new Set([
  'taka', 'tk', 'টাকা', 'tka', 'taaka', 'tks',
  'rupee', 'rupees', 'bdt', 'টা',
]);

const splitMixedAlphaNumeric = (token) => {
  const value = String(token || '').trim();
  if (!value) return [];
  return value
    .replace(/([0-9]+)([a-zA-Zঀ-৿]+)/g, '$1 $2')
    .replace(/([a-zA-Zঀ-৿]+)([0-9]+)/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
};

const parseNumericToken = (token) => {
  const normalized = normalizeDigits(token).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount, confidence: 0.99, source: 'digit' };
};

/**
 * Parses Bengali / Banglish spoken-number text into a numeric value.
 *
 * Algorithm:
 *   Processes tokens left-to-right maintaining a running `current` accumulator
 *   and a `total` for completed scale groups.
 *
 *   Scale words (100 / 1000 / 100000):
 *     current = (current > 0 ? current : 1) × scale
 *     if scale ≥ 1000: flush current → total, reset current
 *
 *   সাড়ে / sade modifier:
 *     Sets halfModifier=true. Next scale application adds 0.5 to the base
 *     before multiplying, yielding e.g. (3 + 0.5) × 1000 = 3500.
 *
 *   Direct compound values (দেড়শো=150, পাঁচশ=500, বারোশো=1200, …):
 *     Stored as their final numeric value; added to current directly.
 *     This avoids false-positive scale multiplication.
 */
const parseSpokenNumber = (text) => {
  const normalized = normalizeText(normalizeDigits(text));
  if (!normalized) return null;

  const tokens = normalized
    .split(' ')
    .flatMap((part) => splitMixedAlphaNumeric(part))
    .map((part) => part.trim())
    .filter((part) => part && !STRIP_WORDS.has(part));

  if (!tokens.length) return null;

  let total = 0;
  let current = 0;
  let usedWords = 0;
  let halfModifier = false;

  for (const token of tokens) {
    if (!Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) continue;

    const value = NUMBER_WORDS[token];

    // সাড়ে / sade: flag the next scale application
    if (value === HALF_MODIFIER) {
      halfModifier = true;
      usedWords += 1;
      continue;
    }

    usedWords += 1;

    // Scale word — multiply accumulated base
    if (value === 100 || value === 1000 || value === 100000) {
      let base = current > 0 ? current : 1;
      if (halfModifier) {
        base += 0.5;
        halfModifier = false;
      }
      current = base * value;

      if (value >= 1000) {
        total += current;
        current = 0;
      }
      continue;
    }

    // Regular additive value (includes direct compound hundreds like পাঁচশ=500)
    if (halfModifier && value < 100) {
      // e.g. "সাড়ে পাঁচ" before হাজার — defer the +0.5 to the scale step
      current += value;
    } else {
      current += value;
    }
  }

  const amount = total + current;
  if (usedWords === 0 || !Number.isFinite(amount) || amount <= 0) return null;

  // Confidence: multi-word → 0.95, single-word → 0.90
  return {
    amount,
    confidence: usedWords >= 2 ? 0.95 : 0.90,
    source: 'spoken',
  };
};

/**
 * Parses an arbitrary text fragment into an amount.
 *
 * Priority order:
 *   1. Bare digit run in the raw string (handles "১৫০", "150", "1,500")
 *   2. Per-token digit match after normalization
 *   3. Multi-token spoken-number composition
 */
const parseAmount = (text) => {
  const rawText = String(text || '');

  // Capture the first digit run (supports Bangla digits and commas)
  const directMatch = rawText.match(/([\d০-৯][\d,০-৯]*(?:\.[\d০-৯]{1,2})?)/u);
  if (directMatch?.[1]) {
    const parsed = parseNumericToken(directMatch[1]);
    if (parsed) return parsed;
  }

  const normalized = normalizeText(text);
  if (!normalized) return { amount: null, confidence: 0, source: null };

  // Per-token pass (handles mixed tokens like "50taka" split by splitMixed…)
  for (const part of normalized.split(' ')) {
    const parsed = parseNumericToken(part);
    if (parsed) return parsed;
  }

  // Spoken-number composition
  const spoken = parseSpokenNumber(normalized);
  if (spoken) return spoken;

  return { amount: null, confidence: 0, source: null };
};

export {
  normalizeDigits,
  parseNumericToken,
  parseSpokenNumber,
  parseAmount,
  HALF_MODIFIER,
};
