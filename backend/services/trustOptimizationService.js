const { spawnSync } = require('child_process');
const path = require('path');
const { writeMonitoringSnapshot, loadMonitoringSnapshot } = require('./trustMonitoringArtifactService');

const { PATHS, readJson, writeJson, nowIso } = require('../scripts/trust/trustOptimizationUtils');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const buildTrustOptimizationConfig = () => ({
  enabled: String(process.env.TRUST_OPTIMIZATION_ENABLED || 'true').toLowerCase() !== 'false',
  checkIntervalMinutes: parsePositiveInt(process.env.TRUST_OPTIMIZATION_CHECK_INTERVAL_MINUTES, 60),
  monthlyRecalibrationDays: parsePositiveInt(process.env.TRUST_MONTHLY_RECALIBRATION_DAYS, 30),
  quarterlyRetrainDays: parsePositiveInt(process.env.TRUST_QUARTERLY_RETRAIN_DAYS, 90),
  monitoringSnapshotPath: process.env.TRUST_MONITORING_SNAPSHOT_PATH || '',
  datasetPath: process.env.TRUST_OPTIMIZATION_DATASET_PATH || '',
});

const dayDiff = (fromIso, toIso) => {
  if (!fromIso || !toIso) {
    return Number.POSITIVE_INFINITY;
  }

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
};

const runNodeScript = ({ scriptPath, args = [], logger, label }) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    logger.error(`[${label}] failed`, {
      scriptPath,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  logger.log(`[${label}] completed`, {
    scriptPath,
    stdout: result.stdout || '',
  });
  return {
    ok: true,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const loadState = () => {
  return readJson(PATHS.optimizationState, {
    version: '1.0.0',
    created_at: nowIso(),
    last_check_at: null,
    last_monthly_recalibration_at: null,
    last_quarterly_retraining_at: null,
    last_emergency_check_at: null,
  });
};

const saveState = (state) => {
  writeJson(PATHS.optimizationState, {
    ...state,
    updated_at: nowIso(),
  });
};

const runTrustOptimizationCheck = ({ logger = console } = {}) => {
  const config = buildTrustOptimizationConfig();
  const state = loadState();
  const now = nowIso();

  const summary = {
    checked_at: now,
    config,
    emergency: null,
    monthly: null,
    quarterly: null,
  };

  const emergencyScript = path.resolve(__dirname, '..', 'scripts', 'trust', 'runEmergencyTrustUpdate.js');
  const monthlyScript = path.resolve(__dirname, '..', 'scripts', 'trust', 'runMonthlyTrustRecalibration.js');
  const quarterlyScript = path.resolve(__dirname, '..', 'scripts', 'trust', 'runQuarterlyTrustRetraining.js');

  if (config.monitoringSnapshotPath) {
    const externalSnapshot = loadMonitoringSnapshot({ inputPath: path.resolve(config.monitoringSnapshotPath) });
    if (externalSnapshot) {
      const ingestResult = writeMonitoringSnapshot({
        snapshot: externalSnapshot,
        source: 'optimization_scheduler_source_path',
      });
      summary.monitoring_ingestion = {
        ingested: true,
        output_path: ingestResult.output_path,
        generated_at: ingestResult.snapshot.generated_at,
        request_count: ingestResult.snapshot.request_count,
      };
    } else {
      summary.monitoring_ingestion = {
        ingested: false,
        reason: 'external_monitoring_snapshot_missing_or_invalid',
      };
    }
  } else {
    summary.monitoring_ingestion = {
      ingested: false,
      reason: 'no_external_monitoring_snapshot_path_configured',
    };
  }

  const emergencyArgs = [];
  emergencyArgs.push('--monitoring', PATHS.monitoringSnapshot);
  if (config.datasetPath) {
    emergencyArgs.push('--dataset', config.datasetPath);
  }

  summary.emergency = runNodeScript({
    scriptPath: emergencyScript,
    args: emergencyArgs,
    logger,
    label: 'TRUST_OPTIMIZATION_EMERGENCY_CHECK',
  });
  state.last_emergency_check_at = now;

  const daysSinceMonthly = dayDiff(state.last_monthly_recalibration_at, now);
  if (daysSinceMonthly >= config.monthlyRecalibrationDays) {
    const monthlyArgs = [];
    if (config.datasetPath) {
      monthlyArgs.push(config.datasetPath);
    }

    summary.monthly = runNodeScript({
      scriptPath: monthlyScript,
      args: monthlyArgs,
      logger,
      label: 'TRUST_OPTIMIZATION_MONTHLY_RECALIBRATION',
    });

    if (summary.monthly.ok) {
      state.last_monthly_recalibration_at = now;
    }
  } else {
    summary.monthly = {
      ok: true,
      skipped: true,
      reason: `monthly_not_due_days_since_last=${Number(daysSinceMonthly.toFixed(2))}`,
    };
  }

  const daysSinceQuarterly = dayDiff(state.last_quarterly_retraining_at, now);
  if (daysSinceQuarterly >= config.quarterlyRetrainDays) {
    const quarterlyArgs = [];
    if (config.datasetPath) {
      quarterlyArgs.push(config.datasetPath);
    }

    summary.quarterly = runNodeScript({
      scriptPath: quarterlyScript,
      args: quarterlyArgs,
      logger,
      label: 'TRUST_OPTIMIZATION_QUARTERLY_RETRAINING',
    });

    if (summary.quarterly.ok) {
      state.last_quarterly_retraining_at = now;
    }
  } else {
    summary.quarterly = {
      ok: true,
      skipped: true,
      reason: `quarterly_not_due_days_since_last=${Number(daysSinceQuarterly.toFixed(2))}`,
    };
  }

  state.last_check_at = now;
  saveState(state);

  return summary;
};

const startTrustOptimizationScheduler = ({ logger = console } = {}) => {
  const config = buildTrustOptimizationConfig();
  if (!config.enabled) {
    logger.log('[TRUST_OPTIMIZATION] scheduler disabled by config');
    return () => {};
  }

  const intervalMs = config.checkIntervalMinutes * 60 * 1000;

  const runAndLog = () => {
    try {
      const summary = runTrustOptimizationCheck({ logger });
      logger.log('[TRUST_OPTIMIZATION] check complete', summary);
    } catch (error) {
      logger.error(`[TRUST_OPTIMIZATION] check failed: ${error?.message || error}`);
    }
  };

  runAndLog();
  const timer = setInterval(runAndLog, intervalMs);

  return () => {
    clearInterval(timer);
  };
};

module.exports = {
  buildTrustOptimizationConfig,
  runTrustOptimizationCheck,
  startTrustOptimizationScheduler,
};
