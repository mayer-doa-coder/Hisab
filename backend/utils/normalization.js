const normalizeTrimmed = (value) => String(value || '').trim();

const normalizeEmail = (value) => normalizeTrimmed(value).toLowerCase();

const normalizePin = (value) => normalizeTrimmed(value);

const normalizeDeviceId = (value) => normalizeTrimmed(value);

const normalizeRole = (value, fallback = '') => {
  const normalized = normalizeTrimmed(value).toLowerCase();
  return normalized || String(fallback || '').trim().toLowerCase();
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return fallback;
};

module.exports = {
  normalizeTrimmed,
  normalizeEmail,
  normalizePin,
  normalizeDeviceId,
  normalizeRole,
  toBoolean,
};
