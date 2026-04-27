const { success } = require('../../utils/apiResponse');
const { badRequest } = require('../../services/v1/httpError');
const {
  buildModelFromMarketData,
  getP,
  predict,
  evaluateModelHooks,
} = require('../../services/markovService');
const { buildForecastFromModel } = require('../../services/forecastService');
const { runWalkForward } = require('../../evaluation/walkForward');
const { runStressTests } = require('../../evaluation/stressTest');
const {
  listModelVersions,
  getVersionEntry,
  registerModelVersion,
  setActiveModelVersion,
  applyVersionSnapshotToModel,
  recordMonitoringEvent,
  getMonitoringSummary,
} = require('../../registry/modelRegistry');
const { detectDrift } = require('../../monitoring/driftDetector');
const { detectTransitionStability } = require('../../monitoring/stabilityChecker');
const {
  runMonthlyRecalibration,
  runQuarterlyRetraining,
  runDriftMonitoringJob,
} = require('../../jobs/recalibrationJob');
const {
  loadRolloutConfig,
  selectModelVersionForUser,
  setCandidateRolloutVersion,
  advanceRolloutStage,
  executeSafeRollback,
  evaluateRollbackTriggers,
  getFeatureFlags,
  setEnsembleFeatureFlags,
} = require('../../rollout/featureFlag');
const {
  resolveRolloutExecutionForSubject,
  getRolloutStatus,
} = require('../../rollout/rolloutManager');
const {
  recordDecisionEvent,
  recordSuggestionActionEvent,
  recordStockoutIncidentEvent,
  recordServiceErrorEvent,
  getMonitoringMetrics,
} = require('../../monitoring/metricsTracker');
const { evaluateAlertThresholds } = require('../../monitoring/alertSystem');
const {
  STOCK_SUGGESTION_CONTRACT,
  normalizeSuggestionHorizonToken,
  validateStockSuggestionRows,
} = require('../../schema/stockSuggestionSchema');
const {
  SHARED_FEATURE_CONTRACT,
  SHARED_FEATURE_PAYLOAD_SCHEMA,
  SHARED_FEATURE_DEFINITIONS,
  buildFeatures,
} = require('../../features/featureBuilder');
const {
  FEATURE_VALIDATION_RULES,
  validateFeatures,
} = require('../../features/featureValidation');
const {
  FEATURE_FALLBACK_RULES,
  applyFallbacks,
} = require('../../features/fallbackHandler');
const {
  EMA_HORIZONS,
  generateSignal,
} = require('../../models/ema/signalBuilder');
const {
  calibrateSignal,
  EMA_CALIBRATION_DEFAULTS,
} = require('../../models/ema/calibration');
const {
  REORDER_DECISIONS,
  REORDER_REASON_CODES,
  REORDER_DECISION_CONTRACT,
  makeDecision,
} = require('../../models/reorder/decisionEngine');
const { combineModels } = require('../../ensemble/ensembleEngine');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const EMA_SIGNAL_CONTRACT = Object.freeze({
  contract_name: 'ema_signal_output',
  contract_version: 'ema_signal_output_v1',
  locked: true,
  schema: {
    ema_score: 'number',
    trend: 'UP | DOWN | NEUTRAL',
    strength: 'number',
    horizon: '1W | 1M',
  },
});

const STOCK_SUGGESTION_BLEND_WEIGHTS = Object.freeze({
  markov: 0.7,
  ema: 0.3,
});

const REORDER_REASON_LABELS = Object.freeze({
  LOW_STOCK_BELOW_REORDER_POINT: 'Stock is below reorder point.',
  HIGH_STOCKOUT_RISK: 'High stockout risk detected.',
  MEDIUM_STOCKOUT_RISK: 'Moderate stockout risk detected.',
  SUFFICIENT_STOCK: 'Inventory is currently sufficient.',
  NO_SALES_HISTORY: 'No reliable sales history available.',
  ZERO_STOCK_FORCE_REORDER: 'Inventory is zero; reorder is required.',
  OVERSTOCK: 'Current stock level is significantly above threshold.',
  SPARSE_DATA: 'Sparse history reduced confidence.',
  FALLBACK_VELOCITY_USED: 'Fallback demand velocity was used.',
});

const parseIsoDateOrNull = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

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

const parseNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseHorizonsInput = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    const tokens = value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return tokens.length > 0 ? tokens : null;
  }

  const tokens = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return tokens.length > 0 ? tokens : null;
};

const parseObjectOrNull = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
};

const parseArrayOrEmpty = (value) => {
  return Array.isArray(value) ? value : [];
};

const parseEmaHorizonsInput = (value) => {
  const tokens = parseHorizonsInput(value);
  if (!tokens || tokens.length === 0) {
    return [...EMA_HORIZONS];
  }

  const normalized = tokens
    .map((token) => String(token || '').trim().toUpperCase())
    .filter((token) => EMA_HORIZONS.includes(token));

  return normalized.length > 0 ? [...new Set(normalized)] : [...EMA_HORIZONS];
};

const mapForecastHorizonTokenToEma = (value) => {
  const token = String(value || '').trim().toLowerCase();
  if (token === '1_day' || token === '1d') {
    return '1W';
  }
  if (token === '7_day' || token === '7d') {
    return '1W';
  }
  if (token === '1_week' || token === '1w') {
    return '1W';
  }
  if (token === '1_month' || token === '1m') {
    return '1M';
  }
  return null;
};

const mapForecastHorizonTokenToSuggestion = (value) => {
  const token = mapForecastHorizonToSuggestionHorizon(value);
  if (token) {
    return token;
  }

  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === '1D' || normalized === '7D' || normalized === '1W' || normalized === '1M') {
    return normalized;
  }

  return null;
};

const normalizeReasonCodes = (codes = []) => {
  return Array.isArray(codes)
    ? codes
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean)
    : [];
};

const humanizeReasonCodes = (codes = []) => {
  return normalizeReasonCodes(codes).map((code) => REORDER_REASON_LABELS[code] || code);
};

const HIGH_DEMAND_FORECAST_STATES = new Set([
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RECOVERY_PHASE',
]);

const LOW_DEMAND_FORECAST_STATES = new Set([
  'DOWNTREND',
  'LIQUIDITY_STRESS',
]);

const STABLE_FORECAST_STATES = new Set([
  'SIDEWAYS_STABLE',
  'QUEUE_PRESSURE',
  'HIGH_VOLATILITY',
]);

const roundToSix = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(6));
};

const normalizeDemandRegimeDistribution = (stateDistribution = {}) => {
  if (!stateDistribution || typeof stateDistribution !== 'object' || Array.isArray(stateDistribution)) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  let highDemand = 0;
  let lowDemand = 0;
  let stable = 0;

  for (const [stateKey, probabilityRaw] of Object.entries(stateDistribution)) {
    const probability = Math.max(0, Number(probabilityRaw || 0));
    const state = String(stateKey || '').trim().toUpperCase();

    if (HIGH_DEMAND_FORECAST_STATES.has(state)) {
      highDemand += probability;
      continue;
    }

    if (LOW_DEMAND_FORECAST_STATES.has(state)) {
      lowDemand += probability;
      continue;
    }

    if (STABLE_FORECAST_STATES.has(state)) {
      stable += probability;
      continue;
    }

    stable += probability;
  }

  const total = highDemand + lowDemand + stable;
  if (total <= 0) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  return {
    HIGH_DEMAND: roundToSix(highDemand / total),
    LOW_DEMAND: roundToSix(lowDemand / total),
    STABLE: roundToSix(stable / total),
  };
};

const computeNormalizedEntropy = (distribution = {}) => {
  const probabilities = [
    Number(distribution?.HIGH_DEMAND || 0),
    Number(distribution?.LOW_DEMAND || 0),
    Number(distribution?.STABLE || 0),
  ]
    .map((value) => Math.max(0, value))
    .filter((value) => value > 0);

  if (probabilities.length === 0) {
    return 1;
  }

  const entropy = probabilities.reduce((sum, probability) => {
    return sum - (probability * Math.log2(probability));
  }, 0);

  return clamp(entropy / Math.log2(3), 0, 1);
};

const resolveDemandRegimeFromDistribution = (distribution = {}) => {
  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return 'STABLE';
  }

  const sorted = [...entries].sort((left, right) => Number(right[1]) - Number(left[1]));
  return String(sorted[0][0] || 'STABLE').trim().toUpperCase() || 'STABLE';
};

const resolveInventoryLevel = ({
  sharedFeatures = {},
  body = {},
} = {}) => {
  const explicit = parseNumberOrNull(
    body?.current_inventory
    ?? body?.inventory_level
    ?? body?.stock_level
    ?? body?.feature_input?.current_inventory
    ?? body?.feature_input?.inventory_level
    ?? body?.feature_input?.stock_level
  );

  if (explicit !== null) {
    return Math.max(0, explicit);
  }

  const stockCoverage = parseNumberOrNull(sharedFeatures?.stock_position);
  const velocity = parseNumberOrNull(sharedFeatures?.sales_velocity);

  if (stockCoverage !== null && velocity !== null) {
    return Math.max(0, stockCoverage * velocity);
  }

  return 0;
};

const buildReorderDecisionFromSharedFeatures = ({
  sharedFeatures = {},
  sourceContext = {},
  body = {},
} = {}) => {
  const features = {
    sales_velocity: Number(sharedFeatures?.sales_velocity || 0),
    stock_position: resolveInventoryLevel({ sharedFeatures, body }),
    lead_time: Number(sharedFeatures?.lead_time || 0),
    volatility: Number(sharedFeatures?.volatility || 0),
    sample_days: Math.max(0, Math.trunc(Number(sourceContext?.sales_rows || 0))),
  };

  return makeDecision(features, {
    z: parseNumberOrNull(body?.service_level_factor ?? body?.z_score ?? body?.z) ?? 1.65,
    defaultSalesVelocity: parseNumberOrNull(body?.default_sales_velocity) ?? 0.1,
    sparseDataMinDays: Math.max(1, Math.trunc(Number(body?.sparse_data_min_days ?? 14))),
    overstockMultiplier: parseNumberOrNull(body?.overstock_multiplier) ?? 1.5,
    sampleDays: features.sample_days,
  });
};

const buildReorderBySuggestionHorizon = ({
  reorderDecision,
  forecastHorizons = [],
} = {}) => {
  const output = {
    DEFAULT: reorderDecision,
  };

  const tokens = Array.isArray(forecastHorizons) ? forecastHorizons : [];
  for (const token of tokens) {
    const mapped = mapForecastHorizonTokenToSuggestion(token);
    if (mapped) {
      output[mapped] = reorderDecision;
    }
  }

  return output;
};

const buildEmaSignalsFromContext = ({
  model = null,
  symbol = '',
  asOf = null,
  body = {},
  sharedFeatures = null,
  horizons = null,
} = {}) => {
  const normalizedBody = body && typeof body === 'object' ? body : {};

  const explicitSeries = parseArrayOrEmpty(
    normalizedBody?.ema_series
    ?? normalizedBody?.emaSeries
    ?? normalizedBody?.series
  )
    .map((item) => {
      if (typeof item === 'number') {
        return Number(item);
      }
      if (!item || typeof item !== 'object') {
        return NaN;
      }
      return Number(item.value ?? item.close ?? item.price ?? item.units_sold ?? item.quantity);
    })
    .filter((value) => Number.isFinite(value));

  const rowsFromModel = resolveObservationRowsForSymbol({
    model,
    symbol,
    asOf,
    maxRows: 400,
  });

  const fallbackSeries = rowsFromModel
    .map((row) => Number(row?.close ?? row?.value ?? row?.units_sold ?? NaN))
    .filter((value) => Number.isFinite(value));

  const series = explicitSeries.length > 0 ? explicitSeries : fallbackSeries;
  const emaHorizons = Array.isArray(horizons) && horizons.length > 0
    ? horizons
    : parseEmaHorizonsInput(
      normalizedBody?.ema_horizons
      ?? normalizedBody?.emaHorizons
      ?? normalizedBody?.horizons
    );

  const volatility = Number(sharedFeatures?.volatility);
  const safeVolatility = Number.isFinite(volatility) ? Math.max(0, volatility) : 0;

  const outputRows = emaHorizons.map((horizon) => {
    const signal = generateSignal({
      series,
      horizon,
      volatility: safeVolatility,
      key: 'value',
    });

    const calibrated = calibrateSignal(signal, {
      method: String(normalizedBody?.ema_calibration_method || '').trim().toLowerCase() || 'linear',
      calibration: EMA_CALIBRATION_DEFAULTS,
    });

    return {
      ema_score: Number(calibrated.ema_score),
      trend: String(calibrated.trend || 'NEUTRAL').trim().toUpperCase(),
      strength: Number(calibrated.strength),
      horizon: String(calibrated.horizon || horizon).trim().toUpperCase(),
    };
  });

  const byHorizon = {};
  for (const row of outputRows) {
    byHorizon[row.horizon] = row;
  }

  return {
    ema_signals: outputRows,
    ema_signals_by_horizon: byHorizon,
    series_points: series.length,
  };
};

const normalizeRowsByTimestamp = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];

  return safeRows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const timestamp = parseIsoDateOrNull(row.timestamp || row.occurred_at || row.occurredAt || row.t);
      return {
        ...row,
        timestamp: timestamp ? timestamp.toISOString() : null,
      };
    })
    .filter((row) => row.timestamp)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
};

const resolveObservationRowsForSymbol = ({
  model,
  symbol = '',
  asOf = null,
  maxRows = 180,
} = {}) => {
  const sequences = Array.isArray(model?._sequences) ? model._sequences : [];
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const anchor = asOf ? parseIsoDateOrNull(asOf) : new Date();
  const anchorMs = anchor ? anchor.getTime() : Number.POSITIVE_INFINITY;

  const rows = [];
  for (const sequence of sequences) {
    const sequenceSymbol = String(sequence?.entity_id || '').trim().toUpperCase();
    if (normalizedSymbol && sequenceSymbol !== normalizedSymbol) {
      continue;
    }

    for (const point of Array.isArray(sequence?.points) ? sequence.points : []) {
      const observation = point?.observation;
      const ts = parseIsoDateOrNull(observation?.timestamp || point?.t);
      if (!observation || !ts || ts.getTime() > anchorMs) {
        continue;
      }

      rows.push({
        ...observation,
        timestamp: ts.toISOString(),
      });
    }
  }

  const ordered = normalizeRowsByTimestamp(rows);
  const safeLimit = Math.max(20, Math.min(Math.trunc(Number(maxRows) || 180), 1000));
  if (ordered.length <= safeLimit) {
    return ordered;
  }

  return ordered.slice(ordered.length - safeLimit);
};

const parseFeatureInputPayload = (body = {}) => {
  const explicit = parseObjectOrNull(body?.feature_input ?? body?.featureInput) || {};
  return explicit;
};

const buildSharedFeaturePayloadFromContext = ({
  model,
  symbol = '',
  asOf = null,
  queueFeatures = null,
  body = {},
} = {}) => {
  const featureInput = parseFeatureInputPayload(body);
  const rowsFromModel = resolveObservationRowsForSymbol({
    model,
    symbol,
    asOf,
    maxRows: 365,
  });

  const anchorIso = (parseIsoDateOrNull(featureInput?.anchor_timestamp ?? featureInput?.anchorTimestamp)
    || parseIsoDateOrNull(asOf)
    || parseIsoDateOrNull(rowsFromModel[rowsFromModel.length - 1]?.timestamp))
    ?.toISOString() || null;

  const marketRows = Array.isArray(featureInput?.market_rows)
    ? normalizeRowsByTimestamp(featureInput.market_rows)
    : rowsFromModel;

  const salesRows = Array.isArray(featureInput?.sales_rows)
    ? featureInput.sales_rows
    : marketRows.map((row) => ({
      timestamp: row.timestamp,
      units_sold: Number(row?.units_sold ?? row?.quantity ?? row?.demand ?? row?.volume ?? 0),
    }));

  const rawData = {
    ...featureInput,
    anchor_timestamp: anchorIso,
    market_rows: marketRows,
    sales_rows: salesRows,
    queue_features: featureInput?.queue_features || queueFeatures || null,
    current_inventory: featureInput?.current_inventory
      ?? featureInput?.inventory_level
      ?? parseNumberOrNull(body?.current_inventory ?? body?.inventory_level ?? body?.stock_level),
    lead_time_days: featureInput?.lead_time_days
      ?? parseNumberOrNull(body?.lead_time_days ?? body?.leadTimeDays ?? body?.lead_time),
    supplier_delay_estimate: featureInput?.supplier_delay_estimate
      ?? parseNumberOrNull(body?.supplier_delay_estimate ?? body?.supplier_delay_days ?? body?.supplierDelayDays),
    backlog_orders: featureInput?.backlog_orders
      ?? parseNumberOrNull(body?.backlog_orders ?? body?.backlogOrders),
    pending_demand: featureInput?.pending_demand
      ?? parseNumberOrNull(body?.pending_demand ?? body?.pendingDemand),
    supply_capacity: featureInput?.supply_capacity
      ?? parseNumberOrNull(body?.supply_capacity ?? body?.supplyCapacity),
    historical_average_sales_velocity: featureInput?.historical_average_sales_velocity
      ?? parseNumberOrNull(body?.historical_average_sales_velocity ?? body?.historicalAverageSalesVelocity),
    minimum_safe_stock_level: featureInput?.minimum_safe_stock_level
      ?? parseNumberOrNull(body?.minimum_safe_stock_level ?? body?.minimumSafeStockLevel),
    default_lead_time_days: featureInput?.default_lead_time_days
      ?? parseNumberOrNull(body?.default_lead_time_days ?? body?.defaultLeadTimeDays),
    historical_volatility: featureInput?.historical_volatility
      ?? parseNumberOrNull(body?.historical_volatility ?? body?.historicalVolatility),
  };

  const computed = buildFeatures(rawData);
  const fallback = applyFallbacks(computed, rawData);
  const validation = validateFeatures(fallback.features, { sanitize: true });

  return {
    features: validation.features,
    quality: {
      valid: validation.valid,
      issues: validation.issues,
      applied_fallbacks: fallback.applied_fallbacks,
      deterministic: true,
      contract_version: SHARED_FEATURE_CONTRACT.contract_version,
    },
    source_context: {
      market_rows: marketRows.length,
      sales_rows: salesRows.length,
      anchor_timestamp: anchorIso,
    },
  };
};

const mapDecisionToSuggestionClass = (action = '') => {
  const normalized = String(action || '').trim().toUpperCase();
  if (normalized === 'ACCUMULATE') {
    return 'BUY_NOW';
  }
  if (normalized === 'HOLD') {
    return 'HOLD';
  }
  return 'WATCH';
};

const mapForecastHorizonToSuggestionHorizon = (value = '') => {
  const token = normalizeSuggestionHorizonToken(value);
  if (token) {
    return token;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '1_day') {
    return '1D';
  }
  if (normalized === '7_day') {
    return '7D';
  }
  if (normalized === '1_week') {
    return '7D';
  }
  if (normalized === '1_month') {
    return '1M';
  }

  return null;
};

const mapSuggestionHorizonToForecastHorizon = (value = '') => {
  const token = normalizeSuggestionHorizonToken(value);
  if (token === '1D') {
    return '1_day';
  }
  if (token === '7D') {
    return '1_week';
  }
  if (token === '1W') {
    return '1_week';
  }
  if (token === '1M') {
    return '1_month';
  }
  return null;
};

const buildSuggestionRationale = (horizonForecast = {}) => {
  const decisionReasons = Array.isArray(horizonForecast?.decision?.reason)
    ? horizonForecast.decision.reason
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    : [];

  if (decisionReasons.length > 0) {
    return decisionReasons.join(' ');
  }

  const failureReasons = Array.isArray(horizonForecast?.failure_report?.reasons)
    ? horizonForecast.failure_report.reasons
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    : [];

  if (failureReasons.length > 0) {
    return `Risk controls active: ${failureReasons.join(', ')}.`;
  }

  return 'Model consensus is neutral with stable risk conditions.';
};

const buildStockSuggestionRows = ({
  symbol = '',
  forecast = {},
  allocationBase = 100,
  emaSignalsByHorizon = {},
  reorderByHorizon = {},
} = {}) => {
  const safeSymbol = String(symbol || '').trim().toUpperCase()
    || String(forecast?.inferred_from_symbol || '').trim().toUpperCase()
    || 'UNKNOWN';

  const safeAllocationBase = Math.max(0, Number.isFinite(Number(allocationBase))
    ? Number(allocationBase)
    : 100);

  const horizons = forecast?.horizons && typeof forecast.horizons === 'object'
    ? forecast.horizons
    : {};

  const rows = Object.entries(horizons)
    .map(([forecastHorizon, horizonForecast]) => {
      const suggestionHorizon = mapForecastHorizonToSuggestionHorizon(forecastHorizon);
      if (!suggestionHorizon) {
        return null;
      }

      const rawConfidence = Number(horizonForecast?.decision?.confidence);
      const markovConfidence = Number.isFinite(rawConfidence)
        ? clamp(rawConfidence, 0, 1)
        : clamp(Number(horizonForecast?.failure_report?.confidence?.score || 0), 0, 1);

      const emaSignal = emaSignalsByHorizon?.[suggestionHorizon] || null;
      const emaScore = Number.isFinite(Number(emaSignal?.ema_score))
        ? clamp(Number(emaSignal.ema_score), 0, 1)
        : null;

      const confidence = emaScore === null
        ? markovConfidence
        : clamp(
          (markovConfidence * STOCK_SUGGESTION_BLEND_WEIGHTS.markov)
          + (emaScore * STOCK_SUGGESTION_BLEND_WEIGHTS.ema),
          0,
          1
        );

      const decision = mapDecisionToSuggestionClass(horizonForecast?.decision?.action);
      const reorderDecision = reorderByHorizon?.[suggestionHorizon] || reorderByHorizon?.DEFAULT || null;
      const reorderDecisionToken = String(reorderDecision?.decision || '').trim().toUpperCase();
      const reorderConfidence = Number.isFinite(Number(reorderDecision?.confidence))
        ? clamp(Number(reorderDecision.confidence), 0, 1)
        : null;

      const blendedConfidence = reorderConfidence === null
        ? confidence
        : clamp((0.8 * confidence) + (0.2 * reorderConfidence), 0, 1);

      let finalDecision = decision;
      if (reorderDecisionToken === REORDER_DECISIONS.REORDER) {
        finalDecision = 'BUY_NOW';
      } else if (reorderDecisionToken === REORDER_DECISIONS.NO_REORDER && decision === 'BUY_NOW') {
        finalDecision = 'WATCH';
      }

      const targetExposure = clamp(Number(horizonForecast?.decision?.target_exposure || 0), 0, 1);
      const buyQuantity = finalDecision === 'BUY_NOW'
        ? Math.max(0, Number((targetExposure * safeAllocationBase).toFixed(6)))
        : 0;

      const markovVote = Number((emaScore === null
        ? 1
        : STOCK_SUGGESTION_BLEND_WEIGHTS.markov).toFixed(6));
      const baselineVote = Number((1 - markovVote).toFixed(6));

      const rationaleText = buildSuggestionRationale(horizonForecast);
      const emaTag = emaSignal
        ? ` EMA ${emaSignal.horizon} trend ${emaSignal.trend} (score ${Number(emaSignal.ema_score).toFixed(2)}).`
        : '';
      const reorderTag = reorderDecision
        ? ` Reorder model: ${reorderDecision.decision} (${humanizeReasonCodes(reorderDecision.reason_codes).join(' ')})`
        : '';

      return {
        symbol: safeSymbol,
        buy_quantity: buyQuantity,
        confidence: Number(blendedConfidence.toFixed(6)),
        horizon: suggestionHorizon,
        decision: finalDecision,
        model_votes: {
          markov: markovVote,
          baseline: baselineVote,
        },
        rationale: `${rationaleText}${emaTag}${reorderTag}`.trim(),
      };
    })
    .filter(Boolean);

  return validateStockSuggestionRows(rows, { enforceVoteSum: true });
};

const resolveOperationalModelForUser = ({
  model,
  userId,
} = {}) => {
  const registryState = listModelVersions();
  const rolloutConfig = loadRolloutConfig();
  const rolloutDecision = selectModelVersionForUser({
    userId,
    registryState,
    rolloutConfig,
  });

  const versionEntry = rolloutDecision.selected_version
    ? getVersionEntry(rolloutDecision.selected_version)
    : null;

  const operationalModel = versionEntry
    ? applyVersionSnapshotToModel(model, versionEntry)
    : model;

  return {
    model: operationalModel,
    rolloutDecision,
    versionEntry,
  };
};

const buildMarkovConfigOverrideFromQuery = (query = {}) => {
  const smoothingAlpha = parseNumberOrNull(query.smoothingAlpha);
  const maxGapDays = parseNumberOrNull(query.maxGapDays);
  const useRegimes = parseBoolean(query.useRegimes, undefined);
  const enableConditional = parseBoolean(query.enableConditional, undefined);

  const override = {};
  if (smoothingAlpha !== null) {
    override.smoothingAlpha = Math.max(0.1, Math.min(smoothingAlpha, 1));
  }
  if (maxGapDays !== null) {
    override.maxGapDays = Math.max(1, Math.min(Math.trunc(maxGapDays), 90));
  }
  if (useRegimes !== undefined) {
    override.useRegimes = useRegimes;
  }
  if (enableConditional !== undefined) {
    override.enableConditional = enableConditional;
  }

  return Object.keys(override).length > 0 ? override : null;
};

const parseModelQueryContext = (query = {}) => {
  return {
    symbol: String(query.symbol || '').trim().toUpperCase(),
    start: parseIsoDateOrNull(query.start),
    end: parseIsoDateOrNull(query.end),
    limit: Math.max(100, Math.min(Math.trunc(Number(query.limit) || 5000), 20000)),
    regime: String(query.regime || '').trim().toUpperCase() || null,
    configOverride: buildMarkovConfigOverrideFromQuery(query),
  };
};

const getMarkovModel = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const context = parseModelQueryContext(req.query || {});

  const { model, source_rows: sourceRows } = await buildModelFromMarketData({
    userId,
    symbol: context.symbol,
    start: context.start,
    end: context.end,
    limit: context.limit,
    config: context.configOverride,
  });

  return success(req, res, {
    source_rows: sourceRows,
    states: model.states,
    config: model.config_snapshot,
    metadata: model.metadata,
    conditional_extension: model.conditional_extension,
    global_matrix: model.global_matrix,
    regime_matrices: model.regime_matrices,
  });
});

const getMarkovMatrix = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const context = parseModelQueryContext(req.query || {});

  const { model } = await buildModelFromMarketData({
    userId,
    symbol: context.symbol,
    start: context.start,
    end: context.end,
    limit: context.limit,
    config: context.configOverride,
  });

  const matrix = getP({ model, regime: context.regime });

  return success(req, res, {
    regime: context.regime || 'GLOBAL',
    states: model.states,
    transition_matrix: matrix,
  });
});

const postMarkovPredict = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const userId = getUserIdFromReq(req);

  const currentState = String(req.body?.current_state || '').trim().toUpperCase();
  if (!currentState) {
    throw badRequest('current_state is required in request body.', [
      {
        field: 'current_state',
        reason: 'required',
      },
    ]);
  }

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  const regime = String(req.body?.regime || req.query?.regime || '').trim().toUpperCase() || null;
  const queueFeatures = req.body?.queue_features && typeof req.body.queue_features === 'object'
    ? req.body.queue_features
    : null;
  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);
  const steps = Math.max(1, Math.min(Math.trunc(Number(req.body?.steps || 1)), 30));

  const { model } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    config: buildMarkovConfigOverrideFromQuery(req.body || {}),
  });

  const operational = resolveOperationalModelForUser({
    model,
    userId,
  });

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures,
    body: req.body || {},
  });

  const emaPayload = buildEmaSignalsFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    body: req.body || {},
    sharedFeatures: sharedFeaturePayload.features,
    horizons: parseEmaHorizonsInput(req.body?.horizons ?? req.query?.horizons),
  });

  const reorderDecision = buildReorderDecisionFromSharedFeatures({
    sharedFeatures: sharedFeaturePayload.features,
    sourceContext: sharedFeaturePayload.source_context,
    body: req.body || {},
  });

  const prediction = predict({
    model: operational.model,
    currentState,
    regime,
    steps,
    queueFeatures,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
  });

  recordMonitoringEvent({
    eventType: 'model_usage',
    modelVersion: operational.rolloutDecision.selected_version,
    userId,
    endpoint: '/api/v1/markov/predict',
    latencyMs: Date.now() - startedAt,
    fallbackRate: 0,
    errorRate: 0,
    payload: {
      used_candidate: operational.rolloutDecision.used_candidate,
      rollout_percent: operational.rolloutDecision.rollout_percent,
      bucket: operational.rolloutDecision.bucket,
    },
  });

  return success(req, res, {
    ...prediction,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
    ema_signals: emaPayload.ema_signals,
    reorder_decision: {
      decision: reorderDecision.decision,
      confidence: reorderDecision.confidence,
      reason_codes: reorderDecision.reason_codes,
      reason_text: humanizeReasonCodes(reorderDecision.reason_codes),
      metrics: reorderDecision.metrics,
    },
    operational_model: {
      selected_version: operational.rolloutDecision.selected_version,
      active_version: operational.rolloutDecision.active_version,
      candidate_version: operational.rolloutDecision.candidate_version,
      used_candidate: operational.rolloutDecision.used_candidate,
      rollout_percent: operational.rolloutDecision.rollout_percent,
      bucket: operational.rolloutDecision.bucket,
    },
  });
});

const getMarkovStockSuggestionContract = asyncHandler(async (req, res) => {
  return success(req, res, STOCK_SUGGESTION_CONTRACT);
});

const getMarkovFeatureContract = asyncHandler(async (req, res) => {
  return success(req, res, {
    ...SHARED_FEATURE_CONTRACT,
    schema: SHARED_FEATURE_PAYLOAD_SCHEMA,
    definitions: SHARED_FEATURE_DEFINITIONS,
    validation_rules: FEATURE_VALIDATION_RULES,
    fallback_rules: FEATURE_FALLBACK_RULES,
  });
});

const getMarkovEmaSignalContract = asyncHandler(async (req, res) => {
  return success(req, res, EMA_SIGNAL_CONTRACT);
});

const getMarkovReorderDecisionContract = asyncHandler(async (req, res) => {
  return success(req, res, REORDER_DECISION_CONTRACT);
});

const postMarkovBuildFeatures = asyncHandler(async (req, res) => {
  const rawData = parseObjectOrNull(req.body?.raw_data ?? req.body?.rawData)
    || (req.body && typeof req.body === 'object' ? req.body : {});

  const computed = buildFeatures(rawData);
  const fallback = applyFallbacks(computed, rawData);
  const validation = validateFeatures(fallback.features, { sanitize: true });

  return success(req, res, {
    contract_name: SHARED_FEATURE_CONTRACT.contract_name,
    contract_version: SHARED_FEATURE_CONTRACT.contract_version,
    features: validation.features,
    quality: {
      valid: validation.valid,
      issues: validation.issues,
      applied_fallbacks: fallback.applied_fallbacks,
      deterministic: true,
    },
  });
});

const postMarkovEmaSignal = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();

  const explicitSeries = parseArrayOrEmpty(
    req.body?.ema_series
    ?? req.body?.emaSeries
    ?? req.body?.series
  );

  if (!symbol && explicitSeries.length === 0) {
    throw badRequest('Either symbol or ema_series is required for EMA signal generation.', [
      {
        field: 'symbol|ema_series',
        reason: 'required',
      },
    ]);
  }

  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);

  const model = symbol
    ? (await buildModelFromMarketData({
      userId,
      symbol,
      start,
      end,
      config: buildMarkovConfigOverrideFromQuery({
        ...(req.query || {}),
        ...(req.body || {}),
      }),
    })).model
    : null;

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures: req.body?.queue_features,
    body: req.body || {},
  });

  const emaPayload = buildEmaSignalsFromContext({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    body: req.body || {},
    sharedFeatures: sharedFeaturePayload.features,
    horizons: parseEmaHorizonsInput(req.body?.horizons ?? req.query?.horizons),
  });

  return success(req, res, {
    contract_name: EMA_SIGNAL_CONTRACT.contract_name,
    contract_version: EMA_SIGNAL_CONTRACT.contract_version,
    symbol: symbol || null,
    as_of: asOf ? asOf.toISOString() : null,
    ema_signals: emaPayload.ema_signals,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
  });
});

const postMarkovReorderDecision = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();

  const featureInput = parseObjectOrNull(req.body?.feature_input ?? req.body?.featureInput);
  const hasDirectFeatureInput = featureInput && typeof featureInput === 'object';

  if (!symbol && !hasDirectFeatureInput) {
    throw badRequest('Either symbol or feature_input is required for reorder decision.', [
      {
        field: 'symbol|feature_input',
        reason: 'required',
      },
    ]);
  }

  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);

  let model = null;
  if (symbol) {
    model = (await buildModelFromMarketData({
      userId,
      symbol,
      start,
      end,
      config: buildMarkovConfigOverrideFromQuery({
        ...(req.query || {}),
        ...(req.body || {}),
      }),
    })).model;
  }

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures: req.body?.queue_features,
    body: req.body || {},
  });

  const reorderDecision = buildReorderDecisionFromSharedFeatures({
    sharedFeatures: sharedFeaturePayload.features,
    sourceContext: sharedFeaturePayload.source_context,
    body: req.body || {},
  });

  return success(req, res, {
    contract_name: REORDER_DECISION_CONTRACT.contract_name,
    contract_version: REORDER_DECISION_CONTRACT.contract_version,
    symbol: symbol || null,
    as_of: asOf ? asOf.toISOString() : null,
    decision: reorderDecision.decision,
    confidence: reorderDecision.confidence,
    reason_codes: reorderDecision.reason_codes,
    reason_text: humanizeReasonCodes(reorderDecision.reason_codes),
    metrics: reorderDecision.metrics,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
  });
});

const buildBaselineFallbackDecision = ({
  symbol,
  horizon,
  thresholdInput,
  decisionMode,
  suggestedOrderQuantity,
  reason,
} = {}) => {
  const thresholdToken = String(thresholdInput?.decision || '').trim().toUpperCase();
  const thresholdDecision = thresholdToken === 'REORDER' || thresholdToken === 'BUY_NOW'
    ? 'REORDER'
    : 'NO_REORDER';

  const thresholdConfidence = clamp(Number(thresholdInput?.confidence ?? 0.5), 0.05, 0.99);

  if (decisionMode === 'REORDER_NO_REORDER') {
    return {
      symbol,
      horizon,
      decision: thresholdDecision,
      confidence: Number(thresholdConfidence.toFixed(6)),
      model_breakdown: {
        ema: 0,
        threshold: 1,
        markov: 0,
      },
      weights: {
        ema: 0,
        threshold: 1,
        markov: 0,
      },
      model_votes: {
        ema: 0,
        threshold: 1,
        markov: 0,
      },
      buy_quantity: thresholdDecision === 'REORDER'
        ? Math.max(1, Math.trunc(Number(suggestedOrderQuantity || 1)))
        : 0,
      rationale: `Ensemble disabled; threshold baseline used (${reason}).`,
      diagnostics: {
        score: thresholdDecision === 'REORDER' ? 1 : 0,
        agreement: 1,
        uncertainty: 1 - thresholdConfidence,
        fallback_applied: true,
        fallback_notes: [`threshold_only_baseline: ${reason}`],
      },
    };
  }

  return {
    symbol,
    horizon,
    decision: thresholdDecision === 'REORDER' ? 'BUY_NOW' : 'HOLD',
    confidence: Number(thresholdConfidence.toFixed(6)),
    model_breakdown: {
      ema: 0,
      threshold: 1,
      markov: 0,
    },
    weights: {
      ema: 0,
      threshold: 1,
      markov: 0,
    },
    model_votes: {
      ema: 0,
      threshold: 1,
      markov: 0,
    },
    buy_quantity: thresholdDecision === 'REORDER'
      ? Math.max(1, Math.trunc(Number(suggestedOrderQuantity || 1)))
      : 0,
    rationale: `Ensemble disabled; threshold baseline used (${reason}).`,
    diagnostics: {
      score: thresholdDecision === 'REORDER' ? 1 : 0,
      agreement: 1,
      uncertainty: 1 - thresholdConfidence,
      fallback_applied: true,
      fallback_notes: [`threshold_only_baseline: ${reason}`],
    },
  };
};

const postMarkovEnsembleDecision = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const userId = getUserIdFromReq(req) || null;
  const symbol = String(req.body?.symbol || '').trim().toUpperCase() || 'UNKNOWN';
  const productId = String(req.body?.product_id || req.body?.productId || symbol || 'GLOBAL').trim().toUpperCase();
  const horizon = normalizeSuggestionHorizonToken(req.body?.horizon) || '1W';

  const emaInput = parseObjectOrNull(req.body?.ema) || {};
  const thresholdInput = parseObjectOrNull(req.body?.threshold) || {};
  const markovInput = parseObjectOrNull(req.body?.markov) || {};
  const context = parseObjectOrNull(req.body?.context) || {};

  const hasUsableSignal =
    (Object.keys(emaInput).length > 0)
    || (Object.keys(thresholdInput).length > 0)
    || (Object.keys(markovInput).length > 0);

  if (!hasUsableSignal) {
    throw badRequest('At least one model signal (ema|threshold|markov) is required.', [
      {
        field: 'ema|threshold|markov',
        reason: 'required',
      },
    ]);
  }

  const rawThresholdDecision = String(thresholdInput?.decision || '').trim().toUpperCase();
  const normalizedThresholdDecision = rawThresholdDecision === 'REORDER' || rawThresholdDecision === 'BUY_NOW'
    ? 'REORDER'
    : 'NO_REORDER';

  const markovDistribution = parseObjectOrNull(
    markovInput?.next_state_distribution
    ?? markovInput?.distribution
    ?? markovInput?.diagnostics?.distribution
  ) || {};

  const decisionMode = String(req.body?.decision_mode || req.body?.decisionMode || 'BUY_NOW_WATCH_HOLD')
    .trim()
    .toUpperCase();

  const suggestedOrderQuantity = Math.max(
    0,
    Math.trunc(Number(
      req.body?.suggested_order_quantity
      ?? req.body?.suggestedOrderQuantity
      ?? req.body?.buy_quantity
      ?? req.body?.buyQuantity
      ?? 0
    ) || 0)
  );

  const rolloutConfig = loadRolloutConfig();
  const rolloutExecution = resolveRolloutExecutionForSubject({
    userId,
    productId,
    rolloutConfig,
  });
  const featureFlags = getFeatureFlags(rolloutConfig);

  let ensemble = null;
  let rolloutReason = rolloutExecution.reason;

  if (rolloutExecution.use_ensemble) {
    ensemble = combineModels({
      symbol,
      horizon,
      mode: decisionMode === 'REORDER_NO_REORDER' ? 'REORDER_NO_REORDER' : 'BUY_NOW_WATCH_HOLD',
      suggestedOrderQuantity,
      ema: {
        ema_score: Number(emaInput?.ema_score ?? emaInput?.score ?? 0.5),
        trend: String(emaInput?.trend || 'NEUTRAL').trim().toUpperCase() || 'NEUTRAL',
      },
      threshold: {
        decision: normalizedThresholdDecision,
        confidence: Number(thresholdInput?.confidence ?? 0.5),
      },
      markov: {
        confidence: Number(markovInput?.confidence ?? 0),
        uncertainty: Number(markovInput?.uncertainty ?? 1),
        next_state_distribution: markovDistribution,
      },
      context,
    });
  } else if (featureFlags.baseline_fallback_enabled) {
    ensemble = buildBaselineFallbackDecision({
      symbol,
      horizon,
      thresholdInput,
      decisionMode,
      suggestedOrderQuantity,
      reason: rolloutReason,
    });
  } else {
    rolloutReason = `${rolloutReason}; baseline_fallback_disabled`;
    ensemble = {
      symbol,
      horizon,
      decision: decisionMode === 'REORDER_NO_REORDER' ? 'NO_REORDER' : 'HOLD',
      confidence: 0.05,
      model_breakdown: { ema: 0, threshold: 0, markov: 0 },
      weights: { ema: 0, threshold: 0, markov: 0 },
      model_votes: { ema: 0, threshold: 0, markov: 0 },
      buy_quantity: 0,
      rationale: `Ensemble disabled and baseline fallback disabled (${rolloutReason}).`,
      diagnostics: {
        score: 0,
        agreement: 0,
        uncertainty: 1,
        fallback_applied: true,
        fallback_notes: [rolloutReason],
      },
    };
  }

  const fallbackApplied = Boolean(!rolloutExecution.use_ensemble || ensemble?.diagnostics?.fallback_applied);

  recordDecisionEvent({
    userId,
    productId,
    symbol,
    suggestionId: String(req.body?.suggestion_id || req.body?.suggestionId || '').trim() || null,
    decision: ensemble?.decision,
    confidence: ensemble?.confidence,
    usedEnsemble: rolloutExecution.use_ensemble,
    fallbackUsed: fallbackApplied,
    fallbackReason: rolloutReason,
    rolloutStage: rolloutExecution.stage_label,
    rolloutPercent: rolloutExecution.rollout_percent,
    modelVersion: null,
    metadata: {
      mode: decisionMode,
      bucket: rolloutExecution.bucket,
      reason: rolloutReason,
    },
  });

  recordMonitoringEvent({
    eventType: 'model_usage',
    modelVersion: null,
    userId,
    endpoint: '/api/v1/markov/ensemble/decision',
    latencyMs: Date.now() - startedAt,
    fallbackRate: fallbackApplied ? 1 : 0,
    errorRate: 0,
    payload: {
      stage_label: rolloutExecution.stage_label,
      rollout_percent: rolloutExecution.rollout_percent,
      bucket: rolloutExecution.bucket,
      use_ensemble: rolloutExecution.use_ensemble,
      reason: rolloutReason,
    },
  });

  const metricsSnapshot = getMonitoringMetrics({
    windowMinutes: 24 * 60,
    baselineWindowMinutes: 7 * 24 * 60,
  });

  const unstableOutputs = Boolean(
    (Number(ensemble?.confidence) > 0.98)
    && (Number(ensemble?.diagnostics?.uncertainty) > 0.98)
  );

  const alertStatus = evaluateAlertThresholds({
    metrics: {
      ...metricsSnapshot,
      unstable_outputs: unstableOutputs,
    },
    thresholds: rolloutConfig?.thresholds || {},
  });

  let rollback = null;
  if (alertStatus.rollback_required && Boolean(rolloutConfig?.rollback_on_alert)) {
    rollback = executeSafeRollback({
      reason: 'phase9_auto_guardrail',
      healthMetrics: {
        error_rate: metricsSnapshot.error_rate,
        unstable_outputs: unstableOutputs,
      },
      kpiMetrics: {
        ...metricsSnapshot,
        unstable_outputs: unstableOutputs,
      },
      thresholds: rolloutConfig?.thresholds || {},
    });
  }

  return success(req, res, {
    symbol,
    horizon,
    ...ensemble,
    rollout_monitoring: {
      stage: rolloutExecution.stage_label,
      rollout_percent: rolloutExecution.rollout_percent,
      bucket: rolloutExecution.bucket,
      use_ensemble: rolloutExecution.use_ensemble,
      reason: rolloutReason,
      alerts: {
        status: alertStatus.status,
        warning_count: alertStatus.warning_count,
        critical_count: alertStatus.critical_count,
      },
      rollback,
    },
  });
});

const postMarkovStockSuggestions = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  const currentState = String(req.body?.current_state || req.query?.current_state || '').trim().toUpperCase();
  if (!symbol && !currentState) {
    throw badRequest('Either symbol or current_state is required for stock suggestions.', [
      {
        field: 'symbol|current_state',
        reason: 'required',
      },
    ]);
  }

  const regime = String(req.body?.regime || req.query?.regime || '').trim().toUpperCase() || null;
  const queueFeatures = req.body?.queue_features && typeof req.body.queue_features === 'object'
    ? req.body.queue_features
    : null;
  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);
  const simulationCount = parseNumberOrNull(
    req.body?.simulation_count
    ?? req.body?.simulationCount
    ?? req.query?.simulation_count
    ?? req.query?.simulationCount
  );

  const requestedHorizonTokens = parseHorizonsInput(req.body?.horizons ?? req.query?.horizons);
  const normalizedForecastHorizons = (requestedHorizonTokens || [])
    .map((item) => mapSuggestionHorizonToForecastHorizon(item))
    .filter(Boolean);
  const forecastHorizons = normalizedForecastHorizons.length > 0
    ? normalizedForecastHorizons
    : ['1_week', '1_day'];

  const decisionConstraints = parseObjectOrNull(
    req.body?.decision_constraints
    ?? req.body?.decisionConstraints
    ?? req.body?.constraints
  );
  const strategyConfigOverride = parseObjectOrNull(
    req.body?.strategy_config
    ?? req.body?.strategyConfig
  );

  const allocationBaseRaw = Number(
    req.body?.allocation_base
    ?? req.body?.allocationBase
    ?? req.query?.allocation_base
    ?? req.query?.allocationBase
    ?? 100
  );
  const allocationBase = Number.isFinite(allocationBaseRaw)
    ? Math.max(0, allocationBaseRaw)
    : 100;

  const { model } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    config: buildMarkovConfigOverrideFromQuery({
      ...(req.query || {}),
      ...(req.body || {}),
    }),
  });

  const operational = resolveOperationalModelForUser({
    model,
    userId,
  });

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures,
    body: req.body || {},
  });

  const emaPayload = buildEmaSignalsFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    body: req.body || {},
    sharedFeatures: sharedFeaturePayload.features,
    horizons: forecastHorizons
      .map((item) => mapForecastHorizonTokenToEma(item))
      .filter(Boolean),
  });

  const reorderDecision = buildReorderDecisionFromSharedFeatures({
    sharedFeatures: sharedFeaturePayload.features,
    sourceContext: sharedFeaturePayload.source_context,
    body: req.body || {},
  });

  const reorderByHorizon = buildReorderBySuggestionHorizon({
    reorderDecision,
    forecastHorizons,
  });

  const forecast = buildForecastFromModel({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    currentState,
    regime,
    queueFeatures,
    simulationCount,
    includePaths: false,
    horizons: forecastHorizons,
    decisionConstraints,
    strategyConfigOverride,
  });

  const suggestions = buildStockSuggestionRows({
    symbol,
    forecast,
    allocationBase,
    emaSignalsByHorizon: emaPayload.ema_signals_by_horizon,
    reorderByHorizon,
  });

  return success(req, res, {
    contract_name: STOCK_SUGGESTION_CONTRACT.contract_name,
    contract_version: STOCK_SUGGESTION_CONTRACT.contract_version,
    symbol: symbol || null,
    as_of: asOf ? asOf.toISOString() : null,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
    ema_signals: emaPayload.ema_signals,
    reorder_decision: {
      decision: reorderDecision.decision,
      confidence: reorderDecision.confidence,
      reason_codes: reorderDecision.reason_codes,
      reason_text: humanizeReasonCodes(reorderDecision.reason_codes),
      metrics: reorderDecision.metrics,
    },
    suggestions,
    operational_model: {
      selected_version: operational.rolloutDecision.selected_version,
      active_version: operational.rolloutDecision.active_version,
      candidate_version: operational.rolloutDecision.candidate_version,
      used_candidate: operational.rolloutDecision.used_candidate,
      rollout_percent: operational.rolloutDecision.rollout_percent,
      bucket: operational.rolloutDecision.bucket,
    },
  });
});

const getMarkovEvaluationHooks = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const context = parseModelQueryContext(req.query || {});

  const { model } = await buildModelFromMarketData({
    userId,
    symbol: context.symbol,
    start: context.start,
    end: context.end,
    limit: context.limit,
    config: context.configOverride,
  });

  const hooks = evaluateModelHooks({ model });
  return success(req, res, {
    states: model.states,
    metadata: model.metadata,
    evaluation_hooks: hooks,
  });
});

const postMarkovForecast = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const userId = getUserIdFromReq(req);

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  const currentState = String(req.body?.current_state || req.query?.current_state || '').trim().toUpperCase();
  if (!symbol && !currentState) {
    throw badRequest('Either symbol or current_state is required for Markov forecast.', [
      {
        field: 'symbol|current_state',
        reason: 'required',
      },
    ]);
  }

  const regime = String(req.body?.regime || req.query?.regime || '').trim().toUpperCase() || null;
  const queueFeatures = req.body?.queue_features && typeof req.body.queue_features === 'object'
    ? req.body.queue_features
    : null;
  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);
  const simulationCount = parseNumberOrNull(
    req.body?.simulation_count
    ?? req.body?.simulationCount
    ?? req.query?.simulation_count
    ?? req.query?.simulationCount
  );
  const includePaths = parseBoolean(
    req.body?.include_paths
    ?? req.body?.includePaths
    ?? req.query?.include_paths
    ?? req.query?.includePaths,
    false
  );
  const seed = String(req.body?.seed || req.query?.seed || '').trim() || null;
  const horizon = normalizeSuggestionHorizonToken(req.body?.horizon ?? req.query?.horizon);
  const horizons = parseHorizonsInput(req.body?.horizons ?? req.query?.horizons);
  const decisionConstraints = parseObjectOrNull(
    req.body?.decision_constraints
    ?? req.body?.decisionConstraints
    ?? req.body?.constraints
  );
  const strategyConfigOverride = parseObjectOrNull(
    req.body?.strategy_config
    ?? req.body?.strategyConfig
  );

  const { model } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    config: buildMarkovConfigOverrideFromQuery({
      ...(req.query || {}),
      ...(req.body || {}),
    }),
  });

  const operational = resolveOperationalModelForUser({
    model,
    userId,
  });

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures,
    body: req.body || {},
  });

  const emaPayload = buildEmaSignalsFromContext({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    body: req.body || {},
    sharedFeatures: sharedFeaturePayload.features,
    horizons: parseEmaHorizonsInput(req.body?.horizons ?? req.query?.horizons),
  });

  const reorderDecision = buildReorderDecisionFromSharedFeatures({
    sharedFeatures: sharedFeaturePayload.features,
    sourceContext: sharedFeaturePayload.source_context,
    body: req.body || {},
  });

  const forecast = buildForecastFromModel({
    model: operational.model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    currentState,
    regime,
    queueFeatures,
    simulationCount,
    includePaths,
    seed,
    horizons,
    decisionConstraints,
    strategyConfigOverride,
  });

  const horizonItems = Object.values(forecast?.horizons || {});
  const fallbackCount = horizonItems.filter((item) => item?.decision?.fallback === true).length;
  const fallbackRate = horizonItems.length > 0 ? fallbackCount / horizonItems.length : 0;

  recordMonitoringEvent({
    eventType: 'model_usage',
    modelVersion: operational.rolloutDecision.selected_version,
    userId,
    endpoint: '/api/v1/markov/forecast',
    latencyMs: Date.now() - startedAt,
    fallbackRate,
    errorRate: 0,
    payload: {
      used_candidate: operational.rolloutDecision.used_candidate,
      rollout_percent: operational.rolloutDecision.rollout_percent,
      bucket: operational.rolloutDecision.bucket,
      horizon_count: horizonItems.length,
    },
  });

  const allocationBaseRaw = Number(
    req.body?.allocation_base
    ?? req.body?.allocationBase
    ?? req.query?.allocation_base
    ?? req.query?.allocationBase
    ?? 100
  );
  const allocationBase = Number.isFinite(allocationBaseRaw)
    ? Math.max(0, allocationBaseRaw)
    : 100;

  const reorderByHorizon = buildReorderBySuggestionHorizon({
    reorderDecision,
    forecastHorizons: Object.keys(forecast?.horizons || {}),
  });

  const stockSuggestions = buildStockSuggestionRows({
    symbol,
    forecast,
    allocationBase,
    emaSignalsByHorizon: emaPayload.ema_signals_by_horizon,
    reorderByHorizon,
  });

  const preferredForecastHorizon = horizon
    ? mapSuggestionHorizonToForecastHorizon(horizon)
    : null;
  const forecastHorizonEntries = Object.entries(forecast?.horizons || {});
  const selectedHorizonEntry = (preferredForecastHorizon && forecast?.horizons?.[preferredForecastHorizon])
    ? [preferredForecastHorizon, forecast.horizons[preferredForecastHorizon]]
    : forecastHorizonEntries[0] || null;
  const selectedHorizonToken = selectedHorizonEntry ? String(selectedHorizonEntry[0] || '') : null;
  const selectedHorizonPayload = selectedHorizonEntry ? selectedHorizonEntry[1] : null;

  const demandDistribution = normalizeDemandRegimeDistribution(
    selectedHorizonPayload?.terminal_state_distribution || {}
  );
  const entropyUncertainty = computeNormalizedEntropy(demandDistribution);
  const stddevUncertainty = clamp(
    Number(selectedHorizonPayload?.metrics?.uncertainty?.standard_deviation || 0) / 0.2,
    0,
    1
  );
  const uncertainty = roundToSix((0.6 * entropyUncertainty) + (0.4 * stddevUncertainty));

  const rawConfidence = Number(
    selectedHorizonPayload?.decision?.confidence
    ?? selectedHorizonPayload?.failure_report?.confidence?.score
    ?? 0.5
  );
  const confidence = roundToSix(clamp(rawConfidence * (1 - (0.35 * uncertainty)), 0.05, 0.99));

  const expectedDemand = roundToSix(
    (demandDistribution.HIGH_DEMAND * 1.25)
    + (demandDistribution.STABLE * 1)
    + (demandDistribution.LOW_DEMAND * 0.75)
  );

  const demandRegime = resolveDemandRegimeFromDistribution(demandDistribution);

  return success(req, res, {
    symbol: symbol || null,
    as_of: asOf ? asOf.toISOString() : null,
    next_state_distribution: demandDistribution,
    expected_demand: expectedDemand,
    uncertainty,
    confidence,
    demand_regime: demandRegime,
    selected_horizon: selectedHorizonToken,
    ...forecast,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
    ema_signals: emaPayload.ema_signals,
    reorder_decision: {
      decision: reorderDecision.decision,
      confidence: reorderDecision.confidence,
      reason_codes: reorderDecision.reason_codes,
      reason_text: humanizeReasonCodes(reorderDecision.reason_codes),
      metrics: reorderDecision.metrics,
    },
    stock_suggestions: stockSuggestions,
    operational_model: {
      selected_version: operational.rolloutDecision.selected_version,
      active_version: operational.rolloutDecision.active_version,
      candidate_version: operational.rolloutDecision.candidate_version,
      used_candidate: operational.rolloutDecision.used_candidate,
      rollout_percent: operational.rolloutDecision.rollout_percent,
      bucket: operational.rolloutDecision.bucket,
    },
  });
});

const postMarkovWalkForwardEvaluation = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase() || null;
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);

  const minTrainSize = Math.max(
    20,
    Math.trunc(Number(req.body?.min_train_size ?? req.body?.minTrainSize ?? req.query?.min_train_size ?? req.query?.minTrainSize ?? 120))
  );
  const testSize = Math.max(
    5,
    Math.trunc(Number(req.body?.test_size ?? req.body?.testSize ?? req.query?.test_size ?? req.query?.testSize ?? 30))
  );
  const stepSize = Math.max(
    1,
    Math.trunc(Number(req.body?.step_size ?? req.body?.stepSize ?? req.query?.step_size ?? req.query?.stepSize ?? testSize))
  );

  const maxWindowsRaw = Number(
    req.body?.max_windows
    ?? req.body?.maxWindows
    ?? req.query?.max_windows
    ?? req.query?.maxWindows
  );
  const maxWindows = Number.isFinite(maxWindowsRaw)
    ? Math.max(1, Math.trunc(maxWindowsRaw))
    : null;

  const precisionTargetRaw = Number(
    req.body?.precision_target
    ?? req.body?.precisionTarget
    ?? req.query?.precision_target
    ?? req.query?.precisionTarget
    ?? 0.9
  );
  const precisionTarget = Number.isFinite(precisionTargetRaw)
    ? Math.max(0, Math.min(precisionTargetRaw, 1))
    : 0.9;

  const decisionConstraints = parseObjectOrNull(
    req.body?.decision_constraints
    ?? req.body?.decisionConstraints
    ?? null
  );
  const strategyConfigOverride = parseObjectOrNull(
    req.body?.strategy_config
    ?? req.body?.strategyConfig
    ?? null
  );
  const markovConfigOverride = parseObjectOrNull(
    req.body?.markov_config
    ?? req.body?.markovConfig
    ?? null
  );

  const result = await runWalkForward({
    userId,
    symbol,
    start: start ? start.toISOString() : null,
    end: end ? end.toISOString() : null,
    minTrainSize,
    testSize,
    stepSize,
    maxWindows,
    precisionTarget,
    decisionConstraints,
    strategyConfigOverride,
    markovConfigOverride,
  });

  return success(req, res, result);
});

const postMarkovStressTestEvaluation = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  const currentState = String(req.body?.current_state || req.query?.current_state || '').trim().toUpperCase();
  if (!symbol && !currentState) {
    throw badRequest('Either symbol or current_state is required for stress testing.', [
      {
        field: 'symbol|current_state',
        reason: 'required',
      },
    ]);
  }

  const asOf = parseIsoDateOrNull(req.body?.asOf || req.query?.asOf);
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);
  const simulationCount = parseNumberOrNull(
    req.body?.simulation_count
    ?? req.body?.simulationCount
    ?? req.query?.simulation_count
    ?? req.query?.simulationCount
  );
  const seed = String(req.body?.seed || req.query?.seed || '').trim() || null;
  const horizons = parseHorizonsInput(req.body?.horizons ?? req.query?.horizons);

  const queueFeatures = req.body?.queue_features && typeof req.body.queue_features === 'object'
    ? req.body.queue_features
    : null;

  const decisionConstraints = parseObjectOrNull(
    req.body?.decision_constraints
    ?? req.body?.decisionConstraints
    ?? req.body?.constraints
  );
  const strategyConfigOverride = parseObjectOrNull(
    req.body?.strategy_config
    ?? req.body?.strategyConfig
  );

  const { model } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    config: buildMarkovConfigOverrideFromQuery({
      ...(req.query || {}),
      ...(req.body || {}),
    }),
  });

  const sharedFeaturePayload = buildSharedFeaturePayloadFromContext({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    queueFeatures,
    body: req.body || {},
  });

  const emaPayload = buildEmaSignalsFromContext({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    body: req.body || {},
    sharedFeatures: sharedFeaturePayload.features,
    horizons: parseEmaHorizonsInput(req.body?.horizons ?? req.query?.horizons),
  });

  const result = runStressTests({
    model,
    symbol,
    asOf: asOf ? asOf.toISOString() : null,
    currentState,
    queueFeatures,
    simulationCount,
    seed,
    horizons,
    decisionConstraints,
    strategyConfigOverride,
  });

  return success(req, res, {
    ...result,
    shared_features: sharedFeaturePayload.features,
    shared_feature_quality: sharedFeaturePayload.quality,
    ema_signals: emaPayload.ema_signals,
  });
});

const getMarkovOpsStatus = asyncHandler(async (req, res) => {
  const registry = listModelVersions();
  const rollout = loadRolloutConfig();
  const monitoring = getMonitoringSummary({ limit: 500 });
  const rolloutStatus = getRolloutStatus({ rolloutConfig: rollout });
  const metrics = getMonitoringMetrics({
    windowMinutes: 24 * 60,
    baselineWindowMinutes: 7 * 24 * 60,
  });
  const alerts = evaluateAlertThresholds({
    metrics,
    thresholds: rollout?.thresholds || {},
  });

  return success(req, res, {
    registry,
    rollout,
    rollout_status: rolloutStatus,
    monitoring,
    metrics,
    alerts,
  });
});

const getMarkovMonitoringDashboard = asyncHandler(async (req, res) => {
  const rollout = loadRolloutConfig();
  const metricsWindow = Math.max(1, Math.trunc(Number(req.query?.window_minutes ?? 24 * 60) || 24 * 60));
  const baselineWindow = Math.max(2, Math.trunc(Number(req.query?.baseline_window_minutes ?? 7 * 24 * 60) || 7 * 24 * 60));

  const metrics = getMonitoringMetrics({
    windowMinutes: metricsWindow,
    baselineWindowMinutes: baselineWindow,
  });

  const alerts = evaluateAlertThresholds({
    metrics,
    thresholds: rollout?.thresholds || {},
  });

  let rollback = null;
  const autoRollback = parseBoolean(req.query?.auto_rollback, false);
  if (autoRollback && alerts.rollback_required && Boolean(rollout?.rollback_on_alert)) {
    rollback = executeSafeRollback({
      reason: 'phase9_dashboard_auto_rollback',
      healthMetrics: {
        error_rate: metrics.error_rate,
        unstable_outputs: Boolean(metrics?.unstable_outputs),
      },
      kpiMetrics: metrics,
      thresholds: rollout?.thresholds || {},
    });
  }

  return success(req, res, {
    rollout: getRolloutStatus({ rolloutConfig: rollout }),
    metrics,
    alerts,
    rollback,
  });
});

const postMarkovRecordSuggestionFeedback = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req) || String(req.body?.user_id || req.body?.userId || '').trim() || null;
  const productId = String(req.body?.product_id || req.body?.productId || '').trim() || null;
  const symbol = String(req.body?.symbol || '').trim().toUpperCase() || null;
  const suggestionId = String(req.body?.suggestion_id || req.body?.suggestionId || '').trim() || null;

  const acceptedRaw = req.body?.accepted ?? req.body?.followed;
  if (acceptedRaw === undefined || acceptedRaw === null) {
    throw badRequest('accepted is required for suggestion feedback.', [
      {
        field: 'accepted',
        reason: 'required',
      },
    ]);
  }

  const accepted = parseBoolean(acceptedRaw, false);
  const actionType = String(req.body?.action_type || req.body?.actionType || 'FOLLOW_RECOMMENDATION')
    .trim()
    .toUpperCase();

  const event = recordSuggestionActionEvent({
    userId,
    productId,
    symbol,
    suggestionId,
    accepted,
    actionType,
    metadata: parseObjectOrNull(req.body?.metadata) || {},
  });

  return success(req, res, {
    recorded: true,
    event,
  });
});

const postMarkovRecordStockoutIncident = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req) || String(req.body?.user_id || req.body?.userId || '').trim() || null;
  const productId = String(req.body?.product_id || req.body?.productId || '').trim() || null;
  const symbol = String(req.body?.symbol || '').trim().toUpperCase();

  if (!symbol && !productId) {
    throw badRequest('symbol or product_id is required for stockout incident.', [
      {
        field: 'symbol|product_id',
        reason: 'required',
      },
    ]);
  }

  const event = recordStockoutIncidentEvent({
    userId,
    productId,
    symbol,
    suggestionId: String(req.body?.suggestion_id || req.body?.suggestionId || '').trim() || null,
    severity: String(req.body?.severity || 'HIGH').trim().toUpperCase() || 'HIGH',
    units: Number(req.body?.units ?? req.body?.quantity ?? 0),
    metadata: parseObjectOrNull(req.body?.metadata) || {},
  });

  return success(req, res, {
    recorded: true,
    event,
  });
});

const postMarkovRecordServiceError = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req) || String(req.body?.user_id || req.body?.userId || '').trim() || null;
  const productId = String(req.body?.product_id || req.body?.productId || '').trim() || null;
  const symbol = String(req.body?.symbol || '').trim().toUpperCase() || null;

  const event = recordServiceErrorEvent({
    userId,
    productId,
    symbol,
    endpoint: String(req.body?.endpoint || req.body?.path || '').trim() || null,
    errorCode: String(req.body?.error_code || req.body?.errorCode || 'UNKNOWN').trim().toUpperCase(),
    message: String(req.body?.message || '').trim() || null,
    metadata: parseObjectOrNull(req.body?.metadata) || {},
  });

  return success(req, res, {
    recorded: true,
    event,
  });
});

const postMarkovEvaluateAlerts = asyncHandler(async (req, res) => {
  const rollout = loadRolloutConfig();
  const metrics = getMonitoringMetrics({
    windowMinutes: Math.max(1, Math.trunc(Number(req.body?.window_minutes ?? req.body?.windowMinutes ?? 24 * 60) || 24 * 60)),
    baselineWindowMinutes: Math.max(2, Math.trunc(Number(req.body?.baseline_window_minutes ?? req.body?.baselineWindowMinutes ?? 7 * 24 * 60) || 7 * 24 * 60)),
  });

  const alerts = evaluateAlertThresholds({
    metrics,
    driftReport: parseObjectOrNull(req.body?.drift_report ?? req.body?.driftReport),
    stabilityReport: parseObjectOrNull(req.body?.stability_report ?? req.body?.stabilityReport),
    thresholds: parseObjectOrNull(req.body?.thresholds) || rollout?.thresholds || {},
  });

  let rollback = null;
  const autoRollback = parseBoolean(req.body?.auto_rollback ?? req.body?.autoRollback, true);
  if (autoRollback && alerts.rollback_required && Boolean(rollout?.rollback_on_alert)) {
    rollback = executeSafeRollback({
      reason: 'phase9_alert_evaluation',
      healthMetrics: {
        error_rate: metrics.error_rate,
        unstable_outputs: Boolean(metrics?.unstable_outputs),
      },
      kpiMetrics: metrics,
      thresholds: rollout?.thresholds || {},
    });
  }

  return success(req, res, {
    rollout: getRolloutStatus({ rolloutConfig: rollout }),
    metrics,
    alerts,
    rollback,
  });
});

const postMarkovSetFeatureFlags = asyncHandler(async (req, res) => {
  const flags = parseObjectOrNull(req.body?.feature_flags ?? req.body?.featureFlags) || {};
  const next = setEnsembleFeatureFlags({
    ensembleEnabled: flags.ensemble_enabled,
    baselineFallbackEnabled: flags.baseline_fallback_enabled,
    baselineOnlyMode: flags.baseline_only_mode,
  });

  return success(req, res, {
    updated: true,
    feature_flags: getFeatureFlags(next),
    rollout: getRolloutStatus({ rolloutConfig: next }),
  });
});

const postMarkovRegisterVersion = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const version = String(req.body?.version || '').trim();
  if (!version) {
    throw badRequest('version is required for model registration.', [
      {
        field: 'version',
        reason: 'required',
      },
    ]);
  }

  const symbol = String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase();
  const start = parseIsoDateOrNull(req.body?.start || req.query?.start);
  const end = parseIsoDateOrNull(req.body?.end || req.query?.end);
  const limit = Math.max(100, Math.min(Math.trunc(Number(req.body?.limit ?? req.query?.limit ?? 5000)), 20000));

  const activate = parseBoolean(req.body?.activate, false);
  const setCandidate = parseBoolean(req.body?.set_candidate ?? req.body?.setCandidate, false);

  const calibrationLayer = parseObjectOrNull(
    req.body?.calibration_layer
    ?? req.body?.calibrationLayer
  );
  const performanceMetrics = parseObjectOrNull(
    req.body?.performance_metrics
    ?? req.body?.performanceMetrics
  ) || {};
  const metadata = parseObjectOrNull(req.body?.metadata) || {};

  const { model, source_rows: sourceRows } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    limit,
    config: buildMarkovConfigOverrideFromQuery({
      ...(req.query || {}),
      ...(req.body || {}),
    }),
  });

  const entry = registerModelVersion({
    version,
    model,
    calibrationLayer,
    performanceMetrics,
    metadata: {
      ...metadata,
      source_rows: sourceRows,
      symbol: symbol || null,
    },
    activate,
    createdBy: `user:${String(userId)}`,
    mode: 'retrained',
  });

  let rollout = null;
  if (setCandidate) {
    rollout = setCandidateRolloutVersion({ version, resetStage: true });
  }

  return success(req, res, {
    registered: true,
    entry,
    rollout,
  });
});

const postMarkovActivateVersion = asyncHandler(async (req, res) => {
  const version = String(req.body?.version || '').trim();
  if (!version) {
    throw badRequest('version is required for activation.', [
      {
        field: 'version',
        reason: 'required',
      },
    ]);
  }

  const state = setActiveModelVersion({
    version,
    reason: String(req.body?.reason || 'manual_activation').trim(),
  });

  return success(req, res, {
    activated: true,
    ...state,
  });
});

const postMarkovRollbackVersion = asyncHandler(async (req, res) => {
  const force = parseBoolean(req.body?.force, false);
  const reason = String(req.body?.reason || 'manual_rollback').trim();

  const driftReport = force
    ? { alert: true }
    : parseObjectOrNull(req.body?.drift_report ?? req.body?.driftReport);
  const stabilityReport = force
    ? { unstable: true }
    : parseObjectOrNull(req.body?.stability_report ?? req.body?.stabilityReport);
  const healthMetrics = parseObjectOrNull(req.body?.health_metrics ?? req.body?.healthMetrics) || {};
  const kpiMetrics = parseObjectOrNull(req.body?.kpi_metrics ?? req.body?.kpiMetrics)
    || getMonitoringMetrics({
      windowMinutes: 24 * 60,
      baselineWindowMinutes: 7 * 24 * 60,
    });
  const thresholds = parseObjectOrNull(req.body?.thresholds) || {};

  const rollback = executeSafeRollback({
    reason,
    driftReport,
    stabilityReport,
    healthMetrics,
    kpiMetrics,
    thresholds,
  });

  return success(req, res, rollback);
});

const postMarkovSetRolloutCandidate = asyncHandler(async (req, res) => {
  const version = String(req.body?.version || '').trim();
  if (!version) {
    throw badRequest('version is required for candidate rollout.', [
      {
        field: 'version',
        reason: 'required',
      },
    ]);
  }

  const rollout = setCandidateRolloutVersion({
    version,
    resetStage: parseBoolean(req.body?.reset_stage ?? req.body?.resetStage, true),
  });

  return success(req, res, {
    candidate_set: true,
    rollout,
  });
});

const postMarkovAdvanceRolloutStage = asyncHandler(async (req, res) => {
  const rollout = advanceRolloutStage();
  return success(req, res, {
    advanced: true,
    rollout,
  });
});

const postMarkovDriftCheck = asyncHandler(async (req, res) => {
  const result = detectDrift({
    referenceFeatureRows: parseArrayOrEmpty(req.body?.reference_feature_rows ?? req.body?.referenceFeatureRows),
    currentFeatureRows: parseArrayOrEmpty(req.body?.current_feature_rows ?? req.body?.currentFeatureRows),
    featureKeys: parseArrayOrEmpty(req.body?.feature_keys ?? req.body?.featureKeys),
    referencePredictions: parseArrayOrEmpty(req.body?.reference_predictions ?? req.body?.referencePredictions),
    currentPredictions: parseArrayOrEmpty(req.body?.current_predictions ?? req.body?.currentPredictions),
    expectedProbabilities: parseArrayOrEmpty(req.body?.expected_probabilities ?? req.body?.expectedProbabilities),
    actualOutcomes: parseArrayOrEmpty(req.body?.actual_outcomes ?? req.body?.actualOutcomes),
    baselineEce: parseNumberOrNull(req.body?.baseline_ece ?? req.body?.baselineEce),
    thresholds: parseObjectOrNull(req.body?.thresholds),
  });

  const rollbackTrigger = evaluateRollbackTriggers({
    driftReport: result,
    stabilityReport: null,
    healthMetrics: parseObjectOrNull(req.body?.health_metrics ?? req.body?.healthMetrics) || {},
    kpiMetrics: parseObjectOrNull(req.body?.kpi_metrics ?? req.body?.kpiMetrics)
      || getMonitoringMetrics({
        windowMinutes: 24 * 60,
        baselineWindowMinutes: 7 * 24 * 60,
      }),
    thresholds: parseObjectOrNull(req.body?.rollback_thresholds ?? req.body?.rollbackThresholds) || {},
  });

  return success(req, res, {
    ...result,
    rollback_trigger: rollbackTrigger,
  });
});

const postMarkovStabilityCheck = asyncHandler(async (req, res) => {
  const result = detectTransitionStability({
    baselineMatrix: parseObjectOrNull(req.body?.baseline_matrix ?? req.body?.baselineMatrix) || {},
    currentMatrix: parseObjectOrNull(req.body?.current_matrix ?? req.body?.currentMatrix) || {},
    observedTransitions: parseArrayOrEmpty(req.body?.observed_transitions ?? req.body?.observedTransitions),
    thresholds: parseObjectOrNull(req.body?.thresholds),
  });

  const rollbackTrigger = evaluateRollbackTriggers({
    driftReport: null,
    stabilityReport: result,
    healthMetrics: parseObjectOrNull(req.body?.health_metrics ?? req.body?.healthMetrics) || {},
    kpiMetrics: parseObjectOrNull(req.body?.kpi_metrics ?? req.body?.kpiMetrics)
      || getMonitoringMetrics({
        windowMinutes: 24 * 60,
        baselineWindowMinutes: 7 * 24 * 60,
      }),
    thresholds: parseObjectOrNull(req.body?.rollback_thresholds ?? req.body?.rollbackThresholds) || {},
  });

  return success(req, res, {
    ...result,
    rollback_trigger: rollbackTrigger,
  });
});

const postMarkovRunRecalibrationJob = asyncHandler(async (req, res) => {
  const result = runMonthlyRecalibration({
    baseVersion: String((req.body?.base_version ?? req.body?.baseVersion) || '').trim() || null,
    expectedProbabilities: parseArrayOrEmpty(req.body?.expected_probabilities ?? req.body?.expectedProbabilities),
    actualOutcomes: parseArrayOrEmpty(req.body?.actual_outcomes ?? req.body?.actualOutcomes),
    performanceMetrics: parseObjectOrNull(req.body?.performance_metrics ?? req.body?.performanceMetrics),
    activate: parseBoolean(req.body?.activate, true),
    createdBy: 'api:monthly_recalibration',
  });

  return success(req, res, result);
});

const postMarkovRunRetrainingJob = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const result = await runQuarterlyRetraining({
    userId,
    symbol: String(req.body?.symbol || req.query?.symbol || '').trim().toUpperCase(),
    start: parseIsoDateOrNull(req.body?.start || req.query?.start),
    end: parseIsoDateOrNull(req.body?.end || req.query?.end),
    limit: Math.max(100, Math.min(Math.trunc(Number(req.body?.limit ?? req.query?.limit ?? 5000)), 20000)),
    config: buildMarkovConfigOverrideFromQuery({
      ...(req.query || {}),
      ...(req.body || {}),
    }),
    performanceMetrics: parseObjectOrNull(req.body?.performance_metrics ?? req.body?.performanceMetrics) || {},
    createdBy: 'api:quarterly_retraining',
    activate: parseBoolean(req.body?.activate, false),
    setAsCandidate: parseBoolean(req.body?.set_candidate ?? req.body?.setCandidate, true),
  });

  return success(req, res, result);
});

const postMarkovRunDriftMonitoringJob = asyncHandler(async (req, res) => {
  const result = runDriftMonitoringJob({
    referenceFeatureRows: parseArrayOrEmpty(req.body?.reference_feature_rows ?? req.body?.referenceFeatureRows),
    currentFeatureRows: parseArrayOrEmpty(req.body?.current_feature_rows ?? req.body?.currentFeatureRows),
    featureKeys: parseArrayOrEmpty(req.body?.feature_keys ?? req.body?.featureKeys),
    referencePredictions: parseArrayOrEmpty(req.body?.reference_predictions ?? req.body?.referencePredictions),
    currentPredictions: parseArrayOrEmpty(req.body?.current_predictions ?? req.body?.currentPredictions),
    expectedProbabilities: parseArrayOrEmpty(req.body?.expected_probabilities ?? req.body?.expectedProbabilities),
    actualOutcomes: parseArrayOrEmpty(req.body?.actual_outcomes ?? req.body?.actualOutcomes),
    baselineEce: parseNumberOrNull(req.body?.baseline_ece ?? req.body?.baselineEce),
    baselineMatrix: parseObjectOrNull(req.body?.baseline_matrix ?? req.body?.baselineMatrix) || {},
    currentMatrix: parseObjectOrNull(req.body?.current_matrix ?? req.body?.currentMatrix) || {},
    observedTransitions: parseArrayOrEmpty(req.body?.observed_transitions ?? req.body?.observedTransitions),
    healthMetrics: parseObjectOrNull(req.body?.health_metrics ?? req.body?.healthMetrics) || {},
    thresholds: parseObjectOrNull(req.body?.thresholds) || {},
    autoRollback: parseBoolean(req.body?.auto_rollback ?? req.body?.autoRollback, true),
  });

  return success(req, res, result);
});

module.exports = {
  getMarkovModel,
  getMarkovMatrix,
  postMarkovPredict,
  getMarkovFeatureContract,
  postMarkovBuildFeatures,
  getMarkovEmaSignalContract,
  postMarkovEmaSignal,
  getMarkovReorderDecisionContract,
  postMarkovReorderDecision,
  postMarkovEnsembleDecision,
  getMarkovStockSuggestionContract,
  postMarkovStockSuggestions,
  getMarkovEvaluationHooks,
  postMarkovForecast,
  postMarkovWalkForwardEvaluation,
  postMarkovStressTestEvaluation,
  getMarkovOpsStatus,
  getMarkovMonitoringDashboard,
  postMarkovRegisterVersion,
  postMarkovActivateVersion,
  postMarkovRollbackVersion,
  postMarkovSetRolloutCandidate,
  postMarkovAdvanceRolloutStage,
  postMarkovSetFeatureFlags,
  postMarkovRecordSuggestionFeedback,
  postMarkovRecordStockoutIncident,
  postMarkovRecordServiceError,
  postMarkovEvaluateAlerts,
  postMarkovDriftCheck,
  postMarkovStabilityCheck,
  postMarkovRunRecalibrationJob,
  postMarkovRunRetrainingJob,
  postMarkovRunDriftMonitoringJob,
};
