const fs = require('fs');
const path = require('path');

const MONITORING_EVENTS_PATH = path.join(__dirname, '..', 'artifacts', 'ensembleMonitoring.log');

const EVENT_TYPES = Object.freeze({
  MODEL_DECISION: 'model_decision',
  SUGGESTION_ACTION: 'suggestion_action',
  STOCKOUT_INCIDENT: 'stockout_incident',
  SERVICE_ERROR: 'service_error',
});

const nowIso = () => new Date().toISOString();

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ensureArtifactsDir = () => {
  const directory = path.dirname(MONITORING_EVENTS_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const appendEvent = (payload) => {
  ensureArtifactsDir();
  fs.appendFileSync(MONITORING_EVENTS_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
};

const readEvents = ({ limit = 10000 } = {}) => {
  ensureArtifactsDir();
  if (!fs.existsSync(MONITORING_EVENTS_PATH)) {
    return [];
  }

  const raw = fs.readFileSync(MONITORING_EVENTS_PATH, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(1, Math.trunc(toNumber(limit, 10000))));

  const events = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        events.push(parsed);
      }
    } catch {
      // Ignore malformed lines.
    }
  }

  return events;
};

const buildSubjectToken = ({ userId = null, productId = null, symbol = null } = {}) => {
  return `${String(userId || 'anonymous').trim() || 'anonymous'}::${String(productId || symbol || 'global').trim() || 'global'}`;
};

const parseTimestampMs = (value) => {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
};

const filterEventsSince = ({ events = [], sinceMs = null } = {}) => {
  if (sinceMs === null) {
    return Array.isArray(events) ? events : [];
  }

  return (Array.isArray(events) ? events : []).filter((event) => {
    const ts = parseTimestampMs(event?.timestamp);
    return ts !== null && ts >= sinceMs;
  });
};

const average = (values = []) => {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numeric.length === 0) {
    return null;
  }

  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(6));
};

const ratio = (numerator, denominator) => {
  const n = toNumber(numerator, 0);
  const d = toNumber(denominator, 0);
  if (d <= 0) {
    return 0;
  }

  return Number((n / d).toFixed(6));
};

const bucketByHour = (events = []) => {
  const map = new Map();

  for (const event of events) {
    const ts = parseTimestampMs(event?.timestamp);
    if (ts === null) {
      continue;
    }

    const date = new Date(ts);
    date.setMinutes(0, 0, 0);
    const key = date.toISOString();

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(event);
  }

  return [...map.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([bucketStart, bucketEvents]) => ({
      bucket_start: bucketStart,
      events: bucketEvents,
    }));
};

const buildTrendSeries = ({ decisions = [], actions = [], stockouts = [] } = {}) => {
  const merged = [...decisions, ...actions, ...stockouts];
  const buckets = bucketByHour(merged);

  return buckets.map((bucket) => {
    const decisionRows = bucket.events.filter((event) => event?.event_type === EVENT_TYPES.MODEL_DECISION);
    const actionRows = bucket.events.filter((event) => event?.event_type === EVENT_TYPES.SUGGESTION_ACTION);
    const stockoutRows = bucket.events.filter((event) => event?.event_type === EVENT_TYPES.STOCKOUT_INCIDENT);

    const acceptedCount = actionRows.filter((event) => event?.accepted === true).length;
    const fallbackCount = decisionRows.filter((event) => event?.fallback_used === true).length;

    return {
      bucket_start: bucket.bucket_start,
      decisions: decisionRows.length,
      fallback_rate: ratio(fallbackCount, decisionRows.length),
      average_confidence: average(decisionRows.map((event) => event?.confidence)),
      acceptance_rate: ratio(acceptedCount, actionRows.length),
      stockout_incidents: stockoutRows.length,
      stockout_rate: ratio(stockoutRows.length, decisionRows.length),
    };
  });
};

const recordDecisionEvent = ({
  userId = null,
  productId = null,
  symbol = null,
  suggestionId = null,
  decision = 'HOLD',
  confidence = 0,
  usedEnsemble = true,
  fallbackUsed = false,
  fallbackReason = null,
  rolloutStage = null,
  rolloutPercent = null,
  modelVersion = null,
  metadata = null,
} = {}) => {
  return appendEvent({
    timestamp: nowIso(),
    event_type: EVENT_TYPES.MODEL_DECISION,
    user_id: userId ? String(userId) : null,
    product_id: productId ? String(productId) : null,
    symbol: symbol ? String(symbol).trim().toUpperCase() : null,
    suggestion_id: suggestionId ? String(suggestionId) : null,
    subject_token: buildSubjectToken({ userId, productId, symbol }),
    decision: String(decision || 'HOLD').trim().toUpperCase(),
    confidence: Number(clamp(toNumber(confidence, 0), 0, 1).toFixed(6)),
    used_ensemble: Boolean(usedEnsemble),
    fallback_used: Boolean(fallbackUsed),
    fallback_reason: fallbackReason ? String(fallbackReason) : null,
    rollout_stage: rolloutStage ? String(rolloutStage) : null,
    rollout_percent: Number.isFinite(Number(rolloutPercent)) ? Number(rolloutPercent) : null,
    model_version: modelVersion ? String(modelVersion) : null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });
};

const recordSuggestionActionEvent = ({
  userId = null,
  productId = null,
  symbol = null,
  suggestionId = null,
  accepted = false,
  actionType = 'FOLLOW_RECOMMENDATION',
  metadata = null,
} = {}) => {
  return appendEvent({
    timestamp: nowIso(),
    event_type: EVENT_TYPES.SUGGESTION_ACTION,
    user_id: userId ? String(userId) : null,
    product_id: productId ? String(productId) : null,
    symbol: symbol ? String(symbol).trim().toUpperCase() : null,
    suggestion_id: suggestionId ? String(suggestionId) : null,
    subject_token: buildSubjectToken({ userId, productId, symbol }),
    accepted: Boolean(accepted),
    action_type: String(actionType || 'FOLLOW_RECOMMENDATION').trim().toUpperCase(),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });
};

const recordStockoutIncidentEvent = ({
  userId = null,
  productId = null,
  symbol = null,
  suggestionId = null,
  severity = 'HIGH',
  units = 0,
  metadata = null,
} = {}) => {
  return appendEvent({
    timestamp: nowIso(),
    event_type: EVENT_TYPES.STOCKOUT_INCIDENT,
    user_id: userId ? String(userId) : null,
    product_id: productId ? String(productId) : null,
    symbol: symbol ? String(symbol).trim().toUpperCase() : null,
    suggestion_id: suggestionId ? String(suggestionId) : null,
    subject_token: buildSubjectToken({ userId, productId, symbol }),
    severity: String(severity || 'HIGH').trim().toUpperCase(),
    units: Math.max(0, toNumber(units, 0)),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });
};

const recordServiceErrorEvent = ({
  userId = null,
  productId = null,
  symbol = null,
  endpoint = null,
  errorCode = 'UNKNOWN',
  message = null,
  metadata = null,
} = {}) => {
  return appendEvent({
    timestamp: nowIso(),
    event_type: EVENT_TYPES.SERVICE_ERROR,
    user_id: userId ? String(userId) : null,
    product_id: productId ? String(productId) : null,
    symbol: symbol ? String(symbol).trim().toUpperCase() : null,
    subject_token: buildSubjectToken({ userId, productId, symbol }),
    endpoint: endpoint ? String(endpoint) : null,
    error_code: String(errorCode || 'UNKNOWN').trim().toUpperCase(),
    message: message ? String(message) : null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });
};

const getMonitoringMetrics = ({
  windowMinutes = 24 * 60,
  baselineWindowMinutes = 7 * 24 * 60,
  limit = 50000,
} = {}) => {
  const allEvents = readEvents({ limit });

  const now = Date.now();
  const currentSinceMs = now - (Math.max(1, Math.trunc(toNumber(windowMinutes, 24 * 60))) * 60 * 1000);
  const baselineSinceMs = now - (Math.max(1, Math.trunc(toNumber(baselineWindowMinutes, 7 * 24 * 60))) * 60 * 1000);

  const currentEvents = filterEventsSince({ events: allEvents, sinceMs: currentSinceMs });
  const baselineRangeEvents = filterEventsSince({ events: allEvents, sinceMs: baselineSinceMs });

  const baselineEvents = baselineRangeEvents.filter((event) => {
    const ts = parseTimestampMs(event?.timestamp);
    return ts !== null && ts < currentSinceMs;
  });

  const currentDecisions = currentEvents.filter((event) => event?.event_type === EVENT_TYPES.MODEL_DECISION);
  const currentActions = currentEvents.filter((event) => event?.event_type === EVENT_TYPES.SUGGESTION_ACTION);
  const currentStockouts = currentEvents.filter((event) => event?.event_type === EVENT_TYPES.STOCKOUT_INCIDENT);
  const currentErrors = currentEvents.filter((event) => event?.event_type === EVENT_TYPES.SERVICE_ERROR);

  const baselineDecisions = baselineEvents.filter((event) => event?.event_type === EVENT_TYPES.MODEL_DECISION);

  const fallbackCount = currentDecisions.filter((event) => event?.fallback_used === true).length;
  const acceptedCount = currentActions.filter((event) => event?.accepted === true).length;

  const currentAverageConfidence = average(currentDecisions.map((event) => event?.confidence));
  const baselineAverageConfidence = average(baselineDecisions.map((event) => event?.confidence));

  const confidenceDrift = (currentAverageConfidence !== null && baselineAverageConfidence !== null)
    ? Number((currentAverageConfidence - baselineAverageConfidence).toFixed(6))
    : null;

  const metrics = {
    window_minutes: Math.max(1, Math.trunc(toNumber(windowMinutes, 24 * 60))),
    baseline_window_minutes: Math.max(1, Math.trunc(toNumber(baselineWindowMinutes, 7 * 24 * 60))),
    counts: {
      decisions: currentDecisions.length,
      actions: currentActions.length,
      accepted_actions: acceptedCount,
      stockouts: currentStockouts.length,
      service_errors: currentErrors.length,
    },
    fallback_rate: ratio(fallbackCount, currentDecisions.length),
    confidence: {
      current_average: currentAverageConfidence,
      baseline_average: baselineAverageConfidence,
      drift: confidenceDrift,
      absolute_drift: confidenceDrift === null ? null : Number(Math.abs(confidenceDrift).toFixed(6)),
    },
    suggestion_acceptance_rate: ratio(acceptedCount, currentActions.length),
    stockout_incident_rate: ratio(currentStockouts.length, currentDecisions.length),
    error_rate: ratio(currentErrors.length, currentDecisions.length),
    trends: buildTrendSeries({
      decisions: currentDecisions,
      actions: currentActions,
      stockouts: currentStockouts,
    }),
  };

  return metrics;
};

module.exports = {
  MONITORING_EVENTS_PATH,
  EVENT_TYPES,
  readEvents,
  recordDecisionEvent,
  recordSuggestionActionEvent,
  recordStockoutIncidentEvent,
  recordServiceErrorEvent,
  getMonitoringMetrics,
};
