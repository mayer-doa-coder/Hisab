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

const NUMBER_WORDS = Object.freeze({
  zero: 0,
  shunno: 0,
  sunno: 0,
  ek: 1,
  eka: 1,
  one: 1,
  dui: 2,
  duiho: 2,
  du: 2,
  two: 2,
  tin: 3,
  three: 3,
  char: 4,
  chaar: 4,
  four: 4,
  pach: 5,
  panch: 5,
  five: 5,
  choy: 6,
  chhoy: 6,
  six: 6,
  sat: 7,
  saat: 7,
  seven: 7,
  at: 8,
  aat: 8,
  eight: 8,
  noy: 9,
  nine: 9,
  dosh: 10,
  ten: 10,
  egaro: 11,
  এগারো: 11,
  baro: 12,
  বারো: 12,
  tero: 13,
  তেরো: 13,
  choddho: 14,
  চৌদ্দ: 14,
  ponesh: 15,
  ponero: 15,
  pnero: 15,
  পনেরো: 15,
  sholo: 16,
  ষোল: 16,
  shotero: 17,
  সতেরো: 17,
  atharo: 18,
  আঠারো: 18,
  unish: 19,
  উনিশ: 19,
  bish: 20,
  বিশ: 20,
  ekush: 21,
  baish: 22,
  teish: 23,
  chobbish: 24,
  panchish: 25,
  chabbish: 26,
  satash: 27,
  athash: 28,
  unotrish: 29,
  trish: 30,
  chollish: 40,
  challish: 40,
  panchash: 50,
  pachash: 50,
  pachas: 50,
  pacash: 50,
  shat: 60,
  shot: 60,
  shottor: 70,
  sattor: 70,
  sotter: 70,
  ashi: 80,
  aashi: 80,
  nobboi: 90,
  nobbui: 90,
  noboi: 90,
  eksho: 100,
  ekso: 100,
  aksho: 100,
  একশ: 100,
  একশো: 100,
  একশত: 100,
  sho: 100,
  shoo: 100,
  shoto: 100,
  শত: 100,
  শো: 100,
  der: 1.5,
  দেড়: 1.5,
  দেড়শ: 150,
  hajar: 1000,
  হাজার: 1000,
  lakh: 100000,
  লক্ষ: 100000,
  pachsho: 500,
  panchsho: 500,
  panso: 500,
  পাঁচশ: 500,
  duisho: 200,
  duiso: 200,
  দুইশ: 200,
  barosho: 1200,
  বারোশো: 1200,
  পঞ্চাশ: 50,
  পঞ্চাস: 50,
  এক: 1,
  দুই: 2,
  তিন: 3,
  চার: 4,
  পাঁচ: 5,
  ছয়: 6,
  সাত: 7,
  আট: 8,
  নয়: 9,
  দশ: 10,
});

const STRIP_WORDS = new Set(['taka', 'tk', 'টাকা', 'tka', 'tk']);

const splitMixedAlphaNumeric = (token) => {
  const value = String(token || '').trim();
  if (!value) {
    return [];
  }

  return value
    .replace(/([0-9]+)([a-zA-Z\u0980-\u09FF]+)/g, '$1 $2')
    .replace(/([a-zA-Z\u0980-\u09FF]+)([0-9]+)/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
};

const parseNumericToken = (token) => {
  const normalized = normalizeDigits(token).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return {
    amount,
    confidence: 0.99,
    source: 'digit',
  };
};

const parseSpokenNumber = (text) => {
  const normalized = normalizeText(normalizeDigits(text));
  if (!normalized) {
    return null;
  }

  const tokens = normalized
    .split(' ')
    .flatMap((part) => splitMixedAlphaNumeric(part))
    .map((part) => part.trim())
    .filter((part) => part && !STRIP_WORDS.has(part));

  if (!tokens.length) {
    return null;
  }

  let total = 0;
  let current = 0;
  let usedWords = 0;

  for (const token of tokens) {
    if (!Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) {
      continue;
    }

    usedWords += 1;
    const value = NUMBER_WORDS[token];

    if (value === 100 || value === 1000 || value === 100000) {
      const multiplier = value;
      const base = current > 0 ? current : 1;
      current = base * multiplier;

      if (multiplier >= 1000) {
        total += current;
        current = 0;
      }
      continue;
    }

    current += value;
  }

  const amount = total + current;
  if (usedWords === 0 || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const confidenceBase = usedWords >= 2 ? 0.95 : 0.9;
  return {
    amount,
    confidence: confidenceBase,
    source: 'spoken',
  };
};

const parseAmount = (text) => {
  const rawText = String(text || '');
  const directNumeric = rawText.match(/(\d[\d,]*(?:\.\d{1,2})?)/);
  if (directNumeric && directNumeric[1]) {
    const parsed = parseNumericToken(directNumeric[1]);
    if (parsed) {
      return parsed;
    }
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      amount: null,
      confidence: 0,
      source: null,
    };
  }

  const parts = normalized.split(' ');

  for (const part of parts) {
    const parsed = parseNumericToken(part);
    if (parsed) {
      return parsed;
    }
  }

  const spoken = parseSpokenNumber(normalized);
  if (spoken) {
    return spoken;
  }

  return {
    amount: null,
    confidence: 0,
    source: null,
  };
};

export {
  normalizeDigits,
  parseNumericToken,
  parseSpokenNumber,
  parseAmount,
};
