import { requestBackendJson } from './httpClient';

const DATA_CONTRACT_VERSION = 'data_contract_v1';

export const MARKET_STATE_LABELS = Object.freeze({
  LIQUIDITY_STRESS: 'Liquidity Stress',
  QUEUE_PRESSURE: 'Queue Pressure',
  HIGH_VOLATILITY: 'High Volatility',
  STRONG_UPTREND: 'Strong Uptrend',
  WEAK_UPTREND: 'Weak Uptrend',
  DOWNTREND: 'Downtrend',
  RECOVERY_PHASE: 'Recovery Phase',
  SIDEWAYS_STABLE: 'Sideways Stable',
});

const REQUIRED_MARKET_DATA_FIELDS = Object.freeze([
  'symbol',
  'timestamp',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'spread',
  'sector',
]);

const assertFiniteNumber = (value, name) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return numeric;
};

const assertString = (value, name) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return normalized;
};

export const STOCK_SUGGESTION_CONTRACT_V1 = Object.freeze({
  contract_name: 'stock_suggestion_contract',
  contract_version: 'stock_suggestion_contract_v1',
  horizons: ['1W', '1M'],
  decisions: ['BUY_NOW', 'WATCH', 'HOLD'],
});

export const SHARED_FEATURE_CONTRACT_V1 = Object.freeze({
  contract_name: 'shared_feature_payload',
  contract_version: 'shared_feature_payload_v1',
  keys: ['sales_velocity', 'stock_position', 'lead_time', 'volatility', 'queue_pressure'],
});

export const EMA_SIGNAL_CONTRACT_V1 = Object.freeze({
  contract_name: 'ema_signal_output',
  contract_version: 'ema_signal_output_v1',
  trends: ['UP', 'DOWN', 'NEUTRAL'],
  horizons: ['1W', '1M'],
});

export const REORDER_DECISION_CONTRACT_V1 = Object.freeze({
  contract_name: 'reorder_threshold_decision_output',
  contract_version: 'reorder_threshold_decision_output_v1',
  decisions: ['REORDER', 'NO_REORDER'],
  risk_levels: ['LOW', 'MEDIUM', 'HIGH'],
  reason_codes: [
    'LOW_STOCK_BELOW_REORDER_POINT',
    'HIGH_STOCKOUT_RISK',
    'MEDIUM_STOCKOUT_RISK',
    'SUFFICIENT_STOCK',
    'NO_SALES_HISTORY',
    'ZERO_STOCK_FORCE_REORDER',
    'OVERSTOCK',
    'SPARSE_DATA',
    'FALLBACK_VELOCITY_USED',
  ],
});

export const assertSharedFeaturePayloadContractV1 = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('shared feature payload must be an object.');
  }

  const allowedFields = new Set(SHARED_FEATURE_CONTRACT_V1.keys);
  const extraFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown shared feature fields: ${extraFields.join(', ')}.`);
  }

  for (const field of SHARED_FEATURE_CONTRACT_V1.keys) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`Missing shared feature field "${field}".`);
    }

    const value = assertFiniteNumber(payload[field], field);
    if (value < 0) {
      throw new Error(`${field} must be >= 0.`);
    }
  }

  return payload;
};

export const assertEmaSignalRowContractV1 = (row, rowIndex = 0) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`EMA signal row at index ${rowIndex} must be an object.`);
  }

  const allowedFields = new Set(['ema_score', 'trend', 'strength', 'horizon']);
  const extraFields = Object.keys(row).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown EMA signal fields at row index ${rowIndex}: ${extraFields.join(', ')}.`);
  }

  const requiredFields = ['ema_score', 'trend', 'strength', 'horizon'];
  for (const field of requiredFields) {
    if (row[field] === undefined || row[field] === null) {
      throw new Error(`Missing EMA signal field "${field}" at row index ${rowIndex}.`);
    }
  }

  const score = assertFiniteNumber(row.ema_score, 'ema_score');
  const strength = assertFiniteNumber(row.strength, 'strength');
  const trend = String(row.trend || '').trim().toUpperCase();
  const horizon = String(row.horizon || '').trim().toUpperCase();

  if (score < 0 || score > 1) {
    throw new Error(`ema_score must be within [0,1] at row index ${rowIndex}.`);
  }
  if (strength < 0 || strength > 1) {
    throw new Error(`strength must be within [0,1] at row index ${rowIndex}.`);
  }
  if (!EMA_SIGNAL_CONTRACT_V1.trends.includes(trend)) {
    throw new Error(`trend must be one of UP, DOWN, NEUTRAL at row index ${rowIndex}.`);
  }
  if (!EMA_SIGNAL_CONTRACT_V1.horizons.includes(horizon)) {
    throw new Error(`horizon must be one of 1W, 1M at row index ${rowIndex}.`);
  }

  return row;
};

export const assertReorderDecisionContractV1 = (payload, payloadPath = 'reorder_decision') => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${payloadPath} must be an object.`);
  }

  const allowedFields = new Set(['decision', 'confidence', 'reason_codes', 'metrics']);
  const extraFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown reorder decision fields in ${payloadPath}: ${extraFields.join(', ')}.`);
  }

  const requiredFields = ['decision', 'confidence', 'reason_codes', 'metrics'];
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`Missing reorder decision field "${field}" in ${payloadPath}.`);
    }
  }

  const decision = String(payload.decision || '').trim().toUpperCase();
  const confidence = assertFiniteNumber(payload.confidence, `${payloadPath}.confidence`);

  if (!REORDER_DECISION_CONTRACT_V1.decisions.includes(decision)) {
    throw new Error(`${payloadPath}.decision must be one of REORDER, NO_REORDER.`);
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error(`${payloadPath}.confidence must be within [0,1].`);
  }

  if (!Array.isArray(payload.reason_codes)) {
    throw new Error(`${payloadPath}.reason_codes must be an array.`);
  }

  payload.reason_codes.forEach((code, index) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) {
      throw new Error(`${payloadPath}.reason_codes[${index}] must be a non-empty string.`);
    }
    if (!REORDER_DECISION_CONTRACT_V1.reason_codes.includes(normalizedCode)) {
      throw new Error(`${payloadPath}.reason_codes[${index}] has unsupported code ${normalizedCode}.`);
    }
  });

  const metrics = payload.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new Error(`${payloadPath}.metrics must be an object.`);
  }

  const allowedMetricFields = new Set(['reorder_point', 'days_remaining', 'stockout_risk']);
  const extraMetricFields = Object.keys(metrics).filter((field) => !allowedMetricFields.has(field));
  if (extraMetricFields.length > 0) {
    throw new Error(`Unknown reorder metric fields in ${payloadPath}.metrics: ${extraMetricFields.join(', ')}.`);
  }

  const reorderPoint = assertFiniteNumber(metrics.reorder_point, `${payloadPath}.metrics.reorder_point`);
  const daysRemaining = assertFiniteNumber(metrics.days_remaining, `${payloadPath}.metrics.days_remaining`);
  const stockoutRisk = String(metrics.stockout_risk || '').trim().toUpperCase();

  if (reorderPoint < 0) {
    throw new Error(`${payloadPath}.metrics.reorder_point must be >= 0.`);
  }
  if (daysRemaining < 0) {
    throw new Error(`${payloadPath}.metrics.days_remaining must be >= 0.`);
  }
  if (!REORDER_DECISION_CONTRACT_V1.risk_levels.includes(stockoutRisk)) {
    throw new Error(`${payloadPath}.metrics.stockout_risk must be one of LOW, MEDIUM, HIGH.`);
  }

  return payload;
};

const assertStockSuggestionModelVotesContractV1 = (value, rowIndex = 0) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`model_votes must be an object at row index ${rowIndex}.`);
  }

  const allowedFields = new Set(['markov', 'baseline']);
  const extraFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown model_votes fields at row index ${rowIndex}: ${extraFields.join(', ')}.`);
  }

  const markov = assertFiniteNumber(value.markov, 'model_votes.markov');
  const baseline = assertFiniteNumber(value.baseline, 'model_votes.baseline');

  if (markov < 0 || markov > 1) {
    throw new Error(`model_votes.markov must be within [0,1] at row index ${rowIndex}.`);
  }
  if (baseline < 0 || baseline > 1) {
    throw new Error(`model_votes.baseline must be within [0,1] at row index ${rowIndex}.`);
  }
  if ((markov + baseline) > 1.000001) {
    throw new Error(`model_votes sum must be <= 1 at row index ${rowIndex}.`);
  }
};

export const assertStockSuggestionRowContractV1 = (row, rowIndex = 0) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Stock suggestion row at index ${rowIndex} must be an object.`);
  }

  const allowedFields = new Set([
    'symbol',
    'buy_quantity',
    'confidence',
    'horizon',
    'decision',
    'model_votes',
    'rationale',
  ]);
  const extraFields = Object.keys(row).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown fields at row index ${rowIndex}: ${extraFields.join(', ')}.`);
  }

  const requiredFields = [
    'symbol',
    'buy_quantity',
    'confidence',
    'horizon',
    'decision',
    'model_votes',
    'rationale',
  ];

  for (const field of requiredFields) {
    if (row[field] === undefined || row[field] === null) {
      throw new Error(`Missing required field "${field}" at row index ${rowIndex}.`);
    }
  }

  const symbol = assertString(row.symbol, 'symbol');
  const buyQuantity = assertFiniteNumber(row.buy_quantity, 'buy_quantity');
  const confidence = assertFiniteNumber(row.confidence, 'confidence');
  const horizon = String(row.horizon || '').trim().toUpperCase();
  const decision = String(row.decision || '').trim().toUpperCase();
  const rationale = assertString(row.rationale, 'rationale');

  if (buyQuantity < 0) {
    throw new Error(`buy_quantity must be >= 0 at row index ${rowIndex}.`);
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error(`confidence must be within [0,1] at row index ${rowIndex}.`);
  }
  if (!STOCK_SUGGESTION_CONTRACT_V1.horizons.includes(horizon)) {
    throw new Error(`horizon must be one of 1W, 1M at row index ${rowIndex}.`);
  }
  if (!STOCK_SUGGESTION_CONTRACT_V1.decisions.includes(decision)) {
    throw new Error(`decision must be one of BUY_NOW, WATCH, HOLD at row index ${rowIndex}.`);
  }

  assertStockSuggestionModelVotesContractV1(row.model_votes, rowIndex);

  if (!symbol || !rationale) {
    throw new Error(`symbol and rationale must be non-empty strings at row index ${rowIndex}.`);
  }

  return row;
};

export const assertMarketDataBarContractV1 = (row, rowIndex = 0) => {
  if (!row || typeof row !== 'object') {
    throw new Error(`Market data row at index ${rowIndex} must be an object.`);
  }

  for (const field of REQUIRED_MARKET_DATA_FIELDS) {
    if (row[field] === undefined || row[field] === null) {
      throw new Error(`Missing required field \"${field}\" at row index ${rowIndex}.`);
    }
  }

  const symbol = assertString(row.symbol, 'symbol').toUpperCase();
  const timestamp = new Date(row.timestamp);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`timestamp must be a valid datetime at row index ${rowIndex}.`);
  }

  const open = assertFiniteNumber(row.open, 'open');
  const high = assertFiniteNumber(row.high, 'high');
  const low = assertFiniteNumber(row.low, 'low');
  const close = assertFiniteNumber(row.close, 'close');
  const volume = assertFiniteNumber(row.volume, 'volume');
  const spread = assertFiniteNumber(row.spread, 'spread');
  const sector = assertString(row.sector, 'sector');

  if (high < low || open > high || open < low || close > high || close < low) {
    throw new Error(`OHLC integrity failed at row index ${rowIndex}.`);
  }

  return {
    ...row,
    symbol,
    timestamp: timestamp.toISOString(),
    open,
    high,
    low,
    close,
    volume,
    spread,
    sector,
  };
};

export const fetchMarketDataContractOnline = async ({ accessToken = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/market-data/contract',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Market data contract request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch market data contract from server.',
  });
};

export const fetchStockUniverseOnline = async ({ accessToken = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/market-data/universe',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Stock universe request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch stock universe from server.',
  });
};

export const fetchMarkovStateSpaceOnline = async ({ accessToken = null } = {}) => {
  return requestBackendJson({
    path: '/api/v1/market-data/states',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Markov state-space request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov state-space from server.',
  });
};

export const ingestMarketDataOnline = async ({
  accessToken,
  rows = [],
  sourceTag = 'frontend_manual_ingestion',
  contractVersion = DATA_CONTRACT_VERSION,
  options = {},
}) => {
  return requestBackendJson({
    path: '/api/v1/market-data/ingest',
    method: 'POST',
    accessToken,
    body: {
      contract_version: contractVersion,
      source_tag: sourceTag,
      rows,
      options,
    },
    timeoutMs: 12000,
    timeoutMessage: 'Market data ingestion request timed out. Please try again.',
    networkErrorMessage: 'Unable to ingest market data to server.',
  });
};

export const fetchMarketDataBarsOnline = async ({
  accessToken,
  symbol = '',
  market = '',
  sector = '',
  start = null,
  end = null,
  limit = 250,
  contractVersion = DATA_CONTRACT_VERSION,
}) => {
  const params = new URLSearchParams();

  if (symbol) {
    params.set('symbol', String(symbol).trim().toUpperCase());
  }
  if (market) {
    params.set('market', String(market).trim().toUpperCase());
  }
  if (sector) {
    params.set('sector', String(sector).trim());
  }
  if (start) {
    params.set('start', new Date(start).toISOString());
  }
  if (end) {
    params.set('end', new Date(end).toISOString());
  }
  params.set('limit', String(Math.max(1, Math.min(Number(limit) || 250, 1000))));
  params.set('contract_version', String(contractVersion || DATA_CONTRACT_VERSION));

  const data = await requestBackendJson({
    path: `/api/v1/market-data/bars?${params.toString()}`,
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Market data bars request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch market data bars from server.',
  });

  const bars = Array.isArray(data?.bars) ? data.bars : [];
  const validatedBars = bars.map((row, index) => {
    const validated = assertMarketDataBarContractV1(row, index);
    const stateToken = String(row?.current_state || '').trim().toUpperCase();
    return {
      ...validated,
      current_state: stateToken || 'SIDEWAYS_STABLE',
      current_state_label: row?.current_state_label
        || MARKET_STATE_LABELS[stateToken]
        || 'Sideways Stable',
      markov_features: row?.markov_features || null,
    };
  });

  return {
    ...data,
    bars: validatedBars,
  };
};

export const fetchBaselinePredictionOnline = async ({
  accessToken,
  symbol,
  asOf = null,
  windows = [7, 30],
}) => {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('symbol is required for baseline prediction.');
  }

  const params = new URLSearchParams();
  params.set('symbol', normalizedSymbol);
  if (asOf) {
    params.set('asOf', new Date(asOf).toISOString());
  }

  const normalizedWindows = Array.isArray(windows)
    ? windows
      .map((item) => Math.max(1, Math.trunc(Number(item) || 0)))
      .filter((item) => item > 0)
    : [];
  if (normalizedWindows.length > 0) {
    params.set('windows', normalizedWindows.join(','));
  }

  return requestBackendJson({
    path: `/api/v1/market-data/predict/baseline?${params.toString()}`,
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
    timeoutMessage: 'Baseline prediction request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch baseline prediction from server.',
  });
};

export const fetchMarkovModelOnline = async ({
  accessToken,
  symbol = '',
  start = null,
  end = null,
  limit = 5000,
  regime = '',
  smoothingAlpha = null,
  useRegimes = null,
  enableConditional = null,
}) => {
  const params = new URLSearchParams();
  if (symbol) {
    params.set('symbol', String(symbol).trim().toUpperCase());
  }
  if (start) {
    params.set('start', new Date(start).toISOString());
  }
  if (end) {
    params.set('end', new Date(end).toISOString());
  }
  params.set('limit', String(Math.max(100, Math.min(Math.trunc(Number(limit) || 5000), 20000))));
  if (regime) {
    params.set('regime', String(regime).trim().toUpperCase());
  }
  if (smoothingAlpha !== null && smoothingAlpha !== undefined) {
    params.set('smoothingAlpha', String(smoothingAlpha));
  }
  if (useRegimes !== null && useRegimes !== undefined) {
    params.set('useRegimes', String(Boolean(useRegimes)));
  }
  if (enableConditional !== null && enableConditional !== undefined) {
    params.set('enableConditional', String(Boolean(enableConditional)));
  }

  return requestBackendJson({
    path: `/api/v1/markov/model?${params.toString()}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
    timeoutMessage: 'Markov model request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov model from server.',
  });
};

export const fetchMarkovMatrixOnline = async ({
  accessToken,
  symbol = '',
  regime = '',
  start = null,
  end = null,
}) => {
  const params = new URLSearchParams();
  if (symbol) {
    params.set('symbol', String(symbol).trim().toUpperCase());
  }
  if (regime) {
    params.set('regime', String(regime).trim().toUpperCase());
  }
  if (start) {
    params.set('start', new Date(start).toISOString());
  }
  if (end) {
    params.set('end', new Date(end).toISOString());
  }

  return requestBackendJson({
    path: `/api/v1/markov/matrix?${params.toString()}`,
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
    timeoutMessage: 'Markov matrix request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov transition matrix from server.',
  });
};

export const predictMarkovNextStateOnline = async ({
  accessToken,
  currentState,
  symbol = '',
  regime = '',
  steps = 1,
  asOf = null,
  queueFeatures = null,
  start = null,
  end = null,
}) => {
  const normalizedCurrentState = String(currentState || '').trim().toUpperCase();
  if (!normalizedCurrentState) {
    throw new Error('currentState is required for Markov prediction.');
  }

  const body = {
    current_state: normalizedCurrentState,
    steps: Math.max(1, Math.min(Math.trunc(Number(steps) || 1), 30)),
  };

  if (symbol) {
    body.symbol = String(symbol).trim().toUpperCase();
  }
  if (regime) {
    body.regime = String(regime).trim().toUpperCase();
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (queueFeatures && typeof queueFeatures === 'object') {
    body.queue_features = queueFeatures;
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }

  const data = await requestBackendJson({
    path: '/api/v1/markov/predict',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 10000,
    timeoutMessage: 'Markov prediction request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov prediction from server.',
  });

  if (data?.shared_features && typeof data.shared_features === 'object') {
    assertSharedFeaturePayloadContractV1(data.shared_features);
  }

  const emaRows = Array.isArray(data?.ema_signals) ? data.ema_signals : [];
  emaRows.forEach((row, index) => {
    assertEmaSignalRowContractV1(row, index);
  });

  if (data?.reorder_decision && typeof data.reorder_decision === 'object') {
    assertReorderDecisionContractV1(data.reorder_decision);
  }

  return data;
};

export const forecastMarkovStochasticOnline = async ({
  accessToken,
  currentState = '',
  symbol = '',
  regime = '',
  simulationCount = null,
  asOf = null,
  queueFeatures = null,
  start = null,
  end = null,
  seed = null,
  includePaths = false,
  horizons = null,
  decisionConstraints = null,
  strategyConfig = null,
}) => {
  const normalizedCurrentState = String(currentState || '').trim().toUpperCase();
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  if (!normalizedCurrentState && !normalizedSymbol) {
    throw new Error('Either currentState or symbol is required for Markov forecast.');
  }

  const body = {};

  if (normalizedCurrentState) {
    body.current_state = normalizedCurrentState;
  }
  if (normalizedSymbol) {
    body.symbol = normalizedSymbol;
  }
  if (regime) {
    body.regime = String(regime).trim().toUpperCase();
  }
  if (simulationCount !== null && simulationCount !== undefined) {
    body.simulation_count = Math.max(1, Math.trunc(Number(simulationCount) || 1));
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (queueFeatures && typeof queueFeatures === 'object') {
    body.queue_features = queueFeatures;
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (seed !== null && seed !== undefined && String(seed).trim()) {
    body.seed = String(seed).trim();
  }

  body.include_paths = Boolean(includePaths);

  if (Array.isArray(horizons) && horizons.length > 0) {
    body.horizons = horizons
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  } else if (typeof horizons === 'string' && horizons.trim()) {
    body.horizons = horizons;
  }

  if (decisionConstraints && typeof decisionConstraints === 'object' && !Array.isArray(decisionConstraints)) {
    body.decision_constraints = decisionConstraints;
  }

  if (strategyConfig && typeof strategyConfig === 'object' && !Array.isArray(strategyConfig)) {
    body.strategy_config = strategyConfig;
  }

  const data = await requestBackendJson({
    path: '/api/v1/markov/forecast',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 15000,
    timeoutMessage: 'Markov forecast request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov forecast from server.',
  });

  if (data?.shared_features && typeof data.shared_features === 'object') {
    assertSharedFeaturePayloadContractV1(data.shared_features);
  }

  const emaRows = Array.isArray(data?.ema_signals) ? data.ema_signals : [];
  emaRows.forEach((row, index) => {
    assertEmaSignalRowContractV1(row, index);
  });

  const suggestionRows = Array.isArray(data?.stock_suggestions) ? data.stock_suggestions : [];
  suggestionRows.forEach((row, index) => {
    assertStockSuggestionRowContractV1(row, index);
  });

  if (data?.reorder_decision && typeof data.reorder_decision === 'object') {
    assertReorderDecisionContractV1(data.reorder_decision);
  }

  return data;
};

export const fetchMarkovFeatureContractOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/features/contract',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Shared feature contract request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch shared feature contract from server.',
  });
};

export const fetchMarkovEmaSignalContractOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/ema/contract',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'EMA signal contract request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch EMA signal contract from server.',
  });
};

export const fetchMarkovReorderDecisionContractOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/reorder/contract',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Reorder contract request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch reorder decision contract from server.',
  });
};

export const fetchMarkovEmaSignalsOnline = async ({
  accessToken,
  symbol = '',
  asOf = null,
  start = null,
  end = null,
  horizons = ['1W', '1M'],
  emaSeries = null,
  queueFeatures = null,
  featureInput = null,
}) => {
  const body = {};

  if (symbol) {
    body.symbol = String(symbol).trim().toUpperCase();
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (Array.isArray(horizons) && horizons.length > 0) {
    body.horizons = horizons.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (Array.isArray(emaSeries) && emaSeries.length > 0) {
    body.ema_series = emaSeries;
  }
  if (queueFeatures && typeof queueFeatures === 'object' && !Array.isArray(queueFeatures)) {
    body.queue_features = queueFeatures;
  }
  if (featureInput && typeof featureInput === 'object' && !Array.isArray(featureInput)) {
    body.feature_input = featureInput;
  }

  const data = await requestBackendJson({
    path: '/api/v1/markov/ema/signal',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 12000,
    timeoutMessage: 'EMA signal request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch EMA signals from server.',
  });

  const rows = Array.isArray(data?.ema_signals) ? data.ema_signals : [];
  rows.forEach((row, index) => {
    assertEmaSignalRowContractV1(row, index);
  });

  if (data?.shared_features && typeof data.shared_features === 'object') {
    assertSharedFeaturePayloadContractV1(data.shared_features);
  }

  return data;
};

export const fetchMarkovReorderDecisionOnline = async ({
  accessToken,
  symbol = '',
  asOf = null,
  start = null,
  end = null,
  queueFeatures = null,
  featureInput = null,
  serviceLevelFactor = null,
  defaultSalesVelocity = null,
  sparseDataMinDays = null,
  overstockMultiplier = null,
}) => {
  const body = {};

  if (symbol) {
    body.symbol = String(symbol).trim().toUpperCase();
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (queueFeatures && typeof queueFeatures === 'object' && !Array.isArray(queueFeatures)) {
    body.queue_features = queueFeatures;
  }
  if (featureInput && typeof featureInput === 'object' && !Array.isArray(featureInput)) {
    body.feature_input = featureInput;
  }
  if (serviceLevelFactor !== null && serviceLevelFactor !== undefined) {
    body.service_level_factor = Number(serviceLevelFactor);
  }
  if (defaultSalesVelocity !== null && defaultSalesVelocity !== undefined) {
    body.default_sales_velocity = Number(defaultSalesVelocity);
  }
  if (sparseDataMinDays !== null && sparseDataMinDays !== undefined) {
    body.sparse_data_min_days = Math.max(1, Math.trunc(Number(sparseDataMinDays) || 1));
  }
  if (overstockMultiplier !== null && overstockMultiplier !== undefined) {
    body.overstock_multiplier = Number(overstockMultiplier);
  }

  const data = await requestBackendJson({
    path: '/api/v1/markov/reorder/decision',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 12000,
    timeoutMessage: 'Reorder decision request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch reorder decision from server.',
  });

  assertReorderDecisionContractV1({
    decision: data?.decision,
    confidence: data?.confidence,
    reason_codes: data?.reason_codes,
    metrics: data?.metrics,
  }, 'reorder_decision');

  if (data?.shared_features && typeof data.shared_features === 'object') {
    assertSharedFeaturePayloadContractV1(data.shared_features);
  }

  return data;
};

export const buildMarkovSharedFeaturesOnline = async ({
  accessToken,
  rawData = {},
}) => {
  const data = await requestBackendJson({
    path: '/api/v1/markov/features/build',
    method: 'POST',
    accessToken,
    body: {
      raw_data: rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData
        : {},
    },
    timeoutMs: 12000,
    timeoutMessage: 'Shared feature build request timed out. Please try again.',
    networkErrorMessage: 'Unable to build shared features on server.',
  });

  if (data?.features && typeof data.features === 'object') {
    assertSharedFeaturePayloadContractV1(data.features);
  }

  return data;
};

export const fetchMarkovStockSuggestionContractOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/suggestions/contract',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Stock suggestion contract request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch stock suggestion contract from server.',
  });
};

export const fetchMarkovStockSuggestionsOnline = async ({
  accessToken,
  currentState = '',
  symbol = '',
  regime = '',
  simulationCount = null,
  asOf = null,
  queueFeatures = null,
  start = null,
  end = null,
  horizons = ['1W', '1M'],
  decisionConstraints = null,
  strategyConfig = null,
  allocationBase = 100,
}) => {
  const normalizedCurrentState = String(currentState || '').trim().toUpperCase();
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  if (!normalizedCurrentState && !normalizedSymbol) {
    throw new Error('Either currentState or symbol is required for stock suggestions.');
  }

  const body = {};

  if (normalizedCurrentState) {
    body.current_state = normalizedCurrentState;
  }
  if (normalizedSymbol) {
    body.symbol = normalizedSymbol;
  }
  if (regime) {
    body.regime = String(regime).trim().toUpperCase();
  }
  if (simulationCount !== null && simulationCount !== undefined) {
    body.simulation_count = Math.max(1, Math.trunc(Number(simulationCount) || 1));
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (queueFeatures && typeof queueFeatures === 'object' && !Array.isArray(queueFeatures)) {
    body.queue_features = queueFeatures;
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }

  if (Array.isArray(horizons) && horizons.length > 0) {
    body.horizons = horizons.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (decisionConstraints && typeof decisionConstraints === 'object' && !Array.isArray(decisionConstraints)) {
    body.decision_constraints = decisionConstraints;
  }
  if (strategyConfig && typeof strategyConfig === 'object' && !Array.isArray(strategyConfig)) {
    body.strategy_config = strategyConfig;
  }

  body.allocation_base = Math.max(0, Number(allocationBase) || 0);

  const data = await requestBackendJson({
    path: '/api/v1/markov/suggestions',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 15000,
    timeoutMessage: 'Stock suggestions request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch stock suggestions from server.',
  });

  const rows = Array.isArray(data?.suggestions) ? data.suggestions : [];
  rows.forEach((row, index) => {
    assertStockSuggestionRowContractV1(row, index);
  });

  if (data?.shared_features && typeof data.shared_features === 'object') {
    assertSharedFeaturePayloadContractV1(data.shared_features);
  }

  const emaRows = Array.isArray(data?.ema_signals) ? data.ema_signals : [];
  emaRows.forEach((row, index) => {
    assertEmaSignalRowContractV1(row, index);
  });

  if (data?.reorder_decision && typeof data.reorder_decision === 'object') {
    assertReorderDecisionContractV1(data.reorder_decision);
  }

  return data;
};

export const evaluateMarkovWalkForwardOnline = async ({
  accessToken,
  symbol = null,
  start = null,
  end = null,
  minTrainSize = 120,
  testSize = 30,
  stepSize = 30,
  maxWindows = null,
  precisionTarget = 0.9,
  decisionConstraints = null,
  strategyConfig = null,
  markovConfig = null,
}) => {
  const body = {
    min_train_size: Math.max(20, Math.trunc(Number(minTrainSize) || 120)),
    test_size: Math.max(5, Math.trunc(Number(testSize) || 30)),
    step_size: Math.max(1, Math.trunc(Number(stepSize) || 30)),
    precision_target: Math.max(0, Math.min(Number(precisionTarget) || 0.9, 1)),
  };

  if (symbol) {
    body.symbol = String(symbol).trim().toUpperCase();
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (maxWindows !== null && maxWindows !== undefined) {
    body.max_windows = Math.max(1, Math.trunc(Number(maxWindows) || 1));
  }

  if (decisionConstraints && typeof decisionConstraints === 'object' && !Array.isArray(decisionConstraints)) {
    body.decision_constraints = decisionConstraints;
  }
  if (strategyConfig && typeof strategyConfig === 'object' && !Array.isArray(strategyConfig)) {
    body.strategy_config = strategyConfig;
  }
  if (markovConfig && typeof markovConfig === 'object' && !Array.isArray(markovConfig)) {
    body.markov_config = markovConfig;
  }

  return requestBackendJson({
    path: '/api/v1/markov/evaluate/walk-forward',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 25000,
    timeoutMessage: 'Walk-forward evaluation request timed out. Please try again.',
    networkErrorMessage: 'Unable to run walk-forward evaluation on server.',
  });
};

export const evaluateMarkovStressOnline = async ({
  accessToken,
  currentState = '',
  symbol = '',
  asOf = null,
  start = null,
  end = null,
  simulationCount = null,
  seed = null,
  horizons = null,
  queueFeatures = null,
  decisionConstraints = null,
  strategyConfig = null,
  markovConfig = null,
}) => {
  const normalizedCurrentState = String(currentState || '').trim().toUpperCase();
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedCurrentState && !normalizedSymbol) {
    throw new Error('Either currentState or symbol is required for Markov stress evaluation.');
  }

  const body = {};
  if (normalizedCurrentState) {
    body.current_state = normalizedCurrentState;
  }
  if (normalizedSymbol) {
    body.symbol = normalizedSymbol;
  }
  if (asOf) {
    body.asOf = new Date(asOf).toISOString();
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (simulationCount !== null && simulationCount !== undefined) {
    body.simulation_count = Math.max(1, Math.trunc(Number(simulationCount) || 1));
  }
  if (seed !== null && seed !== undefined && String(seed).trim()) {
    body.seed = String(seed).trim();
  }
  if (Array.isArray(horizons) && horizons.length > 0) {
    body.horizons = horizons
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  } else if (typeof horizons === 'string' && horizons.trim()) {
    body.horizons = horizons;
  }

  if (queueFeatures && typeof queueFeatures === 'object' && !Array.isArray(queueFeatures)) {
    body.queue_features = queueFeatures;
  }
  if (decisionConstraints && typeof decisionConstraints === 'object' && !Array.isArray(decisionConstraints)) {
    body.decision_constraints = decisionConstraints;
  }
  if (strategyConfig && typeof strategyConfig === 'object' && !Array.isArray(strategyConfig)) {
    body.strategy_config = strategyConfig;
  }
  if (markovConfig && typeof markovConfig === 'object' && !Array.isArray(markovConfig)) {
    body.markov_config = markovConfig;
  }

  return requestBackendJson({
    path: '/api/v1/markov/evaluate/stress',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 25000,
    timeoutMessage: 'Stress evaluation request timed out. Please try again.',
    networkErrorMessage: 'Unable to run stress evaluation on server.',
  });
};

export const fetchMarkovOpsStatusOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/ops/status',
    method: 'GET',
    accessToken,
    timeoutMs: 10000,
    timeoutMessage: 'Markov ops status request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov ops status from server.',
  });
};

export const registerMarkovModelVersionOnline = async ({
  accessToken,
  version,
  symbol = '',
  start = null,
  end = null,
  activate = false,
  setCandidate = false,
  performanceMetrics = null,
  calibrationLayer = null,
  metadata = null,
}) => {
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion) {
    throw new Error('version is required for model registration.');
  }

  const body = {
    version: normalizedVersion,
    activate: Boolean(activate),
    set_candidate: Boolean(setCandidate),
  };

  if (symbol) {
    body.symbol = String(symbol).trim().toUpperCase();
  }
  if (start) {
    body.start = new Date(start).toISOString();
  }
  if (end) {
    body.end = new Date(end).toISOString();
  }
  if (performanceMetrics && typeof performanceMetrics === 'object') {
    body.performance_metrics = performanceMetrics;
  }
  if (calibrationLayer && typeof calibrationLayer === 'object') {
    body.calibration_layer = calibrationLayer;
  }
  if (metadata && typeof metadata === 'object') {
    body.metadata = metadata;
  }

  return requestBackendJson({
    path: '/api/v1/markov/ops/register',
    method: 'POST',
    accessToken,
    body,
    timeoutMs: 15000,
    timeoutMessage: 'Model registration request timed out. Please try again.',
    networkErrorMessage: 'Unable to register model version on server.',
  });
};

export const advanceMarkovRolloutStageOnline = async ({ accessToken } = {}) => {
  return requestBackendJson({
    path: '/api/v1/markov/ops/rollout/advance',
    method: 'POST',
    accessToken,
    body: {},
    timeoutMs: 10000,
    timeoutMessage: 'Rollout advance request timed out. Please try again.',
    networkErrorMessage: 'Unable to advance rollout stage on server.',
  });
};

export const runMarkovDriftMonitoringJobOnline = async ({
  accessToken,
  payload = {},
}) => {
  return requestBackendJson({
    path: '/api/v1/markov/ops/jobs/drift-monitor',
    method: 'POST',
    accessToken,
    body: payload && typeof payload === 'object' ? payload : {},
    timeoutMs: 20000,
    timeoutMessage: 'Drift monitoring job request timed out. Please try again.',
    networkErrorMessage: 'Unable to run drift monitoring job on server.',
  });
};
