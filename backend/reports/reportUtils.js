const mongoose = require('mongoose');

const PERIOD_ALIASES = Object.freeze({
  day: 'daily',
  daily: 'daily',
  week: 'weekly',
  weekly: 'weekly',
  month: 'monthly',
  monthly: 'monthly',
});

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => Number(toNumber(value, 0).toFixed(2));

const parseDateInput = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const normalizePeriod = (value) => {
  const token = String(value || 'daily').trim().toLowerCase();
  return PERIOD_ALIASES[token] || null;
};

const startOfUtcDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const endOfUtcDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
};

const startOfUtcWeek = (date) => {
  const value = startOfUtcDay(date);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value;
};

const endOfUtcWeek = (date) => {
  const start = startOfUtcWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const startOfUtcMonth = (date) => {
  const value = new Date(date);
  value.setUTCDate(1);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const endOfUtcMonth = (date) => {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + 1, 0);
  value.setUTCHours(23, 59, 59, 999);
  return value;
};

const resolveDateRange = ({ period, from, to }) => {
  const now = new Date();
  const normalizedPeriod = normalizePeriod(period) || 'daily';

  let start = parseDateInput(from);
  let end = parseDateInput(to);

  if (!start && !end) {
    if (normalizedPeriod === 'daily') {
      start = startOfUtcDay(now);
      end = endOfUtcDay(now);
    } else if (normalizedPeriod === 'weekly') {
      start = startOfUtcWeek(now);
      end = endOfUtcWeek(now);
    } else {
      start = startOfUtcMonth(now);
      end = endOfUtcMonth(now);
    }
  } else if (start && !end) {
    end = endOfUtcDay(start);
    start = startOfUtcDay(start);
  } else if (!start && end) {
    start = startOfUtcDay(end);
    end = endOfUtcDay(end);
  }

  if (start > end) {
    const temp = start;
    start = startOfUtcDay(end);
    end = endOfUtcDay(temp);
  }

  return {
    period: normalizedPeriod,
    from: start,
    to: end,
  };
};

const buildDateRangeMatch = ({ from, to }) => {
  const match = {};
  if (from) {
    match.$gte = from;
  }
  if (to) {
    match.$lte = to;
  }
  return Object.keys(match).length ? match : null;
};

const getBucketFormat = (period) => {
  if (period === 'weekly') {
    return '%Y-%U';
  }

  if (period === 'monthly') {
    return '%Y-%m';
  }

  return '%Y-%m-%d';
};

const getBucketExpression = (dateField, period) => {
  return {
    $dateToString: {
      format: getBucketFormat(period),
      date: `$${dateField}`,
      timezone: 'UTC',
    },
  };
};

const modelHasPath = (Model, path) => Boolean(Model?.schema?.path(path));

const buildScopedMatch = (Model, { userId, branchId = null } = {}) => {
  const match = {
    userId,
  };

  if (branchId && modelHasPath(Model, 'branchId')) {
    match.branchId = branchId;
  }

  if (modelHasPath(Model, 'isArchived')) {
    match.isArchived = { $ne: true };
  }

  if (modelHasPath(Model, 'deletedAt')) {
    match.deletedAt = null;
  }

  return match;
};

const toObjectIdIfPossible = (value) => {
  if (!value) {
    return null;
  }

  const asString = String(value);
  return mongoose.Types.ObjectId.isValid(asString) ? new mongoose.Types.ObjectId(asString) : asString;
};

const isReconciled = (delta, tolerance = 0.01) => Math.abs(toNumber(delta, 0)) <= tolerance;

const formatRangeForResponse = ({ from, to, period }) => ({
  period,
  from: from ? from.toISOString() : null,
  to: to ? to.toISOString() : null,
});

module.exports = {
  normalizePeriod,
  parseDateInput,
  resolveDateRange,
  buildDateRangeMatch,
  getBucketExpression,
  buildScopedMatch,
  toObjectIdIfPossible,
  toNumber,
  roundCurrency,
  isReconciled,
  formatRangeForResponse,
  startOfUtcDay,
  endOfUtcDay,
};
