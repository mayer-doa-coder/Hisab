const {
  loadRolloutConfig,
  hashToBucket,
  getCurrentRolloutPercent,
  getFeatureFlags,
} = require('./featureFlag');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveStageLabel = (percent) => {
  const token = Math.max(0, Math.min(100, Math.trunc(toNumber(percent, 0))));
  if (token <= 5) {
    return 'canary';
  }
  if (token < 100) {
    return 'partial';
  }
  return 'full';
};

const buildSubjectKey = ({
  userId = null,
  productId = null,
  scope = 'ensemble_rollout',
} = {}) => {
  const userToken = String(userId || 'anonymous').trim() || 'anonymous';
  const productToken = String(productId || 'global').trim() || 'global';
  return `${String(scope || 'ensemble_rollout')}:${userToken}:${productToken}`;
};

const resolveSubjectBucket = ({ userId = null, productId = null, scope = 'ensemble_rollout' } = {}) => {
  return hashToBucket(buildSubjectKey({ userId, productId, scope }));
};

const isSubjectInRollout = ({
  userId = null,
  productId = null,
  rolloutConfig = null,
} = {}) => {
  const config = rolloutConfig || loadRolloutConfig();
  const percent = getCurrentRolloutPercent(config);
  const bucket = resolveSubjectBucket({ userId, productId });

  return {
    in_rollout: Boolean(config?.enabled) && bucket < percent,
    bucket,
    rollout_percent: percent,
    stage_label: resolveStageLabel(percent),
  };
};

const resolveRolloutExecutionForSubject = ({
  userId = null,
  productId = null,
  rolloutConfig = null,
} = {}) => {
  const config = rolloutConfig || loadRolloutConfig();
  const flags = getFeatureFlags(config);
  const subject = isSubjectInRollout({
    userId,
    productId,
    rolloutConfig: config,
  });

  if (!flags.ensemble_enabled) {
    return {
      use_ensemble: false,
      fallback_to_baseline: true,
      reason: 'ensemble_feature_disabled',
      ...subject,
      feature_flags: flags,
    };
  }

  if (flags.baseline_only_mode) {
    return {
      use_ensemble: false,
      fallback_to_baseline: true,
      reason: 'baseline_only_mode_enabled',
      ...subject,
      feature_flags: flags,
    };
  }

  if (!subject.in_rollout) {
    return {
      use_ensemble: false,
      fallback_to_baseline: true,
      reason: 'subject_not_in_rollout_segment',
      ...subject,
      feature_flags: flags,
    };
  }

  return {
    use_ensemble: true,
    fallback_to_baseline: false,
    reason: 'ensemble_rollout_active',
    ...subject,
    feature_flags: flags,
  };
};

const getRolloutStatus = ({ rolloutConfig = null } = {}) => {
  const config = rolloutConfig || loadRolloutConfig();
  const percent = getCurrentRolloutPercent(config);

  return {
    schema_version: config?.schema_version || 'rollout_config_v1',
    enabled: Boolean(config?.enabled),
    stage_index: Math.max(0, Math.trunc(toNumber(config?.stage_index, 0))),
    rollout_percent: percent,
    stage_label: resolveStageLabel(percent),
    candidate_version: String(config?.candidate_version || '').trim() || null,
    feature_flags: getFeatureFlags(config),
    thresholds: config?.thresholds || {},
    updated_at: config?.updated_at || null,
  };
};

module.exports = {
  resolveStageLabel,
  buildSubjectKey,
  resolveSubjectBucket,
  isSubjectInRollout,
  resolveRolloutExecutionForSubject,
  getRolloutStatus,
};
