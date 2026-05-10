const fs = require('fs');

const { PATHS, readJson, writeJson, nowIso } = require('../scripts/trust/trustOptimizationUtils');

const SCHEMA_VERSION = '1.0.0';

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNonNegativeFinite = (value, fallback = 0) => {
  return Math.max(0, toFinite(value, fallback));
};

const toMaybeFinite = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toIso = (value, fallbackIso) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallbackIso;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return fallbackIso;
  }

  return date.toISOString();
};

const toBoundedRate = (value) => {
  const numeric = toFinite(value, 0);
  return Math.max(0, Math.min(1, numeric));
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const pickBaselineBrier = ({ payload, previousSnapshot }) => {
  const candidateValues = [
    payload?.metrics?.brier_baseline,
    payload?.baseline?.performance?.brier_score,
    payload?.metrics_baseline?.brier_score,
    previousSnapshot?.metrics?.brier_score,
  ];

  for (const candidate of candidateValues) {
    const numeric = toMaybeFinite(candidate);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
};

const normalizeFeatureDrift = (payload = {}) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const next = {};

  for (const [featureKey, stats] of Object.entries(raw)) {
    next[featureKey] = {
      mean_shift: toNonNegativeFinite(stats?.mean_shift, 0),
      variance_shift: toNonNegativeFinite(stats?.variance_shift, 0),
      sample_count: Math.max(0, Math.trunc(toFinite(stats?.sample_count, 0))),
    };
  }

  return next;
};

const normalizeSegmentSummary = (payload = {}) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const next = {};

  for (const [segmentKey, entry] of Object.entries(raw)) {
    const requestCount = Math.max(0, Math.trunc(toFinite(entry?.request_count, 0)));
    const fallbackCount = Math.max(0, Math.trunc(toFinite(entry?.fallback_count, 0)));
    const errorCount = Math.max(0, Math.trunc(toFinite(entry?.error_count, 0)));

    next[segmentKey] = {
      request_count: requestCount,
      fallback_count: fallbackCount,
      error_count: errorCount,
      fallback_rate: entry?.fallback_rate === undefined
        ? (requestCount > 0 ? fallbackCount / requestCount : 0)
        : toBoundedRate(entry.fallback_rate),
      error_rate: entry?.error_rate === undefined
        ? (requestCount > 0 ? errorCount / requestCount : 0)
        : toBoundedRate(entry.error_rate),
    };
  }

  return next;
};

const normalizeGuardrails = (payload = []) => {
  return toArray(payload).map((entry) => ({
    scope: typeof entry?.scope === 'string' ? entry.scope : 'global',
    segmentKey: entry?.segmentKey || null,
    metric: entry?.metric || null,
    reason: entry?.reason || 'unspecified',
    timestamp: entry?.timestamp ? toIso(entry.timestamp, nowIso()) : null,
  }));
};

const normalizeHistogram = (payload = []) => {
  const values = toArray(payload)
    .map((value) => toNonNegativeFinite(value, 0));

  if (values.length === 0) {
    return [];
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return new Array(values.length).fill(0);
  }

  return values.map((value) => value / sum);
};

const normalizeMonitoringSnapshot = ({
  snapshot,
  source = 'unknown',
  ingestedAt = nowIso(),
  previousSnapshot = null,
} = {}) => {
  const payload = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const baselineBrier = pickBaselineBrier({ payload, previousSnapshot });

  const brierScore = toMaybeFinite(payload?.metrics?.brier_score);
  const brierDegradation = payload?.metrics?.brier_degradation !== undefined
    ? toMaybeFinite(payload.metrics.brier_degradation)
    : (brierScore !== null && baselineBrier !== null ? brierScore - baselineBrier : null);

  return {
    schema_version: SCHEMA_VERSION,
    source: String(source || 'unknown'),
    ingested_at: toIso(ingestedAt, nowIso()),
    generated_at: toIso(payload?.generated_at, nowIso()),
    snapshot_version: Math.max(0, Math.trunc(toFinite(payload?.snapshot_version, 0))),
    request_count: Math.max(0, Math.trunc(toFinite(payload?.request_count, 0))),
    fallback_rate: toBoundedRate(payload?.fallback_rate),
    error_rate: toBoundedRate(payload?.error_rate),
    latency_ms_p95: toNonNegativeFinite(payload?.latency_ms_p95, 0),
    rollout_observed_percentage: Math.max(0, Math.min(100, toFinite(payload?.rollout_observed_percentage, 0))),
    business_loss_increase_pct: toMaybeFinite(payload?.business_loss_increase_pct),
    metrics: {
      auc_pr: toMaybeFinite(payload?.metrics?.auc_pr),
      recall_at_precision_90: toMaybeFinite(payload?.metrics?.recall_at_precision_90),
      brier_score: brierScore,
      brier_baseline: baselineBrier,
      brier_degradation: brierDegradation,
      calibration_shift: toMaybeFinite(payload?.metrics?.calibration_shift),
    },
    prediction_drift_psi: toNonNegativeFinite(payload?.prediction_drift_psi, 0),
    prediction_histogram: normalizeHistogram(payload?.prediction_histogram),
    feature_drift: normalizeFeatureDrift(payload?.feature_drift),
    segment_summary: normalizeSegmentSummary(payload?.segment_summary),
    triggered_guardrails: normalizeGuardrails(payload?.triggered_guardrails),
    alerts_recent: toArray(payload?.alerts_recent),
    metadata: {
      app_version: payload?.metadata?.app_version || payload?.app_version || null,
      user_id: payload?.metadata?.user_id || payload?.user_id || null,
      rollout_stage: payload?.metadata?.rollout_stage || payload?.rollout_stage || null,
      rollout_percentage: toMaybeFinite(payload?.metadata?.rollout_percentage ?? payload?.rollout_percentage),
    },
  };
};

const writeMonitoringSnapshot = ({
  snapshot,
  source = 'unknown',
  outputPath = PATHS.monitoringSnapshot,
} = {}) => {
  const previousSnapshot = readJson(outputPath, null);
  const normalized = normalizeMonitoringSnapshot({
    snapshot,
    source,
    ingestedAt: nowIso(),
    previousSnapshot,
  });

  writeJson(outputPath, normalized);

  return {
    output_path: outputPath,
    snapshot: normalized,
  };
};

const loadMonitoringSnapshot = ({ inputPath = PATHS.monitoringSnapshot } = {}) => {
  return readJson(inputPath, null);
};

const hasMonitoringSnapshot = ({ inputPath = PATHS.monitoringSnapshot } = {}) => {
  return fs.existsSync(inputPath);
};

module.exports = {
  SCHEMA_VERSION,
  normalizeMonitoringSnapshot,
  writeMonitoringSnapshot,
  loadMonitoringSnapshot,
  hasMonitoringSnapshot,
};