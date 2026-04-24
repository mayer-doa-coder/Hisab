const WEEKDAY_MAP = Object.freeze({
  robibar: 0,
  sunday: 0,
  shombar: 1,
  sombar: 1,
  monday: 1,
  mongolbar: 2,
  tuesday: 2,
  budhbar: 3,
  wednesday: 3,
  brihospotibar: 4,
  brihoshpotibar: 4,
  thursday: 4,
  shukrobar: 5,
  friday: 5,
  shonibar: 6,
  saturday: 6,
});

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
    .replace(/[^\p{L}\p{M}\p{N}\s/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDigits = (value) =>
  String(value || '')
    .split('')
    .map((char) => (Object.prototype.hasOwnProperty.call(BANGLA_DIGIT_MAP, char) ? BANGLA_DIGIT_MAP[char] : char))
    .join('');

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const withUtcDate = (year, monthIndex, day) => {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== monthIndex
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const parseRelativeDate = (normalized, now = new Date()) => {
  if (normalized.includes('aj') || normalized.includes('আজ')) {
    return {
      date: toIsoDate(now),
      confidence: 1,
      source: 'relative',
    };
  }

  if (normalized.includes('kal') || normalized.includes('কাল')) {
    const tomorrow = new Date(now.getTime());
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return {
      date: toIsoDate(tomorrow),
      confidence: 1,
      source: 'relative',
    };
  }

  return null;
};

const parseWeekday = (normalized, now = new Date()) => {
  const tokens = normalized.split(' ');
  for (const token of tokens) {
    if (!Object.prototype.hasOwnProperty.call(WEEKDAY_MAP, token)) {
      continue;
    }

    const targetDay = WEEKDAY_MAP[token];
    const currentDay = now.getUTCDay();
    let delta = targetDay - currentDay;
    if (delta <= 0) {
      delta += 7;
    }

    const date = new Date(now.getTime());
    date.setUTCDate(date.getUTCDate() + delta);

    return {
      date: toIsoDate(date),
      confidence: 0.9,
      source: 'weekday',
    };
  }

  return null;
};

const parseExplicitDate = (normalized, now = new Date()) => {
  const digitNormalized = normalizeDigits(normalized);

  const isoMatch = digitNormalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = withUtcDate(year, month - 1, day);
    if (date) {
      return {
        date: toIsoDate(date),
        confidence: 0.95,
        source: 'explicit',
      };
    }
  }

  const dayMonthMatch = digitNormalized.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const month = Number(dayMonthMatch[2]);
    const currentYear = now.getUTCFullYear();

    let date = withUtcDate(currentYear, month - 1, day);
    if (date && date.getTime() < now.getTime()) {
      date = withUtcDate(currentYear + 1, month - 1, day);
    }

    if (date) {
      return {
        date: toIsoDate(date),
        confidence: 0.87,
        source: 'explicit',
      };
    }
  }

  const tarikhMatch = digitNormalized.match(/(?:^|\s)(\d{1,2})\s*(tarikh|তারিখ)(?:\s|$)/u);
  if (tarikhMatch) {
    const day = Number(tarikhMatch[1]);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    let date = withUtcDate(year, month, day);
    if (date && date.getTime() < now.getTime()) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      date = withUtcDate(nextYear, nextMonth, day);
    }

    if (date) {
      return {
        date: toIsoDate(date),
        confidence: 0.84,
        source: 'explicit',
      };
    }
  }

  return null;
};

const parseDate = (text, now = new Date()) => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      date: null,
      confidence: 0,
      source: null,
    };
  }

  const relative = parseRelativeDate(normalized, now);
  if (relative) {
    return relative;
  }

  const weekday = parseWeekday(normalized, now);
  if (weekday) {
    return weekday;
  }

  const explicit = parseExplicitDate(normalized, now);
  if (explicit) {
    return explicit;
  }

  return {
    date: null,
    confidence: 0,
    source: null,
  };
};

export {
  parseDate,
  normalizeDigits,
  normalizeText,
};
