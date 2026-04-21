const { STOCK_UNIVERSE_CONFIG } = require('../config/dataContract');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const avg = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + toNumber(value, 0), 0) / values.length;
};

const safeDivide = (numerator, denominator, fallback = 0) => {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d === 0) {
    return fallback;
  }

  return Number(numerator) / d;
};

const getTimestampMs = (row) => {
  const ts = new Date(row.timestamp || row.occurred_at || row.occurredAt || 0).getTime();
  return Number.isFinite(ts) ? ts : null;
};

const computeExecutionDelayHours = (rows = []) => {
  if (!Array.isArray(rows) || rows.length < 2) {
    return 0;
  }

  const delays = [];

  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1];
    const current = rows[i];

    const previousTs = getTimestampMs(previous);
    const currentTs = getTimestampMs(current);
    if (previousTs === null || currentTs === null || currentTs <= previousTs) {
      continue;
    }

    const prevQueue = Math.abs(toNumber(previous?.markov_features?.queue_pressure ?? previous?.queue_pressure, 0));
    const currQueue = Math.abs(toNumber(current?.markov_features?.queue_pressure ?? current?.queue_pressure, 0));
    const prevStress = toNumber(previous?.markov_features?.liquidity_stress_score ?? previous?.liquidity_stress_score, 0);
    const currStress = toNumber(current?.markov_features?.liquidity_stress_score ?? current?.liquidity_stress_score, 0);

    if ((prevQueue >= 0.45 && currQueue <= 0.3) || (prevStress >= 0.55 && currStress <= 0.4)) {
      delays.push((currentTs - previousTs) / (60 * 60 * 1000));
    }
  }

  if (delays.length > 0) {
    return avg(delays);
  }

  const allGaps = [];
  for (let i = 1; i < rows.length; i += 1) {
    const previousTs = getTimestampMs(rows[i - 1]);
    const currentTs = getTimestampMs(rows[i]);
    if (previousTs === null || currentTs === null || currentTs <= previousTs) {
      continue;
    }
    allGaps.push((currentTs - previousTs) / (60 * 60 * 1000));
  }

  return avg(allGaps);
};

const computeQueueFeatures = ({ rows = [], windowDays = 7 } = {}) => {
  const orderedRows = Array.isArray(rows) ? rows : [];
  const effectiveWindowDays = Math.max(1, Math.trunc(Number(windowDays) || 1));
  const floorVolume = Number(STOCK_UNIVERSE_CONFIG?.liquidity_floor?.min_daily_volume || 1);

  let totalBuy = 0;
  let totalSell = 0;
  let totalMarketVolume = 0;
  let totalOrderFlowVolume = 0;
  let serviceEventCount = 0;
  let stressEventCount = 0;

  const spreadStressValues = [];

  for (const row of orderedRows) {
    const volume = Math.max(0, toNumber(row.volume, 0));
    const close = Math.max(0.000001, toNumber(row.close, 0.000001));
    const spread = Math.max(0, toNumber(row.spread, 0));
    const buy = Math.max(0, toNumber(row?.order_flow?.buy_volume, 0));
    const sell = Math.max(0, toNumber(row?.order_flow?.sell_volume, 0));

    const total = buy + sell;
    totalBuy += buy;
    totalSell += sell;
    totalMarketVolume += volume;

    const spreadToClose = safeDivide(spread, close, 0);
    const depthPenalty = clamp(safeDivide(floorVolume, Math.max(1, volume), 0), 0, 3);
    spreadStressValues.push(spreadToClose * depthPenalty);

    const isServiceEvent = spreadToClose <= 0.004 && volume >= floorVolume;
    if (isServiceEvent) {
      serviceEventCount += 1;
    }

    const isStressEvent = spreadToClose >= 0.01 || volume < floorVolume;
    if (isStressEvent) {
      stressEventCount += 1;
    }

    if (total > 0) {
      totalOrderFlowVolume += total;
    }
  }

  const imbalancePressure = safeDivide(totalBuy - totalSell, Math.max(1, totalBuy + totalSell), 0);
  const arrivalRate = safeDivide(orderedRows.length, effectiveWindowDays, 0);
  const serviceRate = safeDivide(serviceEventCount, effectiveWindowDays, 0);
  const congestion = clamp(safeDivide(arrivalRate - serviceRate, Math.max(0.001, arrivalRate + serviceRate), 0), 0, 1);
  const spreadStress = avg(spreadStressValues);
  const executionDelay = computeExecutionDelayHours(orderedRows);

  return {
    imbalance_pressure: Number(imbalancePressure.toFixed(6)),
    arrival_rate: Number(arrivalRate.toFixed(6)),
    service_rate: Number(serviceRate.toFixed(6)),
    congestion: Number(congestion.toFixed(6)),
    spread_stress: Number(spreadStress.toFixed(6)),
    execution_delay: Number(executionDelay.toFixed(6)),
    diagnostics: {
      rows: orderedRows.length,
      stress_event_count: stressEventCount,
      service_event_count: serviceEventCount,
      total_buy_volume: Number(totalBuy.toFixed(2)),
      total_sell_volume: Number(totalSell.toFixed(2)),
      total_market_volume: Number(totalMarketVolume.toFixed(2)),
      total_order_flow_volume: Number(totalOrderFlowVolume.toFixed(2)),
    },
  };
};

module.exports = {
  computeQueueFeatures,
};
