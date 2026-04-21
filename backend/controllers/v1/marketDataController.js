const MarketDataBar = require('../../models/MarketDataBar');
const { success } = require('../../utils/apiResponse');
const { badRequest } = require('../../services/v1/httpError');
const {
  DATA_CONTRACT_VERSION,
  resolveDataContractVersion,
  getDataContractConfig,
  getStockUniverseConfig,
} = require('../../config/dataContract');
const { getMarkovStateConfig, getMarkovStateLabel } = require('../../config/markovStates');
const { getDataContractV1Definition } = require('../../data/contract/dataContractV1');
const { ingestMarketDataDataset } = require('../../data/ingestion/marketDataIngestionPipeline');
const { runBaselinePredictionPipeline } = require('../../pipeline/baselinePredictionPipeline');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const parseIsoDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? new Date(time) : null;
};

const serializeMarketDataBar = (doc) => ({
  symbol: doc.symbol,
  timestamp: new Date(doc.timestamp).toISOString(),
  open: Number(doc.open),
  high: Number(doc.high),
  low: Number(doc.low),
  close: Number(doc.close),
  volume: Number(doc.volume),
  spread: Number(doc.spread),
  sector: doc.sector,
  market: doc.market,
  asset_type: doc.assetType,
  corporate_actions: {
    dividends: Number(doc.dividends || 0),
    stock_splits: Number(doc.stockSplits || 1),
  },
  liquidity_metrics: {
    average_daily_volume_20d: Number(doc?.liquidityMetrics?.averageDailyVolume20d || 0),
    active_trading_days_30d: Number(doc?.liquidityMetrics?.activeTradingDays30d || 0),
    turnover_ratio: Number(doc?.liquidityMetrics?.turnoverRatio || 0),
  },
  macro_indicators: doc.macroIndicators || null,
  order_flow: doc.orderFlow
    ? {
      buy_volume: doc.orderFlow.buyVolume,
      sell_volume: doc.orderFlow.sellVolume,
      imbalance: doc.orderFlow.imbalance,
    }
    : null,
  is_delisted: Boolean(doc.isDelisted),
  current_state: String(doc.currentState || 'SIDEWAYS_STABLE').trim().toUpperCase(),
  current_state_label: getMarkovStateLabel(doc.currentState),
  markov_features: {
    trend_pct: Number(doc?.markovFeatures?.trendPct || 0),
    momentum_pct: Number(doc?.markovFeatures?.momentumPct || 0),
    volatility_ratio: Number(doc?.markovFeatures?.volatilityRatio || 0),
    liquidity_stress_score: Number(doc?.markovFeatures?.liquidityStressScore || 0),
    queue_pressure: Number(doc?.markovFeatures?.queuePressure || 0),
    spread_to_close_ratio: Number(doc?.markovFeatures?.spreadToCloseRatio || 0),
    volume_to_floor_ratio: Number(doc?.markovFeatures?.volumeToFloorRatio || 0),
  },
  contract_version: doc.contractVersion,
});

const getMarketDataContract = asyncHandler(async (req, res) => {
  return success(req, res, {
    data_contract: getDataContractConfig(),
    data_contract_schema: getDataContractV1Definition(),
    markov_state_space: getMarkovStateConfig(),
  });
});

const getStockUniverse = asyncHandler(async (req, res) => {
  return success(req, res, {
    stock_universe: getStockUniverseConfig(),
  });
});

const getMarkovStateSpace = asyncHandler(async (req, res) => {
  return success(req, res, {
    markov_state_space: getMarkovStateConfig(),
  });
});

const ingestMarketData = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const result = await ingestMarketDataDataset({
    userId,
    payload: req.body || {},
    logger: console,
  });

  const statusCode = result.validation_summary.accepted_rows > 0 ? 201 : 200;
  return success(req, res, result, statusCode);
});

const listMarketDataBars = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const requestedContractVersion = resolveDataContractVersion(req.query?.contract_version || DATA_CONTRACT_VERSION);
  if (!requestedContractVersion) {
    throw badRequest('Unsupported contract_version query parameter.', [
      {
        field: 'contract_version',
        reason: 'unsupported_version',
      },
    ]);
  }

  const startDate = parseIsoDateOrNull(req.query?.start);
  const endDate = parseIsoDateOrNull(req.query?.end);
  if ((req.query?.start && !startDate) || (req.query?.end && !endDate)) {
    throw badRequest('Invalid start or end datetime query parameter.', [
      {
        field: 'start/end',
        reason: 'invalid_datetime',
      },
    ]);
  }

  const limitRaw = Number(req.query?.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 250;

  const query = {
    userId,
    contractVersion: requestedContractVersion,
  };

  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  if (symbol) {
    query.symbol = symbol;
  }

  const market = String(req.query?.market || '').trim().toUpperCase();
  if (market) {
    query.market = market;
  }

  const sector = String(req.query?.sector || '').trim();
  if (sector) {
    query.sector = sector;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = startDate;
    }
    if (endDate) {
      query.timestamp.$lte = endDate;
    }
  }

  const docs = await MarketDataBar.find(query)
    .sort({ timestamp: -1, symbol: 1 })
    .limit(limit)
    .lean();

  return success(req, res, {
    contract_version: requestedContractVersion,
    count: docs.length,
    bars: docs.map(serializeMarketDataBar),
  });
});

const parseWindowDays = (value) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return Math.min(numeric, 365);
};

const parseWindowsQuery = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return [7, 30];
  }

  const values = raw
    .split(',')
    .map((item) => parseWindowDays(item))
    .filter((item) => item !== null);

  return values.length > 0 ? [...new Set(values)] : [7, 30];
};

const getBaselinePrediction = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  const asOfRaw = String(req.query?.asOf || '').trim();
  const windows = parseWindowsQuery(req.query?.windows);

  if (!symbol) {
    throw badRequest('symbol query parameter is required for baseline prediction.', [
      {
        field: 'symbol',
        reason: 'required',
      },
    ]);
  }

  const asOfDate = asOfRaw ? parseIsoDateOrNull(asOfRaw) : new Date();
  if (!asOfDate) {
    throw badRequest('Invalid asOf query parameter. Expect ISO datetime.', [
      {
        field: 'asOf',
        reason: 'invalid_datetime',
      },
    ]);
  }

  const result = await runBaselinePredictionPipeline({
    userId,
    symbol,
    anchorTimestamp: asOfDate.toISOString(),
    windows,
    contractVersion: DATA_CONTRACT_VERSION,
  });

  return success(req, res, {
    contract_version: DATA_CONTRACT_VERSION,
    markov_state_space_version: 'markov_state_space_v1',
    baseline_version: 'baseline_v1',
    result,
  });
});

module.exports = {
  getMarketDataContract,
  getStockUniverse,
  getMarkovStateSpace,
  ingestMarketData,
  listMarketDataBars,
  getBaselinePrediction,
};
