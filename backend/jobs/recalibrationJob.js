const {
  registerModelVersion,
  getVersionEntry,
  getActiveVersionEntry,
  listModelVersions,
  setActiveModelVersion,
  recordMonitoringEvent,
} = require('../registry/modelRegistry');
const { detectDrift } = require('../monitoring/driftDetector');
const { detectTransitionStability } = require('../monitoring/stabilityChecker');
const { executeSafeRollback, setCandidateRolloutVersion } = require('../rollout/featureFlag');
const { buildModelFromMarketData } = require('../services/markovService');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseVersion = (version) => {
  const token = String(version || '').trim();
  const match = token.match(/^markov_model_v(\d+)\.(\d+)$/i);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
};

const formatVersion = (major, minor) => `markov_model_v${major}.${minor}`;

const nextMinorVersion = (baseVersion) => {
  const parsed = parseVersion(baseVersion);
  if (!parsed) {
    return 'markov_model_v1.1';
  }
  return formatVersion(parsed.major, parsed.minor + 1);
};

const nextMajorVersion = (versions = []) => {
  const parsed = versions
    .map((item) => parseVersion(item?.version || item))
    .filter(Boolean);

  const maxMajor = parsed.length > 0
    ? Math.max(...parsed.map((item) => item.major))
    : 0;

  return formatVersion(maxMajor + 1, 0);
};

const computeCalibrationLayer = ({ expectedProbabilities = [], actualOutcomes = [] } = {}) => {
  const size = Math.min(expectedProbabilities.length, actualOutcomes.length);
  if (size === 0) {
    return {
      method: 'bias_shift',
      version: 'calibration_v1',
      params: {
        bias: 0,
        expected_mean: null,
        actual_mean: null,
      },
      updated_at: new Date().toISOString(),
    };
  }

  let expectedSum = 0;
  let actualSum = 0;

  for (let index = 0; index < size; index += 1) {
    expectedSum += Math.max(0, Math.min(1, toNumber(expectedProbabilities[index], 0)));
    actualSum += toNumber(actualOutcomes[index], 0) > 0 ? 1 : 0;
  }

  const expectedMean = expectedSum / size;
  const actualMean = actualSum / size;

  return {
    method: 'bias_shift',
    version: 'calibration_v1',
    params: {
      bias: Number((actualMean - expectedMean).toFixed(6)),
      expected_mean: Number(expectedMean.toFixed(6)),
      actual_mean: Number(actualMean.toFixed(6)),
      sample_size: size,
    },
    updated_at: new Date().toISOString(),
  };
};

const runMonthlyRecalibration = ({
  baseVersion = null,
  expectedProbabilities = [],
  actualOutcomes = [],
  performanceMetrics = null,
  activate = true,
  createdBy = 'monthly_recalibration_job',
} = {}) => {
  const active = getActiveVersionEntry();
  const sourceVersion = baseVersion || active?.version;
  if (!sourceVersion) {
    throw new Error('No base version available for recalibration.');
  }

  const sourceEntry = getVersionEntry(sourceVersion);
  if (!sourceEntry?.snapshot) {
    throw new Error(`Base version not found for recalibration: ${sourceVersion}`);
  }

  const targetVersion = nextMinorVersion(sourceVersion);
  const calibrationLayer = computeCalibrationLayer({ expectedProbabilities, actualOutcomes });

  const model = {
    states: sourceEntry.snapshot.states,
    global_matrix: sourceEntry.snapshot.transition_matrices?.global || {},
    regime_matrices: sourceEntry.snapshot.transition_matrices?.regime || {},
    config_snapshot: sourceEntry.snapshot.config_snapshot || {},
    conditional_extension: sourceEntry.snapshot.conditional_extension || {},
    metadata: {
      ...(sourceEntry.snapshot.model_metadata || {}),
      recalibrated_from: sourceVersion,
      recalibrated_at: new Date().toISOString(),
    },
  };

  const entry = registerModelVersion({
    version: targetVersion,
    model,
    calibrationLayer,
    performanceMetrics: performanceMetrics || sourceEntry.performance_metrics || {},
    metadata: {
      ...(sourceEntry.metadata || {}),
      recalibrated_from: sourceVersion,
    },
    activate,
    createdBy,
    mode: 'recalibrated',
  });

  if (activate) {
    setActiveModelVersion({ version: targetVersion, reason: 'monthly_recalibration' });
  }

  recordMonitoringEvent({
    eventType: 'recalibration_job',
    modelVersion: targetVersion,
    payload: {
      source_version: sourceVersion,
      calibration_layer: calibrationLayer,
      activated: Boolean(activate),
    },
  });

  return {
    job: 'monthly_recalibration',
    source_version: sourceVersion,
    target_version: targetVersion,
    activated: Boolean(activate),
    entry,
  };
};

const runQuarterlyRetraining = async ({
  userId,
  symbol = '',
  start = null,
  end = null,
  limit = 5000,
  config = null,
  performanceMetrics = null,
  createdBy = 'quarterly_retraining_job',
  activate = false,
  setAsCandidate = true,
} = {}) => {
  if (!userId) {
    throw new Error('userId is required for quarterly retraining.');
  }

  const versions = listModelVersions().versions || [];
  const targetVersion = nextMajorVersion(versions);

  const { model, source_rows: sourceRows } = await buildModelFromMarketData({
    userId,
    symbol,
    start,
    end,
    limit,
    config,
  });

  const entry = registerModelVersion({
    version: targetVersion,
    model,
    calibrationLayer: {
      method: 'none',
      version: 'calibration_v0',
      params: {},
      updated_at: new Date().toISOString(),
    },
    performanceMetrics: performanceMetrics || {},
    metadata: {
      retrained_from_rows: sourceRows,
      symbol: String(symbol || '').trim().toUpperCase() || null,
    },
    activate,
    createdBy,
    mode: 'retrained',
  });

  let rollout = null;
  if (setAsCandidate) {
    rollout = setCandidateRolloutVersion({
      version: targetVersion,
      resetStage: true,
    });
  }

  recordMonitoringEvent({
    eventType: 'retraining_job',
    modelVersion: targetVersion,
    payload: {
      source_rows: sourceRows,
      activated: Boolean(activate),
      candidate_rollout: Boolean(setAsCandidate),
    },
  });

  return {
    job: 'quarterly_retraining',
    target_version: targetVersion,
    source_rows: sourceRows,
    activated: Boolean(activate),
    candidate_rollout_enabled: Boolean(setAsCandidate),
    entry,
    rollout,
  };
};

const runDriftMonitoringJob = ({
  referenceFeatureRows = [],
  currentFeatureRows = [],
  featureKeys = [],
  referencePredictions = [],
  currentPredictions = [],
  expectedProbabilities = [],
  actualOutcomes = [],
  baselineEce = null,
  baselineMatrix = {},
  currentMatrix = {},
  observedTransitions = [],
  healthMetrics = null,
  thresholds = null,
  autoRollback = true,
} = {}) => {
  const drift = detectDrift({
    referenceFeatureRows,
    currentFeatureRows,
    featureKeys,
    referencePredictions,
    currentPredictions,
    expectedProbabilities,
    actualOutcomes,
    baselineEce,
    thresholds: thresholds?.drift,
  });

  const stability = detectTransitionStability({
    baselineMatrix,
    currentMatrix,
    observedTransitions,
    thresholds: thresholds?.stability,
  });

  const rollback = autoRollback
    ? executeSafeRollback({
      reason: 'drift_monitoring_job',
      driftReport: drift,
      stabilityReport: stability,
      healthMetrics,
      thresholds: thresholds?.rollback,
    })
    : {
      rollback_executed: false,
      reasons: [],
      trigger: {
        rollback_required: false,
        reasons: [],
      },
    };

  recordMonitoringEvent({
    eventType: 'drift_monitoring_job',
    payload: {
      drift_alert: Boolean(drift?.alert),
      stability_unstable: Boolean(stability?.unstable),
      rollback_executed: Boolean(rollback?.rollback_executed),
      rollback_reasons: rollback?.trigger?.reasons || [],
    },
    errorRate: Number.isFinite(Number(healthMetrics?.error_rate))
      ? Number(healthMetrics.error_rate)
      : null,
  });

  return {
    job: 'drift_monitoring',
    generated_at: new Date().toISOString(),
    drift,
    stability,
    rollback,
  };
};

module.exports = {
  runMonthlyRecalibration,
  runQuarterlyRetraining,
  runDriftMonitoringJob,
};
