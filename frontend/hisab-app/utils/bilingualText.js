import bn from '../locales/bn';
import en from '../locales/en';

const BN_TO_EN = new Map();
const EN_TO_BN = new Map();

Object.keys(en).forEach((key) => {
  const enValue = typeof en[key] === 'string' ? en[key].trim() : '';
  const bnValue = typeof bn[key] === 'string' ? bn[key].trim() : '';
  if (!enValue || !bnValue) {
    return;
  }

  if (!BN_TO_EN.has(bnValue)) {
    BN_TO_EN.set(bnValue, enValue);
  }
  if (!EN_TO_BN.has(enValue)) {
    EN_TO_BN.set(enValue, bnValue);
  }
});

let runtimeLanguage = 'bn';

export const setRuntimeLanguage = (language) => {
  runtimeLanguage = language === 'en' ? 'en' : 'bn';
};

export const getRuntimeLanguage = () => runtimeLanguage;

export const toLocalizedUiText = (value, language = runtimeLanguage) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return value;
  }

  if (language === 'en') {
    return BN_TO_EN.get(text) || value;
  }

  return EN_TO_BN.get(text) || value;
};

const LATIN_TO_BN = Object.freeze({
  a: 'আ',
  b: 'ব',
  c: 'ক',
  d: 'দ',
  e: 'এ',
  f: 'ফ',
  g: 'গ',
  h: 'হ',
  i: 'ই',
  j: 'জ',
  k: 'ক',
  l: 'ল',
  m: 'ম',
  n: 'ন',
  o: 'ও',
  p: 'প',
  q: 'ক',
  r: 'র',
  s: 'স',
  t: 'ত',
  u: 'উ',
  v: 'ভ',
  w: 'ও',
  x: 'ক্স',
  y: 'ই',
  z: 'জ',
});

const BN_TO_LATIN = Object.freeze({
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
  'চ': 'c',
  'ছ': 'ch',
  'জ': 'j',
  'ঝ': 'jh',
  'ঞ': 'n',
  'ট': 't',
  'ঠ': 'th',
  'ড': 'd',
  'ঢ': 'dh',
  'ণ': 'n',
  'ত': 't',
  'থ': 'th',
  'দ': 'd',
  'ধ': 'dh',
  'ন': 'n',
  'প': 'p',
  'ফ': 'f',
  'ব': 'b',
  'ভ': 'v',
  'ম': 'm',
  'য': 'y',
  'র': 'r',
  'ল': 'l',
  'শ': 'sh',
  'ষ': 'sh',
  'স': 's',
  'হ': 'h',
  'ড়': 'r',
  'ঢ়': 'rh',
  'য়': 'y',
  'ং': 'ng',
  'ঃ': 'h',
  'ঁ': 'n',
});

const hasBanglaChars = (value) => /[\u0980-\u09FF]/.test(String(value || ''));
const hasLatinChars = (value) => /[A-Za-z]/.test(String(value || ''));

export const localizePersonName = (value, language = runtimeLanguage) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (language === 'bn') {
    if (hasBanglaChars(text) || !hasLatinChars(text)) {
      return text;
    }
    return text
      .split('')
      .map((char) => {
        const lower = char.toLowerCase();
        return LATIN_TO_BN[lower] || char;
      })
      .join('');
  }

  if (!hasBanglaChars(text)) {
    return text;
  }

  return text
    .split('')
    .map((char) => BN_TO_LATIN[char] || char)
    .join('');
};
