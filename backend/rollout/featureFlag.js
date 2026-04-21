const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { rollbackToPreviousVersion } = require('../registry/modelRegistry');

const ROLLOUT_CONFIG_PATH = path.join(__dirname, '..', 'artifacts', 'rolloutConfig.json');

const nowIso = () => new Date().toISOString();

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const ensureArtifactsDir = () => {
  const directory = path.dirname(ROLLOUT_CONFIG_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const defaultRolloutConfig = () => ({
  schema_version: 'rollout_config_v2',
  enabled: true,
  candidate_version: null,
  stages: [5, 25, 50, 100],
  stage_index: 0,
  rollback_on_alert: true,
  thresholds: {
    drift_alert_required: true,
    stability_alert_required: true,
    max_error_rate: 0.05,
    max_fallback_rate: 0.2,
    max_confidence_drift_abs: 0.12,
    min_acceptance_rate: 0.35,
    max_stockout_rate: 0.08,
    unstable_outputs_alert: true,
  },
  feature_flags: {
    ensemble_enabled: true,
    baseline_fallback_enabled: true,
    baseline_only_mode: false,
  },
  segmentation: {
    hash_scope: 'ensemble_rollout',
    anonymous_token: 'anonymous',
    use_product_segmentation: true,
  },
  updated_at: nowIso(),
});

const normalizeConfig = (config = null) => {
  const merged = {
    ...defaultRolloutConfig(),
    ...(config && typeof config === 'object' && !Array.isArray(config) ? config : {}),
  };

  merged.stages = Array.isArray(config?.stages) && config.stages.length > 0
    ? config.stages
    : [5, 25, 50, 100];

  merged.thresholds = {
    ...defaultRolloutConfig().thresholds,
    ...(config?.thresholds && typeof config.thresholds === 'object' ? config.thresholds : {}),
  };

  merged.feature_flags = {
    ...defaultRolloutConfig().feature_flags,
    ...(config?.feature_flags && typeof config.feature_flags === 'object' ? config.feature_flags : {}),
  };

  merged.segmentation = {
    ...defaultRolloutConfig().segmentation,
    ...(config?.segmentation && typeof config.segmentation === 'object' ? config.segmentation : {}),
  };

  merged.updated_at = config?.updated_at || nowIso();
  return merged;
};

const loadRolloutConfig = () => {
  try {
    if (!fs.existsSync(ROLLOUT_CONFIG_PATH)) {
      return defaultRolloutConfig();
    }

    const raw = fs.readFileSync(ROLLOUT_CONFIG_PATH, 'utf8');
    if (!raw.trim()) {
      return defaultRolloutConfig();
    }

    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch {
    return defaultRolloutConfig();
  }
};

const saveRolloutConfig = (config) => {
  ensureArtifactsDir();
  const next = normalizeConfig({
    ...(config || {}),
    updated_at: nowIso(),
  });

  fs.writeFileSync(ROLLOUT_CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

const hashToBucket = (value) => {
  const token = String(value || 'anonymous').trim();
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const prefix = hash.slice(0, 8);
  const numeric = parseInt(prefix, 16);
  return numeric % 100;
};

const buildSegmentationKey = ({
  userId = null,
  productId = null,
  scope = null,
  rolloutConfig = null,
} = {}) => {
  const config = rolloutConfig || loadRolloutConfig();
  const segmentation = config.segmentation || {};

  const userToken = String(userId || segmentation.anonymous_token || 'anonymous').trim() || 'anonymous';
  const productToken = segmentation.use_product_segmentation
    ? String(productId || 'global').trim() || 'global'
    : 'global';

  const scopeToken = String(scope || segmentation.hash_scope || 'ensemble_rollout').trim() || 'ensemble_rollout';
  return `${scopeToken}:${userToken}:${productToken}`;
};

const selectRolloutBucket = ({
  userId = null,
  productId = null,
  scope = null,
  rolloutConfig = null,
} = {}) => {
  return hashToBucket(buildSegmentationKey({
    userId,
    productId,
    scope,
    rolloutConfig,
  }));
};

const getCurrentRolloutPercent = (config = null) => {
  const safeConfig = normalizeConfig(config || loadRolloutConfig());
  const stages = Array.isArray(safeConfig.stages) && safeConfig.stages.length > 0 ? safeConfig.stages : [5, 25, 50, 100];
  const index = Math.max(0, Math.min(stages.length - 1, Math.trunc(toNumber(safeConfig.stage_index, 0))));
  return Math.max(0, Math.min(100, Number(stages[index] || 0)));
};

const getFeatureFlags = (rolloutConfig = null) => {
  const safeConfig = normalizeConfig(rolloutConfig || loadRolloutConfig());
  return {
    ensemble_enabled: Boolean(safeConfig.feature_flags.ensemble_enabled),
    baseline_fallback_enabled: Boolean(safeConfig.feature_flags.baseline_fallback_enabled),
    baseline_only_mode: Boolean(safeConfig.feature_flags.baseline_only_mode),
  };
};

const setFeatureFlags = ({ featureFlags = {} } = {}) => {
  const config = loadRolloutConfig();
  const next = {
    ...config,
    feature_flags: {
      ...config.feature_flags,
      ...(featureFlags && typeof featureFlags === 'object' && !Array.isArray(featureFlags) ? featureFlags : {}),
    },
  };

  return saveRolloutConfig(next);
};

const setEnsembleFeatureFlags = ({
  ensembleEnabled = null,
  baselineFallbackEnabled = null,
  baselineOnlyMode = null,
} = {}) => {
  const patch = {};

  if (ensembleEnabled !== null && ensembleEnabled !== undefined) {
    patch.ensemble_enabled = Boolean(ensembleEnabled);
  }
  if (baselineFallbackEnabled !== null && baselineFallbackEnabled !== undefined) {
    patch.baseline_fallback_enabled = Boolean(baselineFallbackEnabled);
  }
  if (baselineOnlyMode !== null && baselineOnlyMode !== undefined) {
    patch.baseline_only_mode = Boolean(baselineOnlyMode);
  }

  return setFeatureFlags({ featureFlags: patch });
};

const isSubjectInRollout = ({
  userId = null,
  productId = null,
  scope = null,
  rolloutConfig = null,
} = {}) => {
  const config = rolloutConfig || loadRolloutConfig();
  const bucket = selectRolloutBucket({ userId, productId, scope, rolloutConfig: config });
  const rolloutPercent = getCurrentRolloutPercent(config);

  return {
    in_rollout: Boolean(config.enabled) && bucket < rolloutPercent,
    bucket,
    rollout_percent: rolloutPercent,
  };
};

const selectModelVersionForUser = ({ userId, productId = null, registryState = null, rolloutConfig = null } = {}) => {
  const registry = registryState || { active_version: null, versions: [] };
  const config = rolloutConfig || loadRolloutConfig();

  const activeVersion = String(registry?.active_version || '').trim() || null;
  const candidateVersion = String(config?.candidate_version || '').trim() || null;

  const rolloutSubject = isSubjectInRollout({
    userId,
    productId,
    scope: 'model_rollout',
    rolloutConfig: config,
  });

  const candidateExists = candidateVersion
    && Array.isArray(registry?.versions)
    && registry.versions.some((item) => String(item?.version || '').trim() === candidateVersion);

  const useCandidate = Boolean(config?.enabled)
    && candidateExists
    && rolloutSubject.in_rollout;

  return {
    selected_version: useCandidate ? candidateVersion : activeVersion,
    active_version: activeVersion,
    candidate_version: candidateExists ? candidateVersion : null,
    rollout_percent: rolloutSubject.rollout_percent,
    bucket: rolloutSubject.bucket,
    used_candidate: useCandidate,
    enabled: Boolean(config?.enabled),
  };
};

const setCandidateRolloutVersion = ({ version, resetStage = true } = {}) => {
  const config = loadRolloutConfig();
  const next = {
    ...config,
    candidate_version: String(version || '').trim() || null,
    stage_index: resetStage ? 0 : config.stage_index,
  };

  return saveRolloutConfig(next);
};

const advanceRolloutStage = () => {
  const config = loadRolloutConfig();
  const stages = Array.isArray(config?.stages) && config.stages.length > 0 ? config.stages : [5, 25, 50, 100];
  const nextIndex = Math.min(stages.length - 1, Math.max(0, Math.trunc(toNumber(config?.stage_index, 0)) + 1));

  return saveRolloutConfig({
    ...config,
    stage_index: nextIndex,
  });
};

const disableCandidateRollout = ({ reason = 'manual_disable' } = {}) => {
  const config = loadRolloutConfig();

  return saveRolloutConfig({
    ...config,
    candidate_version: null,
    stage_index: 0,
    enabled: false,
    disabled_reason: String(reason || 'manual_disable').trim(),
  });
};

const evaluateRollbackTriggers = ({
  driftReport = null,
  stabilityReport = null,
  healthMetrics = null,
  kpiMetrics = null,
  thresholds = null,
} = {}) => {
  const config = {
    max_error_rate: 0.05,
    max_fallback_rate: 0.2,
    max_confidence_drift_abs: 0.12,
    min_acceptance_rate: 0.35,
    max_stockout_rate: 0.08,
    unstable_outputs_alert: true,
    rollback_on_drift: true,
    rollback_on_stability: true,
    ...(thresholds || {}),
  };

  const reasons = [];

  if (config.rollback_on_drift && Boolean(driftReport?.alert)) {
    reasons.push('Drift exceeds threshold');
  }

  if (config.rollback_on_stability && Boolean(stabilityReport?.unstable)) {
    reasons.push('Transition stability degraded');
  }

  const errorRate = toNumber(healthMetrics?.error_rate, NaN);
  if (Number.isFinite(errorRate) && errorRate > toNumber(config.max_error_rate, 0.05)) {
    reasons.push('Error rate increased');
  }

  const fallbackRate = toNumber(kpiMetrics?.fallback_rate, NaN);
  if (Number.isFinite(fallbackRate) && fallbackRate > toNumber(config.max_fallback_rate, 0.2)) {
    reasons.push('Fallback rate exceeded threshold');
  }

  const confidenceDriftAbs = toNumber(kpiMetrics?.confidence?.absolute_drift, NaN);
  if (Number.isFinite(confidenceDriftAbs) && confidenceDriftAbs > toNumber(config.max_confidence_drift_abs, 0.12)) {
    reasons.push('Confidence drift exceeded threshold');
  }

  const acceptanceRate = toNumber(kpiMetrics?.suggestion_acceptance_rate, NaN);
  if (Number.isFinite(acceptanceRate) && acceptanceRate < toNumber(config.min_acceptance_rate, 0.35)) {
    reasons.push('Suggestion acceptance rate dropped');
  }

  const stockoutRate = toNumber(kpiMetrics?.stockout_incident_rate, NaN);
  if (Number.isFinite(stockoutRate) && stockoutRate > toNumber(config.max_stockout_rate, 0.08)) {
    reasons.push('Stockout incidents increased');
  }

  if (Boolean(config.unstable_outputs_alert) && Boolean(healthMetrics?.unstable_outputs || kpiMetrics?.unstable_outputs)) {
    reasons.push('Unstable outputs detected');
  }

  return {
    rollback_required: reasons.length > 0,
    reasons,
    thresholds: config,
  };
};

const executeSafeRollback = ({
  reason = 'automatic_safety_rollback',
  driftReport = null,
  stabilityReport = null,
  healthMetrics = null,
  kpiMetrics = null,
  thresholds = null,
} = {}) => {
  const trigger = evaluateRollbackTriggers({
    driftReport,
    stabilityReport,
    healthMetrics,
    kpiMetrics,
    thresholds,
  });

  if (!trigger.rollback_required) {
    return {
      rollback_executed: false,
      reasons: [],
      trigger,
    };
  }

  const rollback = rollbackToPreviousVersion({
    reason: `${reason}: ${trigger.reasons.join('; ')}`,
  });

  const rollout = saveRolloutConfig({
    ...loadRolloutConfig(),
    candidate_version: null,
    stage_index: 0,
    enabled: false,
    disabled_reason: `${reason}: ${trigger.reasons.join('; ')}`,
    feature_flags: {
      ...getFeatureFlags(),
      ensemble_enabled: false,
      baseline_fallback_enabled: true,
      baseline_only_mode: true,
    },
  });

  return {
    rollback_executed: Boolean(rollback?.rolled_back),
    rollback,
    rollout,
    trigger,
  };
};

module.exports = {
  ROLLOUT_CONFIG_PATH,
  loadRolloutConfig,
  saveRolloutConfig,
  hashToBucket,
  buildSegmentationKey,
  selectRolloutBucket,
  isSubjectInRollout,
  getCurrentRolloutPercent,
  getFeatureFlags,
  setFeatureFlags,
  setEnsembleFeatureFlags,
  selectModelVersionForUser,
  setCandidateRolloutVersion,
  advanceRolloutStage,
  disableCandidateRollout,
  evaluateRollbackTriggers,
  executeSafeRollback,
};
