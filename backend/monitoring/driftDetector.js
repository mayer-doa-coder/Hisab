const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const mean = (values = []) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const std = (values = []) => {
  if (values.length <= 1) {
    return 0;
  }
  const m = mean(values);
  const variance = values.reduce((sum, value) => {
    const delta = value - m;
    return sum + (delta * delta);
  }, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
};

const quantile = (values = [], q = 0.5) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const p = clamp(q, 0, 1);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const lowerWeight = upper - index;
  const upperWeight = index - lower;
  return (sorted[lower] * lowerWeight) + (sorted[upper] * upperWeight);
};

const distributionStats = (values = []) => {
  const numeric = safeArray(values)
    .map((value) => toNumber(value, NaN))
    .filter((value) => Number.isFinite(value));

  if (numeric.length === 0) {
    return {
      count: 0,
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      p10: 0,
      p50: 0,
      p90: 0,
    };
  }

  return {
    count: numeric.length,
    mean: Number(mean(numeric).toFixed(6)),
    std: Number(std(numeric).toFixed(6)),
    min: Number(Math.min(...numeric).toFixed(6)),
    max: Number(Math.max(...numeric).toFixed(6)),
    p10: Number(quantile(numeric, 0.1).toFixed(6)),
    p50: Number(quantile(numeric, 0.5).toFixed(6)),
    p90: Number(quantile(numeric, 0.9).toFixed(6)),
  };
};

const buildHistogram = (values = [], bins = 10) => {
  const numeric = safeArray(values)
    .map((value) => toNumber(value, NaN))
    .filter((value) => Number.isFinite(value));

  if (numeric.length === 0) {
    return {
      bins: new Array(Math.max(2, Math.trunc(toNumber(bins, 10)))).fill(0),
      min: 0,
      max: 1,
    };
  }

  const safeBins = Math.max(2, Math.trunc(toNumber(bins, 10)));
  const minValue = Math.min(...numeric);
  const maxValue = Math.max(...numeric);

  const range = Math.max(1e-9, maxValue - minValue);
  const output = new Array(safeBins).fill(0);

  for (const value of numeric) {
    const rawIndex = Math.floor(((value - minValue) / range) * safeBins);
    const index = Math.min(safeBins - 1, Math.max(0, rawIndex));
    output[index] += 1;
  }

  return {
    bins: output,
    min: minValue,
    max: maxValue,
  };
};

const populationStabilityIndex = ({ reference = [], current = [], bins = 10 } = {}) => {
  const refHist = buildHistogram(reference, bins);
  const curHist = buildHistogram(current, bins);

  const refTotal = Math.max(1, refHist.bins.reduce((sum, value) => sum + value, 0));
  const curTotal = Math.max(1, curHist.bins.reduce((sum, value) => sum + value, 0));

  let psi = 0;
  for (let index = 0; index < refHist.bins.length; index += 1) {
    const refPct = Math.max(1e-9, refHist.bins[index] / refTotal);
    const curPct = Math.max(1e-9, curHist.bins[index] / curTotal);
    psi += (curPct - refPct) * Math.log(curPct / refPct);
  }

  return Number(psi.toFixed(6));
};

const expectedCalibrationError = ({ expected = [], actual = [], bins = 10 } = {}) => {
  const size = Math.min(expected.length, actual.length);
  if (size === 0) {
    return null;
  }

  const safeBins = Math.max(2, Math.trunc(toNumber(bins, 10)));
  const bucket = new Array(safeBins).fill(null).map(() => ({
    count: 0,
    expectedSum: 0,
    actualSum: 0,
  }));

  for (let index = 0; index < size; index += 1) {
    const e = clamp(toNumber(expected[index], 0), 0, 1);
    const a = toNumber(actual[index], 0) > 0 ? 1 : 0;
    const slot = Math.min(safeBins - 1, Math.floor(e * safeBins));

    bucket[slot].count += 1;
    bucket[slot].expectedSum += e;
    bucket[slot].actualSum += a;
  }

  let ece = 0;
  for (const row of bucket) {
    if (row.count === 0) {
      continue;
    }

    const expectedMean = row.expectedSum / row.count;
    const actualMean = row.actualSum / row.count;
    ece += (row.count / size) * Math.abs(expectedMean - actualMean);
  }

  return Number(ece.toFixed(6));
};

const detectFeatureDrift = ({
  referenceRows = [],
  currentRows = [],
  featureKeys = [],
  thresholds = null,
} = {}) => {
  const keys = Array.isArray(featureKeys) && featureKeys.length > 0
    ? featureKeys
    : [
      'trend_pct',
      'momentum_pct',
      'volatility_ratio',
      'liquidity_stress_score',
      'queue_pressure',
      'spread_to_close_ratio',
      'volume_to_floor_ratio',
    ];

  const config = {
    psi_alert: 0.25,
    mean_shift_alert: 1.2,
    ...(thresholds || {}),
  };

  const byFeature = {};
  let alert = false;
  const alerts = [];

  for (const key of keys) {
    const referenceSeries = safeArray(referenceRows)
      .map((row) => toNumber(row?.[key], NaN))
      .filter((value) => Number.isFinite(value));
    const currentSeries = safeArray(currentRows)
      .map((row) => toNumber(row?.[key], NaN))
      .filter((value) => Number.isFinite(value));

    const referenceStats = distributionStats(referenceSeries);
    const currentStats = distributionStats(currentSeries);

    const psi = populationStabilityIndex({
      reference: referenceSeries,
      current: currentSeries,
      bins: 10,
    });

    const denom = Math.max(1e-9, Math.abs(referenceStats.std));
    const meanShiftStd = Math.abs(currentStats.mean - referenceStats.mean) / denom;

    const drift = psi >= toNumber(config.psi_alert, 0.25)
      || meanShiftStd >= toNumber(config.mean_shift_alert, 1.2);

    if (drift) {
      alert = true;
      alerts.push({ feature: key, psi, mean_shift_std: Number(meanShiftStd.toFixed(6)) });
    }

    byFeature[key] = {
      reference: referenceStats,
      current: currentStats,
      psi,
      mean_shift_std: Number(meanShiftStd.toFixed(6)),
      drift,
    };
  }

  return {
    alert,
    thresholds: config,
    by_feature: byFeature,
    alerts,
  };
};

const detectPredictionDrift = ({
  referenceProbabilities = [],
  currentProbabilities = [],
  thresholds = null,
} = {}) => {
  const config = {
    psi_alert: 0.2,
    mean_delta_alert: 0.08,
    ...(thresholds || {}),
  };

  const refStats = distributionStats(referenceProbabilities);
  const curStats = distributionStats(currentProbabilities);

  const psi = populationStabilityIndex({
    reference: referenceProbabilities,
    current: currentProbabilities,
    bins: 10,
  });
  const meanDelta = Math.abs(curStats.mean - refStats.mean);

  const alert = psi >= toNumber(config.psi_alert, 0.2)
    || meanDelta >= toNumber(config.mean_delta_alert, 0.08);

  return {
    alert,
    thresholds: config,
    psi,
    mean_delta: Number(meanDelta.toFixed(6)),
    reference: refStats,
    current: curStats,
  };
};

const detectCalibrationDrift = ({
  expectedProbabilities = [],
  actualOutcomes = [],
  baselineEce = null,
  thresholds = null,
} = {}) => {
  const config = {
    ece_increase_alert: 0.03,
    ece_absolute_alert: 0.12,
    ...(thresholds || {}),
  };

  const ece = expectedCalibrationError({
    expected: expectedProbabilities,
    actual: actualOutcomes,
    bins: 10,
  });

  const increase = ece !== null && Number.isFinite(toNumber(baselineEce, NaN))
    ? ece - toNumber(baselineEce, 0)
    : null;

  const alert = ece !== null && (
    ece >= toNumber(config.ece_absolute_alert, 0.12)
    || (increase !== null && increase >= toNumber(config.ece_increase_alert, 0.03))
  );

  return {
    alert,
    thresholds: config,
    ece,
    ece_increase: increase === null ? null : Number(increase.toFixed(6)),
    baseline_ece: Number.isFinite(toNumber(baselineEce, NaN)) ? Number(toNumber(baselineEce, 0).toFixed(6)) : null,
  };
};

const detectDrift = ({
  referenceFeatureRows = [],
  currentFeatureRows = [],
  featureKeys = [],
  referencePredictions = [],
  currentPredictions = [],
  expectedProbabilities = [],
  actualOutcomes = [],
  baselineEce = null,
  thresholds = null,
} = {}) => {
  const featureDrift = detectFeatureDrift({
    referenceRows: referenceFeatureRows,
    currentRows: currentFeatureRows,
    featureKeys,
    thresholds: thresholds?.feature,
  });

  const predictionDrift = detectPredictionDrift({
    referenceProbabilities: referencePredictions,
    currentProbabilities: currentPredictions,
    thresholds: thresholds?.prediction,
  });

  const calibrationDrift = detectCalibrationDrift({
    expectedProbabilities,
    actualOutcomes,
    baselineEce,
    thresholds: thresholds?.calibration,
  });

  const alert = featureDrift.alert || predictionDrift.alert || calibrationDrift.alert;

  return {
    drift_version: 'drift_detector_v1',
    generated_at: new Date().toISOString(),
    alert,
    feature_drift: featureDrift,
    prediction_drift: predictionDrift,
    calibration_drift: calibrationDrift,
  };
};

module.exports = {
  distributionStats,
  populationStabilityIndex,
  expectedCalibrationError,
  detectFeatureDrift,
  detectPredictionDrift,
  detectCalibrationDrift,
  detectDrift,
};
