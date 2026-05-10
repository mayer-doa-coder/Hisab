const DEFAULT_REVERT_TARGET = 'champion';

export const TRUST_ROLLOUT_STAGES = Object.freeze([
  { key: 'stage_1_canary', percentage: 5 },
  { key: 'stage_2_limited', percentage: 25 },
  { key: 'stage_3_expanded', percentage: 50 },
  { key: 'stage_4_full', percentage: 100 },
]);

export const DEFAULT_TRUST_ROLLOUT_CONFIG = Object.freeze({
  enable_new_scoring: true,
  rollout_percentage: 5,
  rollout_stage: 'stage_1_canary',
  challenger_enabled: true,
  challenger_segment_overrides: {},
  revert_target: DEFAULT_REVERT_TARGET,
});

const clampPercentage = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.trunc(numeric)));
};

const normalizeSegmentKey = (segmentKey) => {
  if (typeof segmentKey !== 'string') {
    return '';
  }

  return segmentKey.trim().toLowerCase();
};

const toStableUserKey = (userId) => {
  if (userId === null || userId === undefined) {
    return '';
  }

  return String(userId).trim();
};

const fnv1aHash = (input) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const getStageFromPercentage = (percentage) => {
  const normalized = clampPercentage(percentage);
  const stage = TRUST_ROLLOUT_STAGES.find((entry) => normalized <= entry.percentage);
  return stage ? stage.key : TRUST_ROLLOUT_STAGES[TRUST_ROLLOUT_STAGES.length - 1].key;
};

const normalizeConfig = (config = {}) => {
  const merged = {
    ...DEFAULT_TRUST_ROLLOUT_CONFIG,
    ...(config || {}),
  };

  const rolloutPercentage = clampPercentage(merged.rollout_percentage);
  const stageKey = typeof merged.rollout_stage === 'string' && merged.rollout_stage.trim()
    ? merged.rollout_stage.trim()
    : getStageFromPercentage(rolloutPercentage);

  return {
    ...merged,
    rollout_percentage: rolloutPercentage,
    rollout_stage: stageKey,
    enable_new_scoring: merged.enable_new_scoring !== false,
    challenger_enabled: merged.challenger_enabled !== false,
    challenger_segment_overrides: {
      ...(merged.challenger_segment_overrides || {}),
    },
    revert_target: merged.revert_target === 'rule-based' ? 'rule-based' : DEFAULT_REVERT_TARGET,
  };
};

const buildEvent = ({ type, reason, segmentKey = null, metadata = null }) => ({
  type,
  reason: reason || 'unspecified',
  segmentKey: segmentKey || null,
  metadata: metadata || null,
  timestamp: new Date().toISOString(),
});

export const createTrustRolloutController = (options = {}) => {
  const logger = typeof options?.logger === 'function' ? options.logger : console.warn;
  let config = normalizeConfig(options?.config || {});
  const events = [];

  const emitEvent = (event) => {
    events.push(event);
    while (events.length > 200) {
      events.shift();
    }

    logger('[TRUST_ROLLOUT]', JSON.stringify(event));
    return event;
  };

  const getUserBucket = (userId) => {
    const userKey = toStableUserKey(userId);
    if (!userKey) {
      return null;
    }

    return fnv1aHash(userKey) % 100;
  };

  const isUserEnabledForRollout = (userId) => {
    const bucket = getUserBucket(userId);
    if (bucket === null) {
      return false;
    }

    return bucket < config.rollout_percentage;
  };

  const evaluateUser = (userId) => {
    const bucket = getUserBucket(userId);
    const rolloutEnabledForUser = isUserEnabledForRollout(userId);
    const enabled = config.enable_new_scoring && rolloutEnabledForUser;

    return {
      enabled,
      rolloutEnabledForUser,
      bucket,
      rolloutPercentage: config.rollout_percentage,
      rolloutStage: config.rollout_stage,
      enableNewScoring: config.enable_new_scoring,
      revertTarget: config.revert_target,
    };
  };

  const isSegmentChallengerEnabled = (segmentKey) => {
    const normalizedSegment = normalizeSegmentKey(segmentKey);
    if (!normalizedSegment) {
      return config.challenger_enabled;
    }

    if (!config.challenger_enabled) {
      return false;
    }

    const override = config.challenger_segment_overrides[normalizedSegment];
    if (override === false) {
      return false;
    }

    if (override === true) {
      return true;
    }

    return true;
  };

  const setConfig = (patch = {}) => {
    config = normalizeConfig({
      ...config,
      ...(patch || {}),
    });

    emitEvent(buildEvent({
      type: 'CONFIG_UPDATED',
      reason: 'manual_config_update',
      metadata: {
        rollout_percentage: config.rollout_percentage,
        rollout_stage: config.rollout_stage,
        enable_new_scoring: config.enable_new_scoring,
        challenger_enabled: config.challenger_enabled,
      },
    }));

    return getConfig();
  };

  const setRolloutStage = (stageKey) => {
    const normalized = typeof stageKey === 'string' ? stageKey.trim() : '';
    const stage = TRUST_ROLLOUT_STAGES.find((entry) => entry.key === normalized);
    if (!stage) {
      return getConfig();
    }

    config = normalizeConfig({
      ...config,
      rollout_stage: stage.key,
      rollout_percentage: stage.percentage,
    });

    emitEvent(buildEvent({
      type: 'ROLLOUT_STAGE_UPDATED',
      reason: `stage:${stage.key}`,
      metadata: {
        rollout_percentage: config.rollout_percentage,
      },
    }));

    return getConfig();
  };

  const setRolloutPercentage = (percentage) => {
    const nextPercentage = clampPercentage(percentage);
    config = normalizeConfig({
      ...config,
      rollout_percentage: nextPercentage,
      rollout_stage: getStageFromPercentage(nextPercentage),
    });

    emitEvent(buildEvent({
      type: 'ROLLOUT_PERCENTAGE_UPDATED',
      reason: `percentage:${nextPercentage}`,
      metadata: {
        rollout_percentage: config.rollout_percentage,
        rollout_stage: config.rollout_stage,
      },
    }));

    return getConfig();
  };

  const disableSegment = ({ segmentKey, reason, metadata = null }) => {
    const normalizedSegment = normalizeSegmentKey(segmentKey);
    if (!normalizedSegment) {
      return null;
    }

    config = normalizeConfig({
      ...config,
      challenger_segment_overrides: {
        ...config.challenger_segment_overrides,
        [normalizedSegment]: false,
      },
    });

    return emitEvent(buildEvent({
      type: 'SEGMENT_CHALLENGER_DISABLED',
      reason: reason || 'segment_guardrail_breach',
      segmentKey: normalizedSegment,
      metadata,
    }));
  };

  const disableNewScoring = ({ reason, metadata = null }) => {
    config = normalizeConfig({
      ...config,
      enable_new_scoring: false,
      challenger_enabled: false,
    });

    return emitEvent(buildEvent({
      type: 'GLOBAL_AUTO_REVERT',
      reason: reason || 'guardrail_breach',
      metadata,
    }));
  };

  const enableNewScoring = ({ reason = 'manual_enable', metadata = null } = {}) => {
    config = normalizeConfig({
      ...config,
      enable_new_scoring: true,
      challenger_enabled: true,
    });

    return emitEvent(buildEvent({
      type: 'GLOBAL_SCORING_ENABLED',
      reason,
      metadata,
    }));
  };

  const getConfig = () => ({
    ...config,
    challenger_segment_overrides: {
      ...config.challenger_segment_overrides,
    },
  });

  const getRecentEvents = () => [...events];

  return {
    getConfig,
    getRecentEvents,
    setConfig,
    setRolloutStage,
    setRolloutPercentage,
    evaluateUser,
    isSegmentChallengerEnabled,
    disableSegment,
    disableNewScoring,
    enableNewScoring,
    getUserBucket,
    isUserEnabledForRollout,
  };
};
