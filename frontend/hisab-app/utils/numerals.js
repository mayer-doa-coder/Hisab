/**
 * numerals.js — Bengali/English numeral conversion and locale-aware formatting.
 *
 * Bangladesh uses the Indian number system (lakh/crore grouping) and Bengali
 * script digits (০–৯). Every number, currency value, and date displayed in
 * the UI must pass through this module when the active language is 'bn'.
 *
 * Zero external dependencies. Pure functions only — safe to call from any context.
 */

// ── Digit maps ────────────────────────────────────────────────────────────────

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const BN_MONTHS_SHORT = [
  'জান', 'ফেব', 'মার্চ', 'এপ্রি', 'মে', 'জুন',
  'জুল', 'আগ', 'সেপ', 'অক্টো', 'নভে', 'ডিসে',
];

const EN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const BN_DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

// ── Digit conversion ──────────────────────────────────────────────────────────

/**
 * Converts any ASCII digit characters (0–9) in a string to Bengali script.
 * Non-digit characters (including ৳, ,, ., -, spaces) are preserved.
 *
 * @example toBengaliDigits('123') → '১২৩'
 * @example toBengaliDigits('৳1,234.50') → '৳১,২৩৪.৫০'
 */
export const toBengaliDigits = (str) =>
  String(str).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

/**
 * Converts Bengali script digits back to ASCII digits.
 * Non-Bengali-digit characters are preserved.
 */
export const toAsciiDigits = (str) =>
  String(str).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

// ── Number formatting (India/Bangladesh lakh-crore grouping) ──────────────────

/**
 * Groups an integer string using the Indian number system.
 * Last 3 digits are grouped together, then groups of 2 from the right.
 *
 * @example groupIndian('1234567') → '12,34,567'
 * @example groupIndian('12345') → '12,345'
 * @example groupIndian('999') → '999'
 */
const groupIndian = (intStr) => {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${last3}`;
};

/**
 * Formats a number with locale-aware digit grouping.
 * Uses Indian system (lakh/crore) for both languages, with Bengali digits when 'bn'.
 *
 * @param {number|string} value
 * @param {'bn'|'en'} language
 * @param {number} decimals  — decimal places (default 0)
 * @returns {string}
 *
 * @example formatNumber(1234567, 'bn') → '১২,৩৪,৫৬৭'
 * @example formatNumber(1234567, 'en') → '12,34,567'
 * @example formatNumber(1234.5, 'bn', 2) → '১,২৩৪.৫০'
 */
export const formatNumber = (value, language = 'en', decimals = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return language === 'bn' ? '০' : '0';

  const negative = num < 0;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  const grouped = groupIndian(intPart);
  const full = decimals > 0 && decPart ? `${grouped}.${decPart}` : grouped;
  const result = negative ? `-${full}` : full;

  return language === 'bn' ? toBengaliDigits(result) : result;
};

// ── Currency formatting ───────────────────────────────────────────────────────

/**
 * Formats a BDT (Bangladeshi Taka) amount with the ৳ symbol.
 * Numbers use Indian grouping and Bengali digits when 'bn' is active.
 *
 * @param {number|string} value
 * @param {'bn'|'en'} language
 * @param {number} decimals  — default 2
 * @returns {string}
 *
 * @example formatCurrency(123456, 'bn') → '৳১,২৩,৪৫৬.০০'
 * @example formatCurrency(123456, 'en') → '৳1,23,456.00'
 * @example formatCurrency(-500, 'bn', 0) → '-৳৫০০'
 */
export const formatCurrency = (value, language = 'en', decimals = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '৳0';

  const negative = num < 0;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  const grouped = groupIndian(intPart);
  const full = decimals > 0 && decPart ? `${grouped}.${decPart}` : grouped;
  const result = negative ? `-৳${full}` : `৳${full}`;

  return language === 'bn' ? toBengaliDigits(result) : result;
};

/**
 * Short currency format — rounds large amounts for display in KPI tiles.
 * > 10,00,000 → ৳X০ লক্ষ / ৳X0L
 * > 1,000    → ৳X হাজার / ৳XK
 *
 * @param {number|string} value
 * @param {'bn'|'en'} language
 * @returns {string}
 */
export const formatCurrencyShort = (value, language = 'en') => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '৳0';

  const abs = Math.abs(num);
  const negative = num < 0 ? '-' : '';

  if (abs >= 10_00_000) {
    const lakhs = (abs / 1_00_000).toFixed(1);
    const suffix = language === 'bn' ? ' লক্ষ' : 'L';
    return language === 'bn'
      ? `${negative}৳${toBengaliDigits(lakhs)}${suffix}`
      : `${negative}৳${lakhs}${suffix}`;
  }

  if (abs >= 1_000) {
    const thousands = (abs / 1_000).toFixed(1);
    const suffix = language === 'bn' ? ' হাজার' : 'K';
    return language === 'bn'
      ? `${negative}৳${toBengaliDigits(thousands)}${suffix}`
      : `${negative}৳${thousands}${suffix}`;
  }

  return formatCurrency(value, language, 0);
};

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Formats a Date (or ISO string) into a locale-appropriate string.
 *
 * @param {Date|string|number} date
 * @param {'bn'|'en'} language
 * @param {'short'|'long'|'numeric'|'monthYear'} style
 * @returns {string}
 *
 * @example formatDate(new Date(), 'bn', 'long')  → '৩০ মে ২০২৬'
 * @example formatDate(new Date(), 'en', 'long')  → '30 May 2026'
 * @example formatDate(new Date(), 'bn', 'short') → '৩০/০৫/২০২৬'
 * @example formatDate(new Date(), 'bn', 'monthYear') → 'মে ২০২৬'
 */
export const formatDate = (date, language = 'en', style = 'short') => {
  const d = date instanceof Date ? date : new Date(date);
  if (!d || isNaN(d.getTime())) return language === 'bn' ? 'অজানা তারিখ' : 'Unknown date';

  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  const dayOfWeek = d.getDay();

  const pad = (n) => String(n).padStart(2, '0');

  switch (style) {
    case 'long': {
      const monthName = language === 'bn' ? BN_MONTHS[month] : EN_MONTHS[month];
      const result = `${day} ${monthName} ${year}`;
      return language === 'bn' ? toBengaliDigits(result) : result;
    }
    case 'shortMonth': {
      const monthName = language === 'bn' ? BN_MONTHS_SHORT[month] : EN_MONTHS_SHORT[month];
      const result = `${day} ${monthName}`;
      return language === 'bn' ? toBengaliDigits(result) : result;
    }
    case 'monthYear': {
      const monthName = language === 'bn' ? BN_MONTHS[month] : EN_MONTHS[month];
      const result = `${monthName} ${year}`;
      return language === 'bn' ? toBengaliDigits(result) : result;
    }
    case 'dayName': {
      return language === 'bn' ? BN_DAYS[dayOfWeek] : d.toLocaleDateString('en-US', { weekday: 'long' });
    }
    case 'numeric':
      return language === 'bn'
        ? toBengaliDigits(`${pad(day)}/${pad(month + 1)}/${year}`)
        : `${pad(day)}/${pad(month + 1)}/${year}`;
    case 'short':
    default:
      return language === 'bn'
        ? toBengaliDigits(`${pad(day)}/${pad(month + 1)}/${year}`)
        : `${pad(day)}/${pad(month + 1)}/${year}`;
  }
};

/**
 * Formats a date as a relative human-readable string.
 *
 * @example formatRelativeDate(yesterday, 'bn') → 'গতকাল'
 * @example formatRelativeDate(3daysAgo, 'en') → '3 days ago'
 */
export const formatRelativeDate = (date, language = 'en') => {
  const d = date instanceof Date ? date : new Date(date);
  if (!d || isNaN(d.getTime())) return language === 'bn' ? 'অজানা' : 'Unknown';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return language === 'bn' ? 'আজ' : 'Today';
  if (diffDays === 1) return language === 'bn' ? 'গতকাল' : 'Yesterday';
  if (diffDays < 7) {
    const n = language === 'bn' ? toBengaliDigits(String(diffDays)) : String(diffDays);
    return language === 'bn' ? `${n} দিন আগে` : `${n} days ago`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    const n = language === 'bn' ? toBengaliDigits(String(weeks)) : String(weeks);
    return language === 'bn' ? `${n} সপ্তাহ আগে` : `${n} weeks ago`;
  }

  return formatDate(d, language, 'shortMonth');
};

// ── Due date helpers ──────────────────────────────────────────────────────────

/**
 * Returns a human-readable overdue/due-in string for baki entries.
 *
 * @param {Date|string} dueDate
 * @param {'bn'|'en'} language
 * @returns {{ label: string, isOverdue: boolean, daysRemaining: number }}
 */
export const formatDueStatus = (dueDate, language = 'en') => {
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (!d || isNaN(d.getTime())) {
    return { label: language === 'bn' ? 'তারিখ নেই' : 'No date', isOverdue: false, daysRemaining: 0 };
  }

  const now = new Date();
  // Compare date only (strip time)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const n = language === 'bn' ? toBengaliDigits(String(Math.abs(diffDays))) : String(Math.abs(diffDays));
    return {
      label: language === 'bn' ? `${n} দিন বকেয়া` : `${n}d overdue`,
      isOverdue: true,
      daysRemaining: diffDays,
    };
  }
  if (diffDays === 0) {
    return {
      label: language === 'bn' ? 'আজ শেষ' : 'Due today',
      isOverdue: false,
      daysRemaining: 0,
    };
  }
  if (diffDays === 1) {
    return {
      label: language === 'bn' ? 'আগামীকাল' : 'Due tomorrow',
      isOverdue: false,
      daysRemaining: 1,
    };
  }

  const n = language === 'bn' ? toBengaliDigits(String(diffDays)) : String(diffDays);
  return {
    label: language === 'bn' ? `${n} দিনে` : `In ${n}d`,
    isOverdue: false,
    daysRemaining: diffDays,
  };
};

// ── Percentage formatting ─────────────────────────────────────────────────────

/**
 * @example formatPercent(0.8543, 'bn') → '৮৫.৪%'
 * @example formatPercent(0.8543, 'en') → '85.4%'
 */
export const formatPercent = (ratio, language = 'en', decimals = 1) => {
  const pct = (Number(ratio) * 100).toFixed(decimals);
  return language === 'bn' ? `${toBengaliDigits(pct)}%` : `${pct}%`;
};

// ── Input sanitization ────────────────────────────────────────────────────────

/**
 * Normalises a user-typed amount string to a JavaScript-parseable number string.
 * Accepts both Bengali and ASCII digits, commas, and decimal points.
 *
 * @example normalizeAmountInput('১,২৩৪.৫০') → '1234.50'
 * @example normalizeAmountInput('1,234.50')  → '1234.50'
 */
export const normalizeAmountInput = (raw) =>
  toAsciiDigits(String(raw)).replace(/,/g, '');
