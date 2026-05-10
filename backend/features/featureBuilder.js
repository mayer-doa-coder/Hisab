const {
  toIso,
  sortRowsByTimestampAsc,
  buildRollingWindowSlices,
} = require('./rollingWindow');
const { computeQueueFeatures } = require('./queueFeatures');

const DEFAULT_WINDOWS = Object.freeze([7, 30]);
const FEATURE_WINDOW_CONFIG = Object.freeze({
  short_velocity_days: 7,
  long_velocity_days: 30,
  volatility_days: 30,
});

const SHARED_FEATURE_PAYLOAD_SCHEMA = Object.freeze({
  sales_velocity: 'number',
  stock_position: 'number',
  lead_time: 'number',
  volatility: 'number',
  queue_pressure: 'number',
});

const SHARED_FEATURE_DEFINITIONS = Object.freeze({
  sales_velocity: {
    formula: '((2 * velocity_7d) + velocity_30d) / 3',
    inputs: ['sales_rows[].units_sold|quantity|demand|volume', 'anchor_timestamp'],
    windows: ['7d', '30d'],
    data_type: 'number',
    notes: 'Weighted toward recent demand while retaining a medium-horizon signal.',
  },
  stock_position: {
    formula: 'current_inventory / max(sales_velocity, 1e-6)',
    inputs: ['current_inventory', 'sales_velocity'],
    windows: ['point_in_time'],
    data_type: 'number',
    notes: 'Represents inventory coverage in days; higher means more buffer.',
  },
  lead_time: {
    formula: 'lead_time_days + supplier_delay_estimate',
    inputs: ['lead_time_days', 'supplier_delay_estimate'],
    windows: ['point_in_time'],
    data_type: 'number',
    notes: 'Combined restock latency including baseline supplier delay estimate.',
  },
  volatility: {
    formula: 'stddev(sales_rows_30d)',
    inputs: ['sales_rows[].units_sold|quantity|demand|volume', 'anchor_timestamp'],
    windows: ['30d'],
    data_type: 'number',
    notes: 'Demand variation proxy computed from the 30-day sales window.',
  },
  queue_pressure: {
    formula: '(backlog_orders + pending_demand) / max(supply_capacity, 1)',
    inputs: ['backlog_orders', 'pending_demand', 'supply_capacity', 'queue_features.congestion'],
    windows: ['point_in_time', '7d fallback from market rows'],
    data_type: 'number',
    notes: 'Load vs supply pressure; congestion fallback is used if backlog inputs are unavailable.',
  },
});

const SHARED_FEATURE_CONTRACT = Object.freeze({
  contract_name: 'shared_feature_payload',
  contract_version: 'shared_feature_payload_v1',
  locked: true,
  deterministic: true,
  schema: SHARED_FEATURE_PAYLOAD_SCHEMA,
  windows: FEATURE_WINDOW_CONFIG,
  definitions: SHARED_FEATURE_DEFINITIONS,
});

const FEATURE_KEYS = Object.freeze([
  'sales_velocity',
  'stock_position',
  'lead_time',
  'volatility',
  'queue_pressure',
]);

const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const safeDivide = (numerator, denominator, fallback = NaN) => {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d === 0) {
    return fallback;
  }

  const n = Number(numerator);
  if (!Number.isFinite(n)) {
    return fallback;
  }

  return n / d;
};

const avg = (values = []) => {
  const safeValues = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value))
    : [];

  if (safeValues.length === 0) {
    return NaN;
  }

  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
};

const stddev = (values = []) => {
  const safeValues = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value))
    : [];

  if (safeValues.length <= 1) {
    return safeValues.length === 1 ? 0 : NaN;
  }

  const mean = avg(safeValues);
  const variance = safeValues.reduce((sum, value) => {
    const delta = value - mean;
    return sum + (delta * delta);
  }, 0) / safeValues.length;

  return Math.sqrt(Math.max(0, variance));
};

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  return Number(Number(value).toFixed(6));
};

const normalizeTimestamp = (value) => {
  const iso = toIso(value);
  return iso || null;
};

const normalizeNumericSeriesRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalized = [];

  for (let index = 0; index < safeRows.length; index += 1) {
    const row = safeRows[index];

    if (typeof row === 'number' && Number.isFinite(row)) {
      normalized.push({
        timestamp: null,
        value: Number(row),
      });
      continue;
    }

    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }

    const value = toNumber(
      row.units_sold
      ?? row.quantity
      ?? row.demand
      ?? row.volume
      ?? row.value,
      NaN
    );

    if (!Number.isFinite(value)) {
      continue;
    }

    const timestamp = normalizeTimestamp(
      row.timestamp
      ?? row.occurred_at
      ?? row.occurredAt
      ?? row.t
    );

    normalized.push({
      timestamp,
      value,
    });
  }

  return normalized;
};

const selectRowsInWindow = ({ rows = [], anchorTimestamp = null, windowDays = 30 } = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeWindow = Math.max(1, Math.trunc(Number(windowDays) || 1));
  const anchor = normalizeTimestamp(anchorTimestamp);
  if (!anchor) {
    return safeRows;
  }

  const anchorMs = new Date(anchor).getTime();
  const startMs = anchorMs - (safeWindow * 24 * 60 * 60 * 1000);

  return safeRows.filter((row) => {
    if (!row?.timestamp) {
      return true;
    }
    const ts = new Date(row.timestamp).getTime();
    return Number.isFinite(ts) && ts >= startMs && ts <= anchorMs;
  });
};

const inferSalesRowsFromMarketRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => ({
    timestamp: normalizeTimestamp(row?.timestamp ?? row?.occurred_at ?? row?.occurredAt),
    units_sold: Number.isFinite(Number(row?.units_sold))
      ? Number(row.units_sold)
      : Number(row?.volume || 0),
  }));
};

const normalizeWindows = (windows) => {
  if (!Array.isArray(windows) || windows.length === 0) {
    return [...DEFAULT_WINDOWS];
  }

  const unique = new Set();
  for (const value of windows) {
    const windowDays = Math.max(1, Math.trunc(Number(value) || 0));
    if (windowDays > 0) {
      unique.add(windowDays);
    }
  }

  return unique.size > 0 ? [...unique] : [...DEFAULT_WINDOWS];
};

const buildFeatures = (rawData = {}) => {
  const marketRows = sortRowsByTimestampAsc(Array.isArray(rawData?.market_rows) ? rawData.market_rows : []);
  const sourceSalesRows = Array.isArray(rawData?.sales_rows)
    ? rawData.sales_rows
    : inferSalesRowsFromMarketRows(marketRows);

  const normalizedSalesRows = normalizeNumericSeriesRows(sourceSalesRows);

  const fallbackAnchor = marketRows[marketRows.length - 1]?.timestamp
    || normalizedSalesRows[normalizedSalesRows.length - 1]?.timestamp
    || null;

  const anchorTimestamp = normalizeTimestamp(
    rawData?.anchor_timestamp
    ?? rawData?.anchorTimestamp
    ?? rawData?.as_of
    ?? rawData?.asOf
    ?? fallbackAnchor
  );

  const velocityRows7d = selectRowsInWindow({
    rows: normalizedSalesRows,
    anchorTimestamp,
    windowDays: FEATURE_WINDOW_CONFIG.short_velocity_days,
  });
  const velocityRows30d = selectRowsInWindow({
    rows: normalizedSalesRows,
    anchorTimestamp,
    windowDays: FEATURE_WINDOW_CONFIG.long_velocity_days,
  });

  const sum7d = velocityRows7d.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const sum30d = velocityRows30d.reduce((sum, row) => sum + Number(row.value || 0), 0);

  const velocity7d = safeDivide(sum7d, FEATURE_WINDOW_CONFIG.short_velocity_days, NaN);
  const velocity30d = safeDivide(sum30d, FEATURE_WINDOW_CONFIG.long_velocity_days, NaN);

  const salesVelocity = Number.isFinite(velocity7d) || Number.isFinite(velocity30d)
    ? ((2 * (Number.isFinite(velocity7d) ? velocity7d : 0)) + (Number.isFinite(velocity30d) ? velocity30d : 0)) / 3
    : NaN;

  const inventoryLevel = toNumber(
    rawData?.current_inventory
    ?? rawData?.inventory_level
    ?? rawData?.stock_level,
    NaN
  );
  const stockPosition = Number.isFinite(inventoryLevel)
    ? safeDivide(inventoryLevel, Math.max(Number(salesVelocity) || 0, 1e-6), NaN)
    : NaN;

  const leadTimeDays = toNumber(rawData?.lead_time_days ?? rawData?.lead_time, NaN);
  const supplierDelay = toNumber(
    rawData?.supplier_delay_estimate
    ?? rawData?.supplier_delay_days
    ?? rawData?.supplier_delay,
    0
  );
  const leadTime = Number.isFinite(leadTimeDays)
    ? Math.max(0, leadTimeDays + Math.max(0, Number.isFinite(supplierDelay) ? supplierDelay : 0))
    : NaN;

  const volatilityRows = selectRowsInWindow({
    rows: normalizedSalesRows,
    anchorTimestamp,
    windowDays: FEATURE_WINDOW_CONFIG.volatility_days,
  });
  const volatility = stddev(volatilityRows.map((row) => row.value));

  const queueFeatureInput = rawData?.queue_features && typeof rawData.queue_features === 'object'
    ? rawData.queue_features
    : computeQueueFeatures({
      rows: marketRows,
      windowDays: FEATURE_WINDOW_CONFIG.short_velocity_days,
    });

  const backlogOrders = Math.max(0, toNumber(rawData?.backlog_orders, NaN));
  const pendingDemand = Math.max(0, toNumber(rawData?.pending_demand, NaN));
  const supplyCapacity = Math.max(0, toNumber(rawData?.supply_capacity, NaN));

  const queuePressureByLoad = Number.isFinite(backlogOrders)
    || Number.isFinite(pendingDemand)
    || Number.isFinite(supplyCapacity)
    ? safeDivide(
      (Number.isFinite(backlogOrders) ? backlogOrders : 0)
      + (Number.isFinite(pendingDemand) ? pendingDemand : 0),
      Math.max(1, Number.isFinite(supplyCapacity) ? supplyCapacity : 1),
      NaN
    )
    : NaN;

  const queuePressureBySignals = Number.isFinite(toNumber(queueFeatureInput?.congestion, NaN))
    ? clamp(
      (0.7 * Math.max(0, toNumber(queueFeatureInput?.congestion, 0)))
      + (0.2 * Math.abs(toNumber(queueFeatureInput?.imbalance_pressure, 0)))
      + (0.1 * Math.max(0, toNumber(queueFeatureInput?.spread_stress, 0))),
      0,
      100
    )
    : NaN;

  const queuePressure = Number.isFinite(queuePressureByLoad)
    ? queuePressureByLoad
    : queuePressureBySignals;

  return {
    sales_velocity: roundSix(Math.max(0, salesVelocity)),
    stock_position: roundSix(Math.max(0, stockPosition)),
    lead_time: roundSix(Math.max(0, leadTime)),
    volatility: roundSix(Math.max(0, volatility)),
    queue_pressure: roundSix(Math.max(0, queuePressure)),
  };
};

const buildLagSafeFeatureSet = ({
  rows = [],
  anchorTimestamp,
  windows = DEFAULT_WINDOWS,
} = {}) => {
  const anchorIso = toIso(anchorTimestamp);
  if (!anchorIso) {
    return {
      anchor_timestamp: null,
      windows: {},
      selected_window: null,
      selected_features: null,
    };
  }

  const normalizedWindows = normalizeWindows(windows);
  const orderedRows = sortRowsByTimestampAsc(rows);

  const windowSlices = buildRollingWindowSlices({
    rows: orderedRows,
    anchorTimestamp: anchorIso,
    windows: normalizedWindows,
  });

  const engineered = {};
  for (const windowDays of normalizedWindows) {
    const key = `window_${windowDays}d`;
    const sliceRows = windowSlices[key] || [];
    engineered[key] = computeQueueFeatures({
      rows: sliceRows,
      windowDays,
    });
  }

  const selectedWindowDays = normalizedWindows.includes(30)
    ? 30
    : normalizedWindows[normalizedWindows.length - 1];
  const selectedKey = `window_${selectedWindowDays}d`;
  const selectedRows = windowSlices[selectedKey] || [];
  const selectedQueueFeatures = engineered[selectedKey] || null;
  const selectedSharedFeatures = buildFeatures({
    market_rows: selectedRows,
    sales_rows: inferSalesRowsFromMarketRows(selectedRows),
    anchor_timestamp: anchorIso,
    queue_features: selectedQueueFeatures,
  });

  return {
    anchor_timestamp: anchorIso,
    windows: engineered,
    selected_window: selectedKey,
    selected_features: selectedQueueFeatures,
    selected_shared_features: selectedSharedFeatures,
  };
};

module.exports = {
  DEFAULT_WINDOWS,
  FEATURE_KEYS,
  FEATURE_WINDOW_CONFIG,
  SHARED_FEATURE_PAYLOAD_SCHEMA,
  SHARED_FEATURE_DEFINITIONS,
  SHARED_FEATURE_CONTRACT,
  buildFeatures,
  buildLagSafeFeatureSet,
};
