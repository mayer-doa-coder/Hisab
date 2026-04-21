const { MARKOV_STATE_CONFIG, getMarkovStateLabel } = require('../../config/markovStates');
const { STOCK_UNIVERSE_CONFIG } = require('../../config/dataContract');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeDivide = (numerator, denominator, fallback = 0) => {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d === 0) {
    return fallback;
  }

  return Number(numerator) / d;
};

const computeQueuePressure = (row) => {
  const buyVolume = toNumber(row?.order_flow?.buy_volume, 0);
  const sellVolume = toNumber(row?.order_flow?.sell_volume, 0);
  const total = buyVolume + sellVolume;

  if (total <= 0) {
    const directImbalance = toNumber(row?.order_flow?.imbalance, 0);
    return clamp(directImbalance, -1, 1);
  }

  const imbalance = (buyVolume - sellVolume) / total;
  return clamp(imbalance, -1, 1);
};

const deriveMarkovFeatures = ({ row, previousSnapshot = null }) => {
  const open = toNumber(row.open, 0);
  const high = toNumber(row.high, open);
  const low = toNumber(row.low, open);
  const close = toNumber(row.close, open);
  const volume = toNumber(row.volume, 0);
  const spread = toNumber(row.spread, 0);

  const previousClose = previousSnapshot ? toNumber(previousSnapshot.close, close) : close;

  const trendPct = safeDivide(close - previousClose, Math.max(0.000001, previousClose), 0);
  const momentumPct = safeDivide(close - open, Math.max(0.000001, open), 0);
  const volatilityRatio = safeDivide(high - low, Math.max(0.000001, close), 0);
  const spreadToCloseRatio = safeDivide(spread, Math.max(0.000001, close), 0);

  const queuePressure = computeQueuePressure(row);

  const liquidityFloorVolume = Number(STOCK_UNIVERSE_CONFIG?.liquidity_floor?.min_daily_volume || 1);
  const volumeToFloorRatio = safeDivide(volume, Math.max(1, liquidityFloorVolume), 0);

  const liquidityStressScore = clamp(
    (0.5 * clamp(1 - volumeToFloorRatio, 0, 1))
    + (0.35 * clamp(safeDivide(spreadToCloseRatio, 0.02, 0), 0, 1))
    + (0.15 * clamp(Math.abs(queuePressure), 0, 1)),
    0,
    1
  );

  return {
    trend_pct: Number(trendPct.toFixed(6)),
    momentum_pct: Number(momentumPct.toFixed(6)),
    volatility_ratio: Number(volatilityRatio.toFixed(6)),
    liquidity_stress_score: Number(liquidityStressScore.toFixed(6)),
    queue_pressure: Number(queuePressure.toFixed(6)),
    spread_to_close_ratio: Number(spreadToCloseRatio.toFixed(6)),
    volume_to_floor_ratio: Number(volumeToFloorRatio.toFixed(6)),
  };
};

const assignMarkovState = ({ features, previousState = null }) => {
  const thresholds = MARKOV_STATE_CONFIG.thresholds;

  const trend = toNumber(features?.trend_pct, 0);
  const momentum = toNumber(features?.momentum_pct, 0);
  const volatility = toNumber(features?.volatility_ratio, 0);
  const liquidityStress = toNumber(features?.liquidity_stress_score, 0);
  const queuePressure = Math.abs(toNumber(features?.queue_pressure, 0));
  const spreadToCloseRatio = toNumber(features?.spread_to_close_ratio, 0);
  const volumeToFloorRatio = toNumber(features?.volume_to_floor_ratio, 0);
  const prevState = String(previousState || '').trim().toUpperCase();

  if (
    liquidityStress >= thresholds.liquidity.stress_score_high
    || spreadToCloseRatio >= thresholds.liquidity.spread_to_close_stress_min
    || volumeToFloorRatio <= thresholds.liquidity.volume_to_floor_stress_max
  ) {
    return 'LIQUIDITY_STRESS';
  }

  if (
    queuePressure >= thresholds.queue_pressure.absolute_high_min
    && liquidityStress < thresholds.liquidity.stress_score_high
  ) {
    return 'QUEUE_PRESSURE';
  }

  if (
    volatility >= thresholds.volatility.high_min
    && liquidityStress < thresholds.liquidity.stress_score_high
  ) {
    return 'HIGH_VOLATILITY';
  }

  if (
    trend >= thresholds.trend.strong_uptrend_min
    && momentum >= thresholds.momentum.high_min
    && volatility <= thresholds.volatility.uptrend_max
  ) {
    return 'STRONG_UPTREND';
  }

  if (
    ['DOWNTREND', 'LIQUIDITY_STRESS', 'HIGH_VOLATILITY'].includes(prevState)
    && trend >= thresholds.trend.recovery_min
    && liquidityStress <= thresholds.liquidity.stress_score_moderate_max
    && queuePressure <= thresholds.queue_pressure.absolute_moderate_max
  ) {
    return 'RECOVERY_PHASE';
  }

  if (
    trend >= thresholds.trend.weak_uptrend_min
    && momentum >= thresholds.momentum.weak_min
  ) {
    return 'WEAK_UPTREND';
  }

  if (
    trend <= thresholds.trend.downtrend_max
    || momentum <= thresholds.momentum.downtrend_max
  ) {
    return 'DOWNTREND';
  }

  return MARKOV_STATE_CONFIG.fallback_state;
};

const assignMarkovStateForRow = ({ row, previousSnapshot = null }) => {
  const features = deriveMarkovFeatures({ row, previousSnapshot });
  const currentState = assignMarkovState({
    features,
    previousState: previousSnapshot?.current_state || null,
  });

  return {
    current_state: currentState,
    current_state_label: getMarkovStateLabel(currentState),
    markov_features: features,
  };
};

module.exports = {
  deriveMarkovFeatures,
  assignMarkovState,
  assignMarkovStateForRow,
};
