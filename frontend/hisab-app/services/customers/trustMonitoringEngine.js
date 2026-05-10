const DEFAULT_GUARDRAILS = Object.freeze({
  fallback_rate_max: 0.3,
  error_rate_max: 0.02,
  latency_ms_p95_max: 250,
  brier_degradation_max: 0.02,
  calibration_shift_max: 0.05,
  feature_mean_shift_max: 0.35,
  feature_variance_shift_max: 0.5,
  prediction_drift_psi_max: 0.25,
  min_samples_for_guardrails: 40,
  min_labeled_samples: 20,
});

const DEFAULT_METRIC_OPTIONS = Object.freeze({
  driftBinCount: 10,
  maxRequestsTracked: 4000,
  maxAlertsTracked: 200,
});

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const asBoolean = (value) => value === true;

const mean = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const variance = (values) => {
  if (!Array.isArray(values) || values.length <= 1) {
    return 0;
  }

  const avg = mean(values);
  return values.reduce((sum, value) => {
    const diff = value - avg;
    return sum + (diff * diff);
  }, 0) / values.length;
};

const percentile = (values, q) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[index];
};

const brierScore = (labels, probs) => {
  if (!Array.isArray(labels) || !Array.isArray(probs) || labels.length === 0 || labels.length !== probs.length) {
    return null;
  }

  const total = labels.reduce((sum, label, index) => {
    const y = toFinite(label, 0) >= 0.5 ? 1 : 0;
    const p = clamp(toFinite(probs[index], 0), 0, 1);
    const diff = p - y;
    return sum + (diff * diff);
  }, 0);

  return total / labels.length;
};

const calibrationShift = (labels, probs) => {
  if (!Array.isArray(labels) || !Array.isArray(probs) || labels.length === 0 || labels.length !== probs.length) {
    return null;
  }

  const avgPred = mean(probs.map((value) => clamp(toFinite(value, 0), 0, 1)));
  const avgActual = mean(labels.map((value) => (toFinite(value, 0) >= 0.5 ? 1 : 0)));
  return Math.abs(avgPred - avgActual);
};

const aucPrApprox = (labels, probs) => {
  if (!Array.isArray(labels) || !Array.isArray(probs) || labels.length === 0 || labels.length !== probs.length) {
    return null;
  }

  const pairs = labels.map((label, index) => ({
    label: toFinite(label, 0) >= 0.5 ? 1 : 0,
    prob: clamp(toFinite(probs[index], 0), 0, 1),
  })).sort((a, b) => b.prob - a.prob);

  const positives = pairs.reduce((sum, item) => sum + item.label, 0);
  if (positives === 0) {
    return null;
  }

  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let area = 0;

  for (const pair of pairs) {
    if (pair.label === 1) {
      tp += 1;
    } else {
      fp += 1;
    }

    const recall = tp / positives;
    const precision = tp / Math.max(1, tp + fp);
    area += (recall - prevRecall) * precision;
    prevRecall = recall;
  }

  return area;
};

const recallAtPrecision = (labels, probs, minPrecision = 0.9) => {
  if (!Array.isArray(labels) || !Array.isArray(probs) || labels.length === 0 || labels.length !== probs.length) {
    return null;
  }

  const pairs = labels.map((label, index) => ({
    label: toFinite(label, 0) >= 0.5 ? 1 : 0,
    prob: clamp(toFinite(probs[index], 0), 0, 1),
  })).sort((a, b) => b.prob - a.prob);

  const positives = pairs.reduce((sum, item) => sum + item.label, 0);
  if (positives === 0) {
    return null;
  }

  let tp = 0;
  let fp = 0;
  let bestRecall = 0;

  for (const pair of pairs) {
    if (pair.label === 1) {
      tp += 1;
    } else {
      fp += 1;
    }

    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / positives;
    if (precision >= minPrecision && recall > bestRecall) {
      bestRecall = recall;
    }
  }

  return bestRecall;
};

const buildHistogram = (values, binCount) => {
  if (!Array.isArray(values) || values.length === 0) {
    return new Array(binCount).fill(0);
  }

  const bins = new Array(binCount).fill(0);
  for (const value of values) {
    const normalized = clamp(toFinite(value, 0), 0, 1);
    const index = Math.min(binCount - 1, Math.floor(normalized * binCount));
    bins[index] += 1;
  }

  const total = values.length;
  return bins.map((count) => count / total);
};

const psi = (expectedDistribution, actualDistribution) => {
  const epsilon = 1e-6;
  const size = Math.min(expectedDistribution.length, actualDistribution.length);
  let score = 0;

  for (let index = 0; index < size; index += 1) {
    const expected = Math.max(epsilon, toFinite(expectedDistribution[index], 0));
    const actual = Math.max(epsilon, toFinite(actualDistribution[index], 0));
    score += (actual - expected) * Math.log(actual / expected);
  }

  return score;
};

const computeFeatureDrift = (records, baselineStats) => {
  const observedKeys = new Set();
  for (const record of records) {
    const featureVector = record?.featureVector || {};
    for (const key of Object.keys(featureVector)) {
      observedKeys.add(key);
    }
  }

  const keys = [...new Set([...Object.keys(baselineStats || {}), ...observedKeys])];
  const drift = {};

  for (const key of keys) {
    const baseline = baselineStats[key] || {};
    const values = records
      .map((entry) => toFinite(entry?.featureVector?.[key], Number.NaN))
      .filter((value) => Number.isFinite(value));

    if (!values.length) {
      drift[key] = {
        mean_shift: 0,
        variance_shift: 0,
        sample_count: 0,
      };
      continue;
    }

    const currentMean = mean(values);
    const currentVar = variance(values);
    const baselineMean = toFinite(baseline.mean, currentMean);
    const baselineVar = Math.max(1e-6, toFinite(baseline.variance, currentVar || 1));

    const meanShift = Math.abs(currentMean - baselineMean) / Math.max(1, Math.abs(baselineMean));
    const varianceShift = Math.abs(currentVar - baselineVar) / Math.max(1e-6, baselineVar);

    drift[key] = {
      mean_shift: meanShift,
      variance_shift: varianceShift,
      sample_count: values.length,
    };
  }

  return drift;
};

const segmentOf = (record) => {
  const segment = typeof record?.segmentKey === 'string' ? record.segmentKey.trim().toLowerCase() : '';
  return segment || 'unknown';
};

const toReason = (type, threshold, actual) => `${type} breached (threshold=${threshold}, actual=${actual})`;

export const createTrustMonitoringEngine = ({
  rolloutController,
  logger = console.warn,
  guardrails = {},
  baseline = {},
  metricOptions = {},
} = {}) => {
  const cfg = {
    ...DEFAULT_GUARDRAILS,
    ...(guardrails || {}),
  };
  const opts = {
    ...DEFAULT_METRIC_OPTIONS,
    ...(metricOptions || {}),
  };

  const baselineState = {
    performance: {
      ...(baseline?.performance || {}),
    },
    prediction_histogram: Array.isArray(baseline?.prediction_histogram)
      ? [...baseline.prediction_histogram]
      : null,
    feature_stats: {
      ...(baseline?.feature_stats || {}),
    },
  };

  const requests = [];
  const alerts = [];

  const emitAlert = (alert) => {
    alerts.push(alert);
    while (alerts.length > opts.maxAlertsTracked) {
      alerts.shift();
    }

    logger('[TRUST_GUARDRAIL]', JSON.stringify(alert));
    return alert;
  };

  const evaluateGuardrails = (snapshot) => {
    const triggered = [];
    const nowIso = new Date().toISOString();
    const minSamples = Math.max(1, Math.trunc(toFinite(cfg.min_samples_for_guardrails, 40)));

    if (snapshot.request_count < minSamples) {
      return triggered;
    }

    if (snapshot.fallback_rate > cfg.fallback_rate_max) {
      triggered.push({
        scope: 'global',
        metric: 'fallback_rate',
        reason: toReason('fallback_rate', cfg.fallback_rate_max, snapshot.fallback_rate),
      });
    }

    if (snapshot.error_rate > cfg.error_rate_max) {
      triggered.push({
        scope: 'global',
        metric: 'error_rate',
        reason: toReason('error_rate', cfg.error_rate_max, snapshot.error_rate),
      });
    }

    if (snapshot.latency_ms_p95 > cfg.latency_ms_p95_max) {
      triggered.push({
        scope: 'global',
        metric: 'latency_ms_p95',
        reason: toReason('latency_ms_p95', cfg.latency_ms_p95_max, snapshot.latency_ms_p95),
      });
    }

    if (
      snapshot.metrics.brier_score !== null
      && baselineState.performance?.brier_score !== null
      && baselineState.performance?.brier_score !== undefined
    ) {
      const brierDeg = snapshot.metrics.brier_score - toFinite(baselineState.performance.brier_score, snapshot.metrics.brier_score);
      if (brierDeg > cfg.brier_degradation_max) {
        triggered.push({
          scope: 'global',
          metric: 'brier_degradation',
          reason: toReason('brier_degradation', cfg.brier_degradation_max, brierDeg),
        });
      }
    }

    if (snapshot.metrics.calibration_shift !== null && snapshot.metrics.calibration_shift > cfg.calibration_shift_max) {
      triggered.push({
        scope: 'global',
        metric: 'calibration_shift',
        reason: toReason('calibration_shift', cfg.calibration_shift_max, snapshot.metrics.calibration_shift),
      });
    }

    if (snapshot.prediction_drift_psi > cfg.prediction_drift_psi_max) {
      triggered.push({
        scope: 'global',
        metric: 'prediction_drift_psi',
        reason: toReason('prediction_drift_psi', cfg.prediction_drift_psi_max, snapshot.prediction_drift_psi),
      });
    }

    const segments = Object.entries(snapshot.segment_summary || {});
    for (const [segmentKey, segmentData] of segments) {
      if (segmentData.request_count < minSamples) {
        continue;
      }

      if (segmentData.error_rate > cfg.error_rate_max) {
        triggered.push({
          scope: 'segment',
          segmentKey,
          metric: 'error_rate',
          reason: toReason('segment_error_rate', cfg.error_rate_max, segmentData.error_rate),
        });
      }

      if (segmentData.fallback_rate > cfg.fallback_rate_max) {
        triggered.push({
          scope: 'segment',
          segmentKey,
          metric: 'fallback_rate',
          reason: toReason('segment_fallback_rate', cfg.fallback_rate_max, segmentData.fallback_rate),
        });
      }
    }

    const featureDriftEntries = Object.entries(snapshot.feature_drift || {});
    for (const [featureKey, drift] of featureDriftEntries) {
      if (drift.mean_shift > cfg.feature_mean_shift_max || drift.variance_shift > cfg.feature_variance_shift_max) {
        triggered.push({
          scope: 'global',
          metric: 'feature_drift',
          reason: `feature_drift breached for ${featureKey} (mean_shift=${drift.mean_shift}, variance_shift=${drift.variance_shift})`,
        });
      }
    }

    for (const item of triggered) {
      const alert = {
        timestamp: nowIso,
        ...item,
        snapshot_version: snapshot.snapshot_version,
      };

      emitAlert(alert);

      if (!rolloutController) {
        continue;
      }

      if (item.scope === 'segment' && item.segmentKey) {
        rolloutController.disableSegment({
          segmentKey: item.segmentKey,
          reason: item.reason,
          metadata: { metric: item.metric, snapshot_version: snapshot.snapshot_version },
        });
      } else {
        rolloutController.disableNewScoring({
          reason: item.reason,
          metadata: { metric: item.metric, snapshot_version: snapshot.snapshot_version },
        });
      }
    }

    return triggered;
  };

  const recordRequest = (entry = {}) => {
    const record = {
      timestamp: entry.timestamp || new Date().toISOString(),
      userId: entry.userId ?? null,
      segmentKey: entry.segmentKey || 'unknown',
      selectedModel: entry.selectedModel || 'unknown',
      selectedMethod: entry.selectedMethod || 'unknown',
      confidence: entry.confidence === null || entry.confidence === undefined ? null : clamp(toFinite(entry.confidence, 0), 0, 1),
      probability: entry.probability === null || entry.probability === undefined ? null : clamp(toFinite(entry.probability, 0), 0, 1),
      latencyMs: Math.max(0, toFinite(entry.latencyMs, 0)),
      usedFallback: asBoolean(entry.usedFallback),
      isError: asBoolean(entry.isError),
      actualOutcome: entry.actualOutcome === null || entry.actualOutcome === undefined
        ? null
        : (toFinite(entry.actualOutcome, 0) >= 0.5 ? 1 : 0),
      featureVector: entry.featureVector && typeof entry.featureVector === 'object' ? { ...entry.featureVector } : {},
      rolloutPercentage: clamp(toFinite(entry.rolloutPercentage, 0), 0, 100),
      rolloutStage: entry.rolloutStage || 'unknown',
      enableNewScoring: asBoolean(entry.enableNewScoring),
    };

    requests.push(record);
    while (requests.length > opts.maxRequestsTracked) {
      requests.shift();
    }

    return record;
  };

  let snapshotVersion = 0;

  const computeSnapshot = () => {
    snapshotVersion += 1;

    const count = requests.length;
    const fallbackCount = requests.filter((entry) => entry.usedFallback).length;
    const errorCount = requests.filter((entry) => entry.isError).length;
    const latencyValues = requests.map((entry) => entry.latencyMs);
    const probabilities = requests
      .map((entry) => entry.probability)
      .filter((value) => value !== null);
    const labeledRows = requests.filter((entry) => entry.actualOutcome !== null && entry.probability !== null);
    const labels = labeledRows.map((entry) => entry.actualOutcome);
    const probs = labeledRows.map((entry) => entry.probability);

    const aucPr = labels.length >= cfg.min_labeled_samples ? aucPrApprox(labels, probs) : null;
    const recallP90 = labels.length >= cfg.min_labeled_samples ? recallAtPrecision(labels, probs, 0.9) : null;
    const brier = labels.length >= cfg.min_labeled_samples ? brierScore(labels, probs) : null;
    const calShift = labels.length >= cfg.min_labeled_samples ? calibrationShift(labels, probs) : null;

    const histogramActual = buildHistogram(probabilities, opts.driftBinCount);
    if (!Array.isArray(baselineState.prediction_histogram) && histogramActual.length) {
      baselineState.prediction_histogram = [...histogramActual];
    }

    const baselineHistogram = Array.isArray(baselineState.prediction_histogram)
      ? baselineState.prediction_histogram
      : new Array(opts.driftBinCount).fill(1 / opts.driftBinCount);

    const predictionDriftPsi = psi(baselineHistogram, histogramActual);

    const baselineBrier = baselineState.performance?.brier_score;
    const brierDegradation = (
      brier !== null
      && baselineBrier !== null
      && baselineBrier !== undefined
    )
      ? (brier - toFinite(baselineBrier, brier))
      : null;

    const featureDrift = computeFeatureDrift(requests, baselineState.feature_stats || {});
    for (const [featureKey, driftStats] of Object.entries(featureDrift)) {
      if (!baselineState.feature_stats[featureKey] && driftStats.sample_count > 0) {
        const values = requests
          .map((entry) => toFinite(entry?.featureVector?.[featureKey], Number.NaN))
          .filter((value) => Number.isFinite(value));
        if (values.length > 0) {
          baselineState.feature_stats[featureKey] = {
            mean: mean(values),
            variance: variance(values),
          };
          featureDrift[featureKey] = {
            mean_shift: 0,
            variance_shift: 0,
            sample_count: values.length,
          };
        }
      }
    }

    if (
      baselineState.performance?.brier_score === undefined
      && brier !== null
      && labeledRows.length >= cfg.min_labeled_samples
    ) {
      baselineState.performance.brier_score = brier;
    }

    const segmentSummary = {};
    for (const row of requests) {
      const segment = segmentOf(row);
      if (!segmentSummary[segment]) {
        segmentSummary[segment] = {
          request_count: 0,
          fallback_count: 0,
          error_count: 0,
        };
      }

      const segmentBucket = segmentSummary[segment];
      segmentBucket.request_count += 1;
      segmentBucket.fallback_count += row.usedFallback ? 1 : 0;
      segmentBucket.error_count += row.isError ? 1 : 0;
    }

    for (const segmentKey of Object.keys(segmentSummary)) {
      const segmentData = segmentSummary[segmentKey];
      segmentData.fallback_rate = segmentData.request_count > 0
        ? segmentData.fallback_count / segmentData.request_count
        : 0;
      segmentData.error_rate = segmentData.request_count > 0
        ? segmentData.error_count / segmentData.request_count
        : 0;
    }

    const snapshot = {
      snapshot_version: snapshotVersion,
      generated_at: new Date().toISOString(),
      request_count: count,
      fallback_rate: count > 0 ? fallbackCount / count : 0,
      error_rate: count > 0 ? errorCount / count : 0,
      latency_ms_p95: percentile(latencyValues, 0.95),
      rollout_observed_percentage: count > 0
        ? mean(requests.map((entry) => entry.enableNewScoring ? 1 : 0)) * 100
        : 0,
      metrics: {
        auc_pr: aucPr,
        recall_at_precision_90: recallP90,
        brier_score: brier,
        brier_degradation: brierDegradation,
        calibration_shift: calShift,
      },
      feature_drift: featureDrift,
      prediction_drift_psi: predictionDriftPsi,
      prediction_histogram: histogramActual,
      segment_summary: segmentSummary,
      alerts_recent: [...alerts],
    };

    const triggered = evaluateGuardrails(snapshot);
    return {
      ...snapshot,
      triggered_guardrails: triggered,
    };
  };

  const getRecentRequests = () => [...requests];
  const getRecentAlerts = () => [...alerts];

  const updateBaseline = (patch = {}) => {
    baselineState.performance = {
      ...(baselineState.performance || {}),
      ...(patch?.performance || {}),
    };

    if (Array.isArray(patch?.prediction_histogram)) {
      baselineState.prediction_histogram = [...patch.prediction_histogram];
    }

    baselineState.feature_stats = {
      ...(baselineState.feature_stats || {}),
      ...(patch?.feature_stats || {}),
    };

    return {
      performance: { ...(baselineState.performance || {}) },
      prediction_histogram: Array.isArray(baselineState.prediction_histogram)
        ? [...baselineState.prediction_histogram]
        : null,
      feature_stats: { ...(baselineState.feature_stats || {}) },
    };
  };

  const getBaseline = () => ({
    performance: { ...(baselineState.performance || {}) },
    prediction_histogram: Array.isArray(baselineState.prediction_histogram)
      ? [...baselineState.prediction_histogram]
      : null,
    feature_stats: { ...(baselineState.feature_stats || {}) },
  });

  const reset = () => {
    requests.length = 0;
    alerts.length = 0;
    snapshotVersion = 0;
  };

  return {
    config: { ...cfg },
    recordRequest,
    computeSnapshot,
    getRecentRequests,
    getRecentAlerts,
    updateBaseline,
    getBaseline,
    reset,
  };
};
