import { canonicalizeRole } from '../../../security/rbac';
import { getPilotSnapshot } from '../voiceAnalyticsLogger';
import { PILOT_ROLLOUT_CONFIG } from './pilotConfig';

const toStableUserId = (user) =>
  String(user?.id || user?.server_id || user?.email || '').trim();

const DEFAULT_ROLLOUT_STAGES = Object.freeze([5, 25, 50, 100]);
const CRITICAL_ROLLBACK_SIGNALS = Object.freeze([
  'critical safety issue',
  'data integrity issue',
  'false execution rate',
  'repeated stt failures',
  'p95 latency',
]);

const normalizeUserList = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const clampPercentage = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
};

const hashToBucketPercent = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return 101;
  }

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash) % 100;
};

const toRuntimeRolloutConfig = (baseConfig = {}) => {
  const legacyAllowed = normalizeUserList(baseConfig?.cohort?.allowedUserIds);
  const legacyBlocked = normalizeUserList(baseConfig?.cohort?.blockedUserIds);
  const legacyRoles = Array.isArray(baseConfig?.cohort?.allowedRoles)
    ? baseConfig.cohort.allowedRoles
    : [];

  return {
    enabled: baseConfig?.enabled !== false,
    emergency_disabled: baseConfig?.emergency_disabled === true,
    disable_reason: String(baseConfig?.disable_reason || '').trim(),
    cycleDays: Number(baseConfig?.cycleDays || 7),
    rollout_percentage: clampPercentage(baseConfig?.rollout_percentage ?? 0),
    rollout_stages: Array.isArray(baseConfig?.rollout_stages) && baseConfig.rollout_stages.length
      ? baseConfig.rollout_stages.map((item) => clampPercentage(item)).sort((a, b) => a - b)
      : [...DEFAULT_ROLLOUT_STAGES],
    stable_cycles_required: Math.max(1, Number(baseConfig?.stable_cycles_required || 2)),
    stable_cycle_count: Math.max(0, Number(baseConfig?.stable_cycle_count || 0)),
    command_coverage: Array.isArray(baseConfig?.command_coverage)
      ? baseConfig.command_coverage.map((item) => String(item || '').trim()).filter(Boolean)
      : ['ADD_DEBT', 'PAYMENT', 'SALE'],
    enabled_users: normalizeUserList(baseConfig?.enabled_users ?? legacyAllowed),
    disabled_users: normalizeUserList(baseConfig?.disabled_users ?? legacyBlocked),
    allowed_roles: legacyRoles.map((item) => canonicalizeRole(item)),
    kpiThresholds: {
      ...(baseConfig?.kpiThresholds || {}),
    },
  };
};

let runtimeRolloutConfig = toRuntimeRolloutConfig(PILOT_ROLLOUT_CONFIG);

export const getRolloutConfig = () => ({ ...runtimeRolloutConfig });

export const updateRolloutConfig = (patch = {}) => {
  runtimeRolloutConfig = toRuntimeRolloutConfig({
    ...runtimeRolloutConfig,
    ...(patch || {}),
    kpiThresholds: {
      ...(runtimeRolloutConfig?.kpiThresholds || {}),
      ...(patch?.kpiThresholds || {}),
    },
  });
  return getRolloutConfig();
};

export const setRolloutPercentage = (value) => updateRolloutConfig({
  rollout_percentage: clampPercentage(value),
});

export const setEnabledUsers = (users = []) => updateRolloutConfig({
  enabled_users: normalizeUserList(users),
});

export const setDisabledUsers = (users = []) => updateRolloutConfig({
  disabled_users: normalizeUserList(users),
});

export const emergencyDisableVoiceRollout = (reason = 'Emergency rollback') => updateRolloutConfig({
  enabled: false,
  emergency_disabled: true,
  disable_reason: String(reason || 'Emergency rollback').trim(),
  rollout_percentage: 0,
});

export const restoreVoiceRollout = () => updateRolloutConfig({
  enabled: true,
  emergency_disabled: false,
  disable_reason: '',
});

export const setCommandCoverage = (intents = []) => updateRolloutConfig({
  command_coverage: (Array.isArray(intents) ? intents : [])
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean),
});

const getCurrentStageIndex = (config = runtimeRolloutConfig) => {
  const stages = Array.isArray(config?.rollout_stages) && config.rollout_stages.length
    ? config.rollout_stages
    : DEFAULT_ROLLOUT_STAGES;
  return stages.findIndex((item) => Number(item) >= Number(config?.rollout_percentage || 0));
};

export const getRolloutStageInfo = ({ config = runtimeRolloutConfig } = {}) => {
  const stages = Array.isArray(config?.rollout_stages) && config.rollout_stages.length
    ? config.rollout_stages
    : DEFAULT_ROLLOUT_STAGES;
  const currentIndex = Math.max(0, getCurrentStageIndex(config));
  const current = Number(stages[currentIndex] || 0);
  const next = stages[currentIndex + 1] ?? null;
  const previous = currentIndex > 0 ? stages[currentIndex - 1] : null;

  return {
    stages,
    current,
    next,
    previous,
    isFinalStage: next === null,
  };
};

const hasCriticalRollbackBlocker = (blockers = []) => {
  const normalized = (Array.isArray(blockers) ? blockers : [])
    .map((item) => String(item || '').toLowerCase());

  return CRITICAL_ROLLBACK_SIGNALS.some((signal) =>
    normalized.some((blocker) => blocker.includes(signal))
  );
};

export const evaluateRolloutHealth = ({ review = null, config = runtimeRolloutConfig } = {}) => {
  const weeklyReview = review || buildPilotWeeklyReview({ config });
  const blockers = Array.isArray(weeklyReview?.decision?.blockers) ? weeklyReview.decision.blockers : [];
  const isHealthy = String(weeklyReview?.decision?.decision || '').toUpperCase() === 'GO';
  const critical = hasCriticalRollbackBlocker(blockers);

  const nextStableCycles = isHealthy
    ? Number(config?.stable_cycle_count || 0) + 1
    : 0;

  return {
    isHealthy,
    critical,
    blockers,
    stable_cycle_count: nextStableCycles,
    stable_cycles_required: Math.max(1, Number(config?.stable_cycles_required || 2)),
    review: weeklyReview,
  };
};

export const progressRolloutStage = ({ review = null, config = runtimeRolloutConfig } = {}) => {
  const health = evaluateRolloutHealth({ review, config });

  if (health.critical) {
    const reason = health.blockers[0] || 'Critical KPI degradation detected.';
    const next = emergencyDisableVoiceRollout(`Auto rollback: ${reason}`);
    return {
      action: 'ROLLBACK',
      reason,
      config: next,
      review: health.review,
    };
  }

  const updated = updateRolloutConfig({
    stable_cycle_count: health.stable_cycle_count,
  });

  if (!health.isHealthy) {
    return {
      action: 'HOLD',
      reason: 'KPI stability not reached; rollout frozen until next review.',
      config: updated,
      review: health.review,
    };
  }

  if (health.stable_cycle_count < health.stable_cycles_required) {
    return {
      action: 'HOLD',
      reason: `Need ${health.stable_cycles_required} stable cycles before expansion.`,
      config: updated,
      review: health.review,
    };
  }

  const stageInfo = getRolloutStageInfo({ config: updated });
  if (stageInfo.isFinalStage) {
    return {
      action: 'HOLD',
      reason: 'Rollout already at final stage (100%).',
      config: updated,
      review: health.review,
    };
  }

  const expanded = updateRolloutConfig({
    rollout_percentage: Number(stageInfo.next || updated.rollout_percentage),
    stable_cycle_count: 0,
  });

  return {
    action: 'EXPAND',
    reason: `Expanded rollout from ${stageInfo.current}% to ${stageInfo.next}%.`,
    config: expanded,
    review: health.review,
  };
};

const isEligibleByRole = ({ user, config }) => {
  const role = canonicalizeRole(user?.role || 'CASHIER');
  const allowedRoles = new Set((config?.allowed_roles || []).map((item) => canonicalizeRole(item)));
  return !allowedRoles.size || allowedRoles.has(role);
};

const isEligibleByPercentage = ({ userId, config }) => {
  const pct = clampPercentage(config?.rollout_percentage || 0);
  if (pct <= 0) {
    return false;
  }

  if (pct >= 100) {
    return true;
  }

  return hashToBucketPercent(userId) < pct;
};

export const isUserInPilotCohort = ({ user, config = PILOT_ROLLOUT_CONFIG } = {}) => {
  const resolvedConfig = config === PILOT_ROLLOUT_CONFIG
    ? runtimeRolloutConfig
    : toRuntimeRolloutConfig(config);

  if (!resolvedConfig?.enabled || resolvedConfig?.emergency_disabled) {
    return false;
  }

  const userId = toStableUserId(user);
  const enabledUsers = new Set(resolvedConfig?.enabled_users || []);
  const disabledUsers = new Set(resolvedConfig?.disabled_users || []);

  if (userId && disabledUsers.has(userId)) {
    return false;
  }

  if (userId && enabledUsers.has(userId)) {
    return true;
  }

  if (!isEligibleByRole({ user, config: resolvedConfig })) {
    return false;
  }

  return isEligibleByPercentage({ userId, config: resolvedConfig });
};

export const getPilotAccessState = ({ user, config = PILOT_ROLLOUT_CONFIG } = {}) => {
  const enabled = isUserInPilotCohort({ user, config });
  const resolvedConfig = config === PILOT_ROLLOUT_CONFIG
    ? runtimeRolloutConfig
    : toRuntimeRolloutConfig(config);

  const percentage = Number(resolvedConfig?.rollout_percentage || 0);
  const emergencyDisabled = resolvedConfig?.emergency_disabled === true;

  return {
    enabled,
    cycleDays: Number(resolvedConfig?.cycleDays || 7),
    rollout_percentage: percentage,
    rollout_stage: getRolloutStageInfo({ config: resolvedConfig }),
    command_coverage: resolvedConfig?.command_coverage || [],
    emergency_disabled: emergencyDisabled,
    message: enabled
      ? 'Pilot access enabled for this user.'
      : (emergencyDisabled
        ? 'Voice pilot is temporarily disabled for rollback.'
        : `Voice pilot is limited to rollout cohort users (${percentage}%).`),
  };
};

export const buildPilotWeeklyReview = ({ config = PILOT_ROLLOUT_CONFIG } = {}) => {
  const resolvedConfig = config === PILOT_ROLLOUT_CONFIG
    ? runtimeRolloutConfig
    : toRuntimeRolloutConfig(config);
  const cycleDays = Number(resolvedConfig?.cycleDays || 7);
  const snapshot = getPilotSnapshot({
    cycleDays,
    thresholds: resolvedConfig?.kpiThresholds || {},
  });

  return {
    ...snapshot,
    rollout: {
      rollout_percentage: Number(resolvedConfig?.rollout_percentage || 0),
      enabled_users: resolvedConfig?.enabled_users || [],
      disabled_users: resolvedConfig?.disabled_users || [],
      emergency_disabled: resolvedConfig?.emergency_disabled === true,
    },
    recommendations: suggestTuningAdjustments({ snapshot }),
  };
};

export const suggestTuningAdjustments = ({ snapshot } = {}) => {
  const blockers = snapshot?.decision?.blockers || [];
  const actions = [];

  if (blockers.some((item) => item.toLowerCase().includes('correction rate'))) {
    actions.push('Expand intent aliases and user hotwords from the top correction patterns.');
  }

  if (blockers.some((item) => item.toLowerCase().includes('latency'))) {
    actions.push('Prefer compact ASR grammar for pilot and reduce accepted candidate fan-out.');
  }

  if (blockers.some((item) => item.toLowerCase().includes('blocked rate'))) {
    actions.push('Lower ambiguity by tightening name delta and refining amount/date prompts.');
  }

  if (blockers.some((item) => item.toLowerCase().includes('success rate'))) {
    actions.push('Raise clarification frequency when confidence is near threshold to avoid wrong transitions.');
  }

  if (!actions.length) {
    actions.push('No threshold change required; continue monitoring for one additional cycle.');
  }

  return actions;
};

export default {
  isUserInPilotCohort,
  getPilotAccessState,
  buildPilotWeeklyReview,
  suggestTuningAdjustments,
  getRolloutConfig,
  updateRolloutConfig,
  setRolloutPercentage,
  setEnabledUsers,
  setDisabledUsers,
  setCommandCoverage,
  getRolloutStageInfo,
  evaluateRolloutHealth,
  progressRolloutStage,
  emergencyDisableVoiceRollout,
  restoreVoiceRollout,
};
