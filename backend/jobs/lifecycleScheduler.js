const { getActiveVersionEntry, recordMonitoringEvent } = require('../registry/modelRegistry');
const {
  runMonthlyRecalibration,
  runQuarterlyRetraining,
  runDriftMonitoringJob,
} = require('./recalibrationJob');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toMs = (minutes, fallbackMinutes) => {
  const safeMinutes = Math.max(1, Math.trunc(toNumber(minutes, fallbackMinutes)));
  return safeMinutes * 60 * 1000;
};

// Node's setInterval stores the delay in a 32-bit signed integer (max ~24.8 days).
// Values larger than that overflow to 1ms, causing runaway firing.
// This wrapper uses an hourly tick for any interval that exceeds the limit.
const MAX_INTERVAL_MS = 2_147_483_647;
const SAFE_TICK_MS    = 60 * 60 * 1_000; // 1 hour

const safeSetInterval = (fn, intervalMs) => {
  if (intervalMs <= MAX_INTERVAL_MS) {
    return setInterval(fn, intervalMs);
  }
  let nextRun = Date.now() + intervalMs;
  return setInterval(() => {
    if (Date.now() >= nextRun) {
      nextRun = Date.now() + intervalMs;
      fn();
    }
  }, SAFE_TICK_MS);
};

const createSkipLogger = ({ logger = console } = {}) => {
  const cache = new Map();

  return {
    infoOnce(key, message) {
      const previous = cache.get(key);
      if (previous === message) {
        return;
      }
      cache.set(key, message);
      logger.info(message);
    },
    clear(key) {
      cache.delete(key);
    },
  };
};

const startLifecycleScheduler = ({ logger = console } = {}) => {
  const enabled = String(process.env.MARKOV_LIFECYCLE_SCHEDULER_ENABLED || 'true').trim().toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'off') {
    logger.info('[LIFECYCLE] Scheduler disabled via env MARKOV_LIFECYCLE_SCHEDULER_ENABLED.');
    return () => {};
  }

  const monthlyIntervalMs = toMs(process.env.MARKOV_RECALIBRATION_INTERVAL_MINUTES, 60 * 24 * 30);
  const quarterlyIntervalMs = toMs(process.env.MARKOV_RETRAINING_INTERVAL_MINUTES, 60 * 24 * 90);
  const driftIntervalMs = toMs(process.env.MARKOV_DRIFT_MONITOR_INTERVAL_MINUTES, 60 * 24);

  const retrainUserId = String(process.env.MARKOV_RETRAIN_USER_ID || '').trim() || null;
  const retrainSymbol = String(process.env.MARKOV_RETRAIN_SYMBOL || '').trim().toUpperCase() || '';

  const handles = [];
  const skipLogger = createSkipLogger({ logger });

  const wrap = (name, fn) => async () => {
    try {
      await fn();
    } catch (error) {
      logger.error(`[LIFECYCLE] ${name} failed: ${error?.message || error}`);
      recordMonitoringEvent({
        eventType: 'scheduler_error',
        endpoint: name,
        errorRate: 1,
        payload: {
          message: error?.message || String(error),
        },
      });
    }
  };

  const runMonthly = wrap('monthly_recalibration', async () => {
    const active = getActiveVersionEntry();
    if (!active?.version) {
      skipLogger.infoOnce('monthly_no_active_model', '[LIFECYCLE] Monthly recalibration skipped: no active model version.');
      return;
    }
    skipLogger.clear('monthly_no_active_model');

    const result = runMonthlyRecalibration({
      baseVersion: active.version,
      expectedProbabilities: [],
      actualOutcomes: [],
      activate: true,
      createdBy: 'scheduler:monthly_recalibration',
    });

    logger.info(`[LIFECYCLE] Monthly recalibration complete: ${result?.target_version || 'unknown'}`);
  });

  const runQuarterly = wrap('quarterly_retraining', async () => {
    if (!retrainUserId) {
      skipLogger.infoOnce('quarterly_missing_retrain_user', '[LIFECYCLE] Quarterly retraining disabled: MARKOV_RETRAIN_USER_ID missing.');
      return;
    }
    skipLogger.clear('quarterly_missing_retrain_user');

    const result = await runQuarterlyRetraining({
      userId: retrainUserId,
      symbol: retrainSymbol,
      activate: false,
      setAsCandidate: true,
      createdBy: 'scheduler:quarterly_retraining',
    });

    logger.info(`[LIFECYCLE] Quarterly retraining complete: ${result?.target_version || 'unknown'}`);
  });

  const runDrift = wrap('drift_monitoring', async () => {
    const active = getActiveVersionEntry();
    const baselineMatrix = active?.snapshot?.transition_matrices?.global || {};

    const result = runDriftMonitoringJob({
      referenceFeatureRows: [],
      currentFeatureRows: [],
      referencePredictions: [],
      currentPredictions: [],
      expectedProbabilities: [],
      actualOutcomes: [],
      baselineMatrix,
      currentMatrix: baselineMatrix,
      observedTransitions: [],
      healthMetrics: {
        error_rate: 0,
      },
      autoRollback: true,
    });

    logger.info(`[LIFECYCLE] Drift monitoring run complete. rollback=${Boolean(result?.rollback?.rollback_executed)}`);
  });

  const monthlyHandle = safeSetInterval(() => {
    runMonthly();
  }, monthlyIntervalMs);
  const driftHandle = safeSetInterval(() => {
    runDrift();
  }, driftIntervalMs);

  let quarterlyHandle = null;
  if (retrainUserId) {
    quarterlyHandle = safeSetInterval(() => {
      runQuarterly();
    }, quarterlyIntervalMs);
  } else {
    skipLogger.infoOnce(
      'quarterly_schedule_disabled_missing_user',
      '[LIFECYCLE] Quarterly retraining scheduler not started: set MARKOV_RETRAIN_USER_ID to enable.'
    );
  }

  handles.push(monthlyHandle, driftHandle);
  if (quarterlyHandle) {
    handles.push(quarterlyHandle);
  }

  runDrift();

  logger.info('[LIFECYCLE] Scheduler started for recalibration, retraining, and drift monitoring.');

  return () => {
    for (const handle of handles) {
      clearInterval(handle);
    }
    logger.info('[LIFECYCLE] Scheduler stopped.');
  };
};

module.exports = {
  startLifecycleScheduler,
};
