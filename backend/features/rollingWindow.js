const toDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const toIso = (value) => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const sortRowsByTimestampAsc = (rows = []) => {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.timestamp || left.occurred_at || left.occurredAt || 0).getTime();
    const rightTime = new Date(right.timestamp || right.occurred_at || right.occurredAt || 0).getTime();
    return leftTime - rightTime;
  });
};

const filterRowsUpToTimestamp = (rows = [], anchorTimestamp) => {
  const anchor = toDate(anchorTimestamp);
  if (!anchor) {
    return [];
  }

  const anchorMs = anchor.getTime();
  return rows.filter((row) => {
    const ts = new Date(row.timestamp || row.occurred_at || row.occurredAt || 0).getTime();
    return Number.isFinite(ts) && ts <= anchorMs;
  });
};

const getRowsInRollingWindow = ({ rows = [], anchorTimestamp, windowDays = 7 } = {}) => {
  const anchor = toDate(anchorTimestamp);
  if (!anchor) {
    return [];
  }

  const dayCount = Math.max(1, Math.trunc(Number(windowDays) || 1));
  const startMs = anchor.getTime() - (dayCount * 24 * 60 * 60 * 1000);

  return filterRowsUpToTimestamp(rows, anchor)
    .filter((row) => {
      const ts = new Date(row.timestamp || row.occurred_at || row.occurredAt || 0).getTime();
      return Number.isFinite(ts) && ts >= startMs;
    });
};

const buildRollingWindowSlices = ({ rows = [], anchorTimestamp, windows = [7, 30] } = {}) => {
  const output = {};
  for (const windowDays of windows) {
    const key = `window_${Math.max(1, Math.trunc(Number(windowDays) || 1))}d`;
    output[key] = getRowsInRollingWindow({
      rows,
      anchorTimestamp,
      windowDays,
    });
  }

  return output;
};

module.exports = {
  toIso,
  sortRowsByTimestampAsc,
  filterRowsUpToTimestamp,
  getRowsInRollingWindow,
  buildRollingWindowSlices,
};
