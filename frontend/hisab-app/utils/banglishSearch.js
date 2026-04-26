// Lightweight Banglish → Bengali phonetic search
// Converts common Latin transliterations so users can type "rahim" to find "রহিম"

// Multi-char mappings must come before single-char (order matters)
const MAP = [
  // digraphs
  ['kh', 'খ'], ['gh', 'ঘ'], ['chh', 'ছ'], ['ch', 'চ'], ['jh', 'ঝ'],
  ['th', 'থ'], ['dh', 'ধ'], ['ph', 'ফ'], ['bh', 'ভ'], ['sh', 'শ'],
  ['ng', 'ং'], ['aa', 'আ'], ['ee', 'ই'], ['oo', 'উ'],
  // single consonants
  ['k', 'ক'], ['g', 'গ'], ['c', 'ক'], ['j', 'জ'],
  ['t', 'ত'], ['d', 'দ'], ['n', 'ন'], ['p', 'প'],
  ['f', 'ফ'], ['b', 'ব'], ['m', 'ম'], ['y', 'য'],
  ['r', 'র'], ['l', 'ল'], ['s', 'স'], ['h', 'হ'],
  ['w', 'ও'], ['z', 'জ'],
  // vowels (standalone use)
  ['a', 'া'], ['i', 'ি'], ['u', 'ু'], ['e', 'ে'], ['o', 'ো'],
];

// Build a fast lookup from the map
const buildPattern = (raw) => {
  if (!raw) return null;
  const input = raw.toLowerCase().trim();
  if (!input) return null;

  // Try to transliterate
  let transliterated = '';
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const [latin, bn] of MAP) {
      if (input.startsWith(latin, i)) {
        transliterated += bn;
        i += latin.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      transliterated += input[i];
      i++;
    }
  }

  return transliterated;
};

export const banglishMatch = (query, target) => {
  if (!query || !target) return false;
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();

  // Direct match (works for Bengali input too)
  if (t.includes(q)) return true;

  // Transliterated match
  const bn = buildPattern(q);
  if (bn && bn !== q && t.includes(bn)) return true;

  return false;
};
