const mongoose = require('mongoose');

const Product = require('../models/Product');
const SalesHeader = require('../models/SalesHeader');
const SalesItem = require('../models/SalesItem');

const HORIZON_DAYS = Object.freeze({
  '1W': 7,
  '1M': 30,
});

const DEMAND_STATES = Object.freeze({
  HIGH: 'HIGH_DEMAND',
  LOW: 'LOW_DEMAND',
  STABLE: 'STABLE',
});

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => Number(toNumber(value, 0).toFixed(6));

const mean = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + toNumber(value, 0), 0);
  return total / values.length;
};

const variance = (values = [], baseMean = null) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const mu = baseMean === null ? mean(values) : toNumber(baseMean, 0);
  const squared = values.reduce((sum, value) => {
    const delta = toNumber(value, 0) - mu;
    return sum + (delta * delta);
  }, 0);

  return squared / values.length;
};

const stdDev = (values = [], baseMean = null) => Math.sqrt(variance(values, baseMean));

const computeEma = (values = [], alpha = 0.2) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const safeAlpha = clamp(toNumber(alpha, 0.2), 0.01, 1);
  let running = toNumber(values[0], 0);

  for (let index = 1; index < values.length; index += 1) {
    const current = toNumber(values[index], 0);
    running = (safeAlpha * current) + ((1 - safeAlpha) * running);
  }

  return running;
};

const toUtcStartOfDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addUtcDays = (date, days) => {
  const base = toUtcStartOfDay(date);
  if (!base) {
    return null;
  }

  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + Math.trunc(toNumber(days, 0)));
  return shifted;
};

const formatDateKey = (value) => {
  const date = toUtcStartOfDay(value);
  if (!date) {
    return '';
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeObjectId = (value) => {
  const token = String(value || '').trim();
  if (!token || !mongoose.Types.ObjectId.isValid(token)) {
    return null;
  }

  return new mongoose.Types.ObjectId(token);
};

const normalizeHorizons = (horizons = []) => {
  const safeHorizons = Array.isArray(horizons) ? horizons : [];
  const tokens = safeHorizons
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((token) => HORIZON_DAYS[token]);

  if (tokens.length === 0) {
    return ['1W', '1M'];
  }

  return [...new Set(tokens)];
};

const resolveProductSymbol = (product = {}) => {
  const raw = product.sku || product.name || String(product._id || 'UNKNOWN');
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'UNKNOWN';
};

const deriveDemandStateSequence = (series = []) => {
  const units = series.map((point) => Math.max(0, toNumber(point?.units, 0)));
  const mu = mean(units);
  const sigma = stdDev(units, mu);

  const highThreshold = sigma <= 0.01
    ? mu * 1.2
    : mu + (0.35 * sigma);
  const lowThreshold = sigma <= 0.01
    ? mu * 0.8
    : mu - (0.35 * sigma);

  return units.map((value) => {
    if (value >= highThreshold && value > 0) {
      return DEMAND_STATES.HIGH;
    }
    if (value <= lowThreshold) {
      return DEMAND_STATES.LOW;
    }
    return DEMAND_STATES.STABLE;
  });
};

const computeMarkovSignalFromSeries = (series = []) => {
  const states = deriveDemandStateSequence(series);
  const keys = [DEMAND_STATES.HIGH, DEMAND_STATES.LOW, DEMAND_STATES.STABLE];

  const transitionCounts = {};
  for (const state of keys) {
    transitionCounts[state] = {};
    for (const target of keys) {
      transitionCounts[state][target] = 1;
    }
  }

  for (let index = 0; index < states.length - 1; index += 1) {
    const from = states[index];
    const to = states[index + 1];
    transitionCounts[from][to] += 1;
  }

  const currentState = states.length > 0 ? states[states.length - 1] : DEMAND_STATES.STABLE;
  const currentCounts = transitionCounts[currentState];
  const total = Object.values(currentCounts).reduce((sum, value) => sum + value, 0);

  const distribution = {
    HIGH_DEMAND: roundSix(currentCounts[DEMAND_STATES.HIGH] / total),
    LOW_DEMAND: roundSix(currentCounts[DEMAND_STATES.LOW] / total),
    STABLE: roundSix(currentCounts[DEMAND_STATES.STABLE] / total),
  };

  const probabilities = Object.values(distribution).filter((value) => value > 0);
  const entropy = probabilities.reduce((sum, probability) => {
    return sum - (probability * Math.log2(probability));
  }, 0);

  const uncertainty = clamp(entropy / Math.log2(3), 0, 1);

  return {
    current_state: currentState,
    next_state_distribution: distribution,
    uncertainty: roundSix(uncertainty),
  };
};

const buildDenseSeries = ({ dayMap = new Map(), startDate = null, endDate = null } = {}) => {
  const start = toUtcStartOfDay(startDate);
  const end = toUtcStartOfDay(endDate);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const output = [];
  let cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const key = formatDateKey(cursor);
    output.push({
      date: key,
      units: Math.max(0, toNumber(dayMap.get(key), 0)),
    });

    cursor = addUtcDays(cursor, 1);
  }

  return output;
};

const computeSeasonalityFactor = ({ series = [], horizonDays = 7, anchorDate = null } = {}) => {
  const safeSeries = Array.isArray(series) ? series : [];
  const safeHorizonDays = Math.max(1, Math.trunc(toNumber(horizonDays, 7)));

  if (safeSeries.length === 0) {
    return 1;
  }

  const units = safeSeries.map((point) => Math.max(0, toNumber(point?.units, 0)));
  const overallAverage = mean(units);
  if (overallAverage <= 0) {
    return 1;
  }

  const dowBuckets = new Map();
  for (let day = 0; day < 7; day += 1) {
    dowBuckets.set(day, []);
  }

  for (const point of safeSeries) {
    const date = toUtcStartOfDay(point?.date);
    if (!date) {
      continue;
    }

    const unitsValue = Math.max(0, toNumber(point?.units, 0));
    dowBuckets.get(date.getUTCDay()).push(unitsValue);
  }

  const dowAverage = {};
  for (let day = 0; day < 7; day += 1) {
    const bucket = dowBuckets.get(day) || [];
    dowAverage[day] = bucket.length > 0 ? mean(bucket) : overallAverage;
  }

  const anchor = toUtcStartOfDay(anchorDate) || toUtcStartOfDay(safeSeries[safeSeries.length - 1]?.date) || new Date();

  let expectedSeasonalUnits = 0;
  for (let offset = 1; offset <= safeHorizonDays; offset += 1) {
    const forecastDate = addUtcDays(anchor, offset);
    expectedSeasonalUnits += dowAverage[forecastDate.getUTCDay()] || overallAverage;
  }

  const baselineUnits = overallAverage * safeHorizonDays;
  if (baselineUnits <= 0) {
    return 1;
  }

  return clamp(expectedSeasonalUnits / baselineUnits, 0.6, 1.4);
};

const deriveSalesFeaturesFromSeries = ({
  series = [],
  inventory = 0,
  reorderLevel = 0,
  leadTimeDays = 7,
  horizons = ['1W', '1M'],
  anchorDate = null,
} = {}) => {
  const safeSeries = Array.isArray(series) ? [...series] : [];
  safeSeries.sort((left, right) => {
    const leftDate = new Date(left?.date || 0).getTime();
    const rightDate = new Date(right?.date || 0).getTime();
    return leftDate - rightDate;
  });

  const units = safeSeries.map((point) => Math.max(0, toNumber(point?.units, 0)));
  const sampleDays = units.length;
  const totalUnits = units.reduce((sum, value) => sum + value, 0);
  const activeSalesDays = units.filter((value) => value > 0).length;
  const dailyVelocity = sampleDays > 0 ? totalUnits / sampleDays : 0;
  const sigma = stdDev(units, dailyVelocity);

  const emaShort = computeEma(units, 2 / (Math.min(sampleDays, 14) + 1));
  const emaLong = computeEma(units, 2 / (Math.min(sampleDays, 30) + 1));
  const trendPct = emaLong > 0 ? (emaShort - emaLong) / emaLong : 0;

  const spikeThreshold = dailyVelocity + (1.25 * sigma);
  const spikeDays = units.filter((value) => value >= spikeThreshold && value > 0).length;
  const promotionEffectProxy = activeSalesDays > 0 ? spikeDays / activeSalesDays : 0;

  const safeInventory = Math.max(0, toNumber(inventory, 0));
  const safeReorderLevel = Math.max(0, toNumber(reorderLevel, 0));
  const safeLeadTimeDays = Math.max(1, Math.trunc(toNumber(leadTimeDays, 7)));
  const coverageDays = dailyVelocity > 0 ? safeInventory / dailyVelocity : Number.POSITIVE_INFINITY;

  const horizonTokens = normalizeHorizons(horizons);
  const seasonalityFactors = {};
  for (const token of horizonTokens) {
    seasonalityFactors[token] = roundSix(computeSeasonalityFactor({
      series: safeSeries,
      horizonDays: HORIZON_DAYS[token],
      anchorDate,
    }));
  }

  const markov = computeMarkovSignalFromSeries(safeSeries);

  return {
    sample_days: sampleDays,
    active_sales_days: activeSalesDays,
    total_units_sold: roundSix(totalUnits),
    base_daily_velocity: roundSix(dailyVelocity),
    ema_short_daily: roundSix(emaShort),
    ema_long_daily: roundSix(emaLong),
    trend_pct: roundSix(trendPct),
    volatility_daily_std: roundSix(sigma),
    promotion_effect_proxy: roundSix(promotionEffectProxy),
    current_inventory: roundSix(safeInventory),
    reorder_level: roundSix(safeReorderLevel),
    lead_time_days: safeLeadTimeDays,
    inventory_coverage_days: Number.isFinite(coverageDays) ? roundSix(coverageDays) : null,
    seasonality_factors: seasonalityFactors,
    markov,
  };
};

const buildSalesFeatureSetForUser = async ({
  userId,
  asOf = null,
  lookbackDays = 120,
  leadTimeDays = 7,
  symbol = '',
  horizons = ['1W', '1M'],
} = {}) => {
  const userObjectId = normalizeObjectId(userId);
  if (!userObjectId) {
    throw new Error('Valid userId is required to build sales features.');
  }

  const safeAsOf = toUtcStartOfDay(asOf) || toUtcStartOfDay(new Date());
  const safeLookbackDays = Math.max(30, Math.min(365, Math.trunc(toNumber(lookbackDays, 120))));
  const startDate = addUtcDays(safeAsOf, -(safeLookbackDays - 1));
  const horizonTokens = normalizeHorizons(horizons);
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  const products = await Product.find({
    userId: userObjectId,
    deletedAt: null,
    isArchived: { $ne: true },
  })
    .select('_id name sku quantityOnHand reorderLevel')
    .lean();

  const scopedProducts = normalizedSymbol
    ? products.filter((product) => resolveProductSymbol(product) === normalizedSymbol)
    : products;

  const productIdTokens = scopedProducts.map((product) => String(product._id));
  const productIdSet = new Set(productIdTokens);

  const headers = await SalesHeader.find({
    userId: userObjectId,
    saleAt: {
      $gte: startDate,
      $lte: addUtcDays(safeAsOf, 1),
    },
    status: 'posted',
    deletedAt: null,
    isArchived: { $ne: true },
  })
    .select('_id saleAt')
    .lean();

  const headerSaleDateById = new Map();
  for (const header of headers) {
    const key = String(header._id);
    const saleDate = formatDateKey(header.saleAt);
    if (key && saleDate) {
      headerSaleDateById.set(key, saleDate);
    }
  }

  const headerIds = [...headerSaleDateById.keys()].map((token) => new mongoose.Types.ObjectId(token));

  let items = [];
  if (headerIds.length > 0 && productIdTokens.length > 0) {
    items = await SalesItem.find({
      userId: userObjectId,
      salesHeaderId: { $in: headerIds },
      productId: { $in: scopedProducts.map((product) => product._id) },
      deletedAt: null,
      isArchived: { $ne: true },
    })
      .select('productId salesHeaderId quantity')
      .lean();
  }

  const productDayUnits = new Map();
  for (const item of items) {
    const productId = String(item.productId || '');
    if (!productId || !productIdSet.has(productId)) {
      continue;
    }

    const headerId = String(item.salesHeaderId || '');
    const dayKey = headerSaleDateById.get(headerId);
    if (!dayKey) {
      continue;
    }

    const quantity = Math.max(0, toNumber(item.quantity, 0));
    if (quantity <= 0) {
      continue;
    }

    if (!productDayUnits.has(productId)) {
      productDayUnits.set(productId, new Map());
    }

    const dayMap = productDayUnits.get(productId);
    dayMap.set(dayKey, Math.max(0, toNumber(dayMap.get(dayKey), 0)) + quantity);
  }

  const rows = scopedProducts.map((product) => {
    const productId = String(product._id);
    const dayMap = productDayUnits.get(productId) || new Map();

    const series = buildDenseSeries({
      dayMap,
      startDate,
      endDate: safeAsOf,
    });

    const features = deriveSalesFeaturesFromSeries({
      series,
      inventory: product.quantityOnHand,
      reorderLevel: product.reorderLevel,
      leadTimeDays,
      horizons: horizonTokens,
      anchorDate: safeAsOf,
    });

    return {
      product_id: productId,
      product_name: String(product.name || '').trim() || 'Unknown Product',
      symbol: resolveProductSymbol(product),
      inventory: Math.max(0, toNumber(product.quantityOnHand, 0)),
      reorder_level: Math.max(0, toNumber(product.reorderLevel, 0)),
      series,
      features,
    };
  });

  return {
    metadata: {
      as_of: safeAsOf.toISOString(),
      lookback_days: safeLookbackDays,
      lead_time_days: Math.max(1, Math.trunc(toNumber(leadTimeDays, 7))),
      horizons: horizonTokens,
      demand_signal_source: ['sales_header', 'sales_items'],
      inventory_source: 'products',
      demand_only_policy: true,
      product_count: rows.length,
    },
    rows,
  };
};

module.exports = {
  HORIZON_DAYS,
  DEMAND_STATES,
  normalizeHorizons,
  resolveProductSymbol,
  deriveSalesFeaturesFromSeries,
  buildSalesFeatureSetForUser,
};
