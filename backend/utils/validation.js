const isString = (value) => typeof value === 'string';

const normalizeTrimmedString = (value) => {
  if (!isString(value)) {
    return '';
  }

  return value.trim();
};

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseNonNegativeInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

const parseMoney = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  const rounded = Math.round((parsed + Number.EPSILON) * 100) / 100;
  return Number(rounded.toFixed(2));
};

const parseIsoDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

const isValidEmail = (value) => EMAIL_REGEX.test(String(value || '').trim().toLowerCase());
const isValidPhone = (value) => PHONE_REGEX.test(String(value || '').trim());

module.exports = {
  normalizeTrimmedString,
  parsePositiveInt,
  parseNonNegativeInt,
  parseMoney,
  parseIsoDate,
  parseBoolean,
  isValidEmail,
  isValidPhone,
};
