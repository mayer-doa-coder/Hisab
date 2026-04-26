const normalizeText = (value) =>
  String(value || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BANGLA_TO_LATIN = Object.freeze({
  'অ': 'o',
  'আ': 'a',
  'ই': 'i',
  'ঈ': 'i',
  'উ': 'u',
  'ঊ': 'u',
  'এ': 'e',
  'ঐ': 'oi',
  'ও': 'o',
  'ঔ': 'ou',
  'ক': 'k',
  'খ': 'kh',
  'গ': 'g',
  'ঘ': 'gh',
  'ঙ': 'ng',
  'চ': 'ch',
  'ছ': 'ch',
  'জ': 'j',
  'ঝ': 'jh',
  'ট': 't',
  'ঠ': 'th',
  'ড': 'd',
  'ঢ': 'dh',
  'ত': 't',
  'থ': 'th',
  'দ': 'd',
  'ধ': 'dh',
  'ন': 'n',
  'প': 'p',
  'ফ': 'f',
  'ব': 'b',
  'ভ': 'bh',
  'ম': 'm',
  'য': 'j',
  'র': 'r',
  'ল': 'l',
  'শ': 'sh',
  'ষ': 'sh',
  'স': 's',
  'হ': 'h',
  'া': 'a',
  'ি': 'i',
  'ী': 'i',
  'ু': 'u',
  'ূ': 'u',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
  'ং': 'ng',
  'ঁ': 'n',
  '্': '',
});

const DEVANAGARI_TO_LATIN = Object.freeze({
  'अ': 'a',
  'आ': 'a',
  'इ': 'i',
  'ई': 'i',
  'उ': 'u',
  'ऊ': 'u',
  'ए': 'e',
  'ऐ': 'oi',
  'ओ': 'o',
  'औ': 'ou',
  'क': 'k',
  'ख': 'kh',
  'ग': 'g',
  'घ': 'gh',
  'च': 'ch',
  'छ': 'ch',
  'ज': 'j',
  'झ': 'jh',
  'ट': 't',
  'ठ': 'th',
  'ड': 'd',
  'ढ': 'dh',
  'त': 't',
  'थ': 'th',
  'द': 'd',
  'ध': 'dh',
  'न': 'n',
  'प': 'p',
  'फ': 'f',
  'ब': 'b',
  'भ': 'bh',
  'म': 'm',
  'य': 'y',
  'र': 'r',
  'ल': 'l',
  'व': 'v',
  'श': 'sh',
  'ष': 'sh',
  'स': 's',
  'ह': 'h',
  'ा': 'a',
  'ि': 'i',
  'ी': 'i',
  'ु': 'u',
  'ू': 'u',
  'े': 'e',
  'ै': 'oi',
  'ो': 'o',
  'ौ': 'ou',
  'ं': 'n',
  'ँ': 'n',
  '्': '',
});

const toPhonetic = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  const transliterated = normalized
    .split('')
    .map((char) => {
      if (Object.prototype.hasOwnProperty.call(BANGLA_TO_LATIN, char)) {
        return BANGLA_TO_LATIN[char];
      }

      if (Object.prototype.hasOwnProperty.call(DEVANAGARI_TO_LATIN, char)) {
        return DEVANAGARI_TO_LATIN[char];
      }

      return char;
    })
    .join('');

  return transliterated
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/kh/g, 'k')
    .replace(/sh/g, 's')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const levenshteinDistance = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');

  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const matrix = new Array(b.length + 1);
  for (let row = 0; row <= b.length; row += 1) {
    matrix[row] = new Array(a.length + 1);
    matrix[row][0] = row;
  }

  for (let col = 0; col <= a.length; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row <= b.length; row += 1) {
    for (let col = 1; col <= a.length; col += 1) {
      const cost = a[col - 1] === b[row - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
};

const similarityFromDistance = (left, right) => {
  const l = String(left || '');
  const r = String(right || '');
  const maxLen = Math.max(l.length, r.length, 1);
  const distance = levenshteinDistance(l, r);
  return Math.max(0, 1 - distance / maxLen);
};

const buildAliasSet = (entry = {}) => {
  const aliases = new Set();
  const baseName = String(entry.name || '').trim();
  if (baseName) {
    aliases.add(baseName);
  }

  for (const alias of Array.isArray(entry.aliases) ? entry.aliases : []) {
    const value = String(alias || '').trim();
    if (value) aliases.add(value);
  }

  // misrecognitions are known bad STT outputs that must still resolve to this
  // entry; including them here means the existing fuzzy scorer handles them
  // without special-casing in every caller.
  for (const bad of Array.isArray(entry.misrecognitions) ? entry.misrecognitions : []) {
    const value = String(bad || '').trim();
    if (value) aliases.add(value);
  }

  return [...aliases];
};

const makeDictionary = ({ entries = [], type }) => {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const aliases = buildAliasSet(entry);
      if (!aliases.length) {
        return null;
      }

      const normalizedAliases = aliases.map((item) => normalizeText(item)).filter(Boolean);
      const phoneticAliases = aliases.map((item) => toPhonetic(item)).filter(Boolean);

      return {
        id: entry.id ?? null,
        type,
        name: aliases[0],
        aliases,
        normalizedAliases,
        phoneticAliases,
      };
    })
    .filter(Boolean);
};

const buildHotwordDictionary = ({ customers = [], products = [], branches = [] } = {}) => ({
  customers: makeDictionary({ entries: customers, type: 'customer' }),
  products: makeDictionary({ entries: products, type: 'product' }),
  branches: makeDictionary({ entries: branches, type: 'branch' }),
});

const scoreCandidate = ({ query, queryPhonetic, candidate }) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  let best = 0;

  for (const alias of candidate.normalizedAliases) {
    if (alias === normalizedQuery) {
      best = Math.max(best, 1);
      continue;
    }

    if (alias.startsWith(normalizedQuery) || normalizedQuery.startsWith(alias)) {
      best = Math.max(best, 0.93);
    }

    best = Math.max(best, similarityFromDistance(normalizedQuery, alias) * 0.9);
  }

  for (const phoneticAlias of candidate.phoneticAliases) {
    if (!queryPhonetic || !phoneticAlias) {
      continue;
    }

    if (phoneticAlias === queryPhonetic) {
      best = Math.max(best, 0.9);
      continue;
    }

    if (phoneticAlias.startsWith(queryPhonetic) || queryPhonetic.startsWith(phoneticAlias)) {
      best = Math.max(best, 0.85);
    }

    best = Math.max(best, similarityFromDistance(queryPhonetic, phoneticAlias) * 0.82);
  }

  return Math.min(1, best);
};

const findBestNameMatch = ({
  query,
  entries = [],
  minConfidence = 0.7,
  ambiguityDelta = 0.07,
  maxSuggestions = 3,
} = {}) => {
  const normalizedQuery = normalizeText(query);
  const queryPhonetic = toPhonetic(normalizedQuery);

  if (!normalizedQuery) {
    return {
      match: null,
      candidates: [],
      ambiguous: false,
      confidence: 0,
    };
  }

  const ranked = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      entry,
      score: scoreCandidate({ query: normalizedQuery, queryPhonetic, candidate: entry }),
    }))
    .filter((item) => item.score >= minConfidence)
    .sort((left, right) => right.score - left.score || String(left.entry.name).localeCompare(String(right.entry.name)));

  if (!ranked.length) {
    return {
      match: null,
      candidates: [],
      ambiguous: false,
      confidence: 0,
    };
  }

  const top = ranked[0];
  const second = ranked[1] || null;
  const ambiguous = Boolean(second && Math.abs(top.score - second.score) <= ambiguityDelta);

  return {
    match: {
      id: top.entry.id,
      name: top.entry.name,
      confidence: Number(top.score.toFixed(3)),
      type: top.entry.type,
    },
    candidates: ranked.slice(0, maxSuggestions).map((item) => ({
      id: item.entry.id,
      name: item.entry.name,
      confidence: Number(item.score.toFixed(3)),
      type: item.entry.type,
    })),
    ambiguous,
    confidence: Number(top.score.toFixed(3)),
  };
};

export {
  normalizeText,
  toPhonetic,
  levenshteinDistance,
  similarityFromDistance,
  buildHotwordDictionary,
  findBestNameMatch,
};
