const { success } = require('../../utils/apiResponse');
const {
  generateTrustworthySuggestions,
  runSalesWalkForwardBacktest,
  evaluateSuggestionStability,
  normalizeEngineConfig,
} = require('../../ai/suggestionEngine');
const { buildSalesFeatureSetForUser, normalizeHorizons } = require('../../ai/featureBuilder');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const parseHorizonsFromQuery = (query = {}) => {
  const fromHorizons = String(query.horizons || '').trim();
  const fromHorizon = String(query.horizon || '').trim();

  const raw = fromHorizons || fromHorizon || '1W,1M';
  const tokens = raw
    .split(',')
    .map((token) => String(token || '').trim().toUpperCase())
    .filter(Boolean);

  return normalizeHorizons(tokens);
};

const buildEngineConfigFromQuery = (query = {}) => {
  return normalizeEngineConfig({
    lookbackDays: query.lookback_days ?? query.lookbackDays,
    leadTimeDays: query.lead_time_days ?? query.leadTimeDays,
    reviewDays: query.review_days ?? query.reviewDays,
    safetyDays: query.safety_days ?? query.safetyDays,
    minTrainDays: query.min_train_days ?? query.minTrainDays,
    maxBacktestWindows: query.max_backtest_windows ?? query.maxBacktestWindows,
    backtestStepDays: query.backtest_step_days ?? query.backtestStepDays,
  });
};

const buildFiltersFromSuggestions = (suggestions = [], horizons = ['1W', '1M']) => {
  const categorySet = new Set();
  for (const row of Array.isArray(suggestions) ? suggestions : []) {
    categorySet.add(String(row?.category || 'General').trim() || 'General');
  }

  return {
    urgency: ['high', 'medium', 'low'],
    horizons,
    categories: [...categorySet],
  };
};

const getStockSuggestions = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const query = req.query && typeof req.query === 'object' ? req.query : {};

  const horizons = parseHorizonsFromQuery(query);
  const config = buildEngineConfigFromQuery(query);
  const includeBacktesting = parseBoolean(query.include_backtesting ?? query.includeBacktesting, true);
  const includeStability = parseBoolean(query.include_stability ?? query.includeStability, true);

  const result = await generateTrustworthySuggestions({
    userId,
    symbol: String(query.symbol || '').trim().toUpperCase(),
    asOf: parseDateOrNull(query.as_of ?? query.asOf),
    horizons,
    config,
    includeBacktesting,
    includeStability,
  });

  return success(req, res, {
    contract_name: 'trustworthy_stock_suggestion_contract',
    contract_version: 'trustworthy_stock_suggestion_contract_v1',
    ...result,
    filters: buildFiltersFromSuggestions(result.suggestions, horizons),
  });
});

const getStockSuggestionBacktest = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const query = req.query && typeof req.query === 'object' ? req.query : {};

  const horizons = parseHorizonsFromQuery(query);
  const config = buildEngineConfigFromQuery(query);

  const featureSet = await buildSalesFeatureSetForUser({
    userId,
    symbol: String(query.symbol || '').trim().toUpperCase(),
    asOf: parseDateOrNull(query.as_of ?? query.asOf),
    lookbackDays: config.lookbackDays,
    leadTimeDays: config.leadTimeDays,
    horizons,
  });

  const backtesting = runSalesWalkForwardBacktest({
    featureRows: featureSet.rows,
    horizons,
    config,
  });

  return success(req, res, {
    contract_name: 'trustworthy_stock_suggestion_backtest',
    contract_version: 'trustworthy_stock_suggestion_backtest_v1',
    metadata: featureSet.metadata,
    backtesting,
  });
});

const getStockSuggestionStability = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const query = req.query && typeof req.query === 'object' ? req.query : {};

  const horizons = parseHorizonsFromQuery(query);
  const config = buildEngineConfigFromQuery(query);

  const featureSet = await buildSalesFeatureSetForUser({
    userId,
    symbol: String(query.symbol || '').trim().toUpperCase(),
    asOf: parseDateOrNull(query.as_of ?? query.asOf),
    lookbackDays: config.lookbackDays,
    leadTimeDays: config.leadTimeDays,
    horizons,
  });

  const backtesting = runSalesWalkForwardBacktest({
    featureRows: featureSet.rows,
    horizons,
    config,
  });

  const stability = evaluateSuggestionStability({ backtest: backtesting });

  return success(req, res, {
    contract_name: 'trustworthy_stock_suggestion_stability',
    contract_version: 'trustworthy_stock_suggestion_stability_v1',
    metadata: featureSet.metadata,
    stability,
    backtesting,
  });
});

module.exports = {
  getStockSuggestions,
  getStockSuggestionBacktest,
  getStockSuggestionStability,
};
