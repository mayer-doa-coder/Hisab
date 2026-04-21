const MarketDataBar = require('../models/MarketDataBar');
const { DATA_CONTRACT_VERSION } = require('../config/dataContract');
const { buildLagSafeFeatureSet, buildFeatures } = require('../features/featureBuilder');
const { applyFallbacks } = require('../features/fallbackHandler');
const { validateFeatures } = require('../features/featureValidation');
const { EMA_HORIZONS, generateSignal } = require('../models/ema/signalBuilder');
const { calibrateSignal } = require('../models/ema/calibration');
const { buildRandomWalkPrediction } = require('../models/baseline/randomWalk');
const {
  buildLogisticDirectionPrediction,
  buildLogisticRiskPrediction,
} = require('../models/baseline/logisticModel');
const { buildLinearRiskScorePrediction } = require('../models/baseline/linearModel');

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const serializeBar = (doc) => ({
  symbol: doc.symbol,
  timestamp: new Date(doc.timestamp).toISOString(),
  open: Number(doc.open),
  high: Number(doc.high),
  low: Number(doc.low),
  close: Number(doc.close),
  volume: Number(doc.volume),
  spread: Number(doc.spread),
  current_state: String(doc.currentState || 'SIDEWAYS_STABLE').trim().toUpperCase(),
  markov_features: {
    queue_pressure: Number(doc?.markovFeatures?.queuePressure || 0),
    liquidity_stress_score: Number(doc?.markovFeatures?.liquidityStressScore || 0),
  },
  order_flow: doc.orderFlow
    ? {
      buy_volume: Number(doc.orderFlow.buyVolume || 0),
      sell_volume: Number(doc.orderFlow.sellVolume || 0),
      imbalance: doc.orderFlow.imbalance,
    }
    : null,
});

const buildBaselinePredictionFromRows = ({
  rows = [],
  symbol,
  anchorTimestamp,
  windows = [7, 30],
} = {}) => {
  const sortedRows = [...rows].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );

  const latest = sortedRows[sortedRows.length - 1] || null;
  const featureSet = buildLagSafeFeatureSet({
    rows: sortedRows,
    anchorTimestamp,
    windows,
  });

  const selectedFeatures = featureSet.selected_features || {
    imbalance_pressure: 0,
    arrival_rate: 0,
    service_rate: 0,
    congestion: 0,
    spread_stress: 0,
    execution_delay: 0,
  };

  const sharedRaw = {
    anchor_timestamp: featureSet.anchor_timestamp,
    market_rows: sortedRows,
    sales_rows: sortedRows.map((row) => ({
      timestamp: row.timestamp,
      units_sold: Number(row?.units_sold ?? row?.quantity ?? row?.demand ?? row?.volume ?? 0),
    })),
    queue_features: selectedFeatures,
  };

  const sharedComputed = buildFeatures(sharedRaw);
  const sharedFallback = applyFallbacks(sharedComputed, sharedRaw);
  const sharedValidated = validateFeatures(sharedFallback.features, { sanitize: true });

  const randomWalk = buildRandomWalkPrediction({
    currentState: latest?.current_state || 'SIDEWAYS_STABLE',
    currentValue: latest?.close ?? null,
  });

  const logisticDirection = buildLogisticDirectionPrediction(selectedFeatures);
  const logisticRiskBucket = buildLogisticRiskPrediction(selectedFeatures);
  const linearRiskScore = buildLinearRiskScorePrediction(selectedFeatures);

  const closeSeries = sortedRows
    .map((row) => Number(row?.close))
    .filter((value) => Number.isFinite(value));

  const emaSignals = EMA_HORIZONS.map((horizon) => {
    const raw = generateSignal({
      series: closeSeries,
      horizon,
      volatility: Number(sharedValidated.features?.volatility || 0),
      key: 'value',
    });

    const calibrated = calibrateSignal(raw, { method: 'linear' });
    return {
      ema_score: Number(calibrated.ema_score),
      trend: String(calibrated.trend || 'NEUTRAL').trim().toUpperCase(),
      strength: Number(calibrated.strength),
      horizon: String(calibrated.horizon || horizon).trim().toUpperCase(),
    };
  });

  return {
    symbol: String(symbol || latest?.symbol || '').trim().toUpperCase() || null,
    anchor_timestamp: featureSet.anchor_timestamp,
    current_state: latest?.current_state || 'SIDEWAYS_STABLE',
    features: featureSet,
    shared_features: sharedValidated.features,
    shared_feature_quality: {
      valid: sharedValidated.valid,
      issues: sharedValidated.issues,
      applied_fallbacks: sharedFallback.applied_fallbacks,
      deterministic: true,
      contract_version: 'shared_feature_payload_v1',
    },
    ema_signals: emaSignals,
    predictions: {
      random_walk: randomWalk,
      direction_class: logisticDirection,
      risk_bucket: logisticRiskBucket,
      risk_score: linearRiskScore,
    },
    model_family: {
      random_walk: 'baseline_nonparametric',
      logistic: 'baseline_econometric_classifier',
      linear: 'baseline_econometric_regressor',
    },
  };
};

const runBaselinePredictionPipeline = async ({
  userId,
  symbol,
  anchorTimestamp,
  windows = [7, 30],
  contractVersion = DATA_CONTRACT_VERSION,
  limit = 120,
} = {}) => {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const anchorDate = toDateOrNull(anchorTimestamp) || new Date();

  const query = {
    userId,
    contractVersion,
    timestamp: { $lte: anchorDate },
  };
  if (normalizedSymbol) {
    query.symbol = normalizedSymbol;
  }

  const docs = await MarketDataBar.find(query)
    .sort({ timestamp: 1 })
    .limit(Math.max(10, Math.min(Number(limit) || 120, 2000)))
    .lean();

  const rows = docs.map(serializeBar);

  return buildBaselinePredictionFromRows({
    rows,
    symbol: normalizedSymbol,
    anchorTimestamp: anchorDate.toISOString(),
    windows,
  });
};

module.exports = {
  buildBaselinePredictionFromRows,
  runBaselinePredictionPipeline,
};
