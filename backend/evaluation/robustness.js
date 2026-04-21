const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeArray = (value) => (Array.isArray(value) ? value : []);

const entropy = (distribution = {}) => {
  const values = Object.values(distribution)
    .map((value) => Math.max(0, toNumber(value, 0)))
    .filter((value) => value > 0);

  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 0 || values.length === 0) {
    return 0;
  }

  let total = 0;
  for (const value of values) {
    const p = value / sum;
    total += -p * Math.log2(Math.max(p, 1e-12));
  }

  return total;
};

const normalizedEntropy = (distribution = {}) => {
  const keys = Object.keys(distribution || {});
  if (keys.length <= 1) {
    return 0;
  }

  const h = entropy(distribution);
  const hMax = Math.log2(keys.length);
  if (hMax <= 0) {
    return 0;
  }

  return clamp(h / hMax, 0, 1);
};

const computePredictionVariance = ({
  expectedReturns = [],
  uncertainty = null,
  band = null,
} = {}) => {
  const series = safeArray(expectedReturns)
    .map((value) => toNumber(value, NaN))
    .filter((value) => Number.isFinite(value));

  if (series.length >= 2) {
    const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
    const variance = series.reduce((sum, value) => {
      const delta = value - mean;
      return sum + (delta * delta);
    }, 0) / series.length;

    return Number(Math.max(0, variance).toFixed(6));
  }

  if (Array.isArray(band) && band.length >= 2) {
    const left = toNumber(band[0], 0);
    const right = toNumber(band[1], 0);
    const width = Math.abs(right - left);
    return Number(((width * width) / 12).toFixed(6));
  }

  const unc = Math.max(0, toNumber(uncertainty, 0));
  return Number((unc * unc).toFixed(6));
};

const computeDecisionConsistency = ({ decisions = [] } = {}) => {
  const actions = safeArray(decisions)
    .map((item) => String(item?.action || '').trim().toUpperCase())
    .filter(Boolean);

  if (actions.length <= 1) {
    return 1;
  }

  let switches = 0;
  for (let index = 1; index < actions.length; index += 1) {
    if (actions[index] !== actions[index - 1]) {
      switches += 1;
    }
  }

  const consistency = 1 - (switches / Math.max(1, actions.length - 1));
  return Number(clamp(consistency, 0, 1).toFixed(6));
};

const computeConfidenceScore = ({
  distribution = {},
  uncertainty = 0,
  predictionVariance = 0,
  availableHistoryRows = 0,
  requiredHistoryRows = 60,
  uncertaintyThreshold = 0.08,
  varianceThreshold = 0.0025,
} = {}) => {
  const entropyNorm = normalizedEntropy(distribution);

  const uncertaintyScore = 1 - clamp(
    Math.max(0, toNumber(uncertainty, 0)) / Math.max(0.0001, toNumber(uncertaintyThreshold, 0.08)),
    0,
    1
  );
  const varianceScore = 1 - clamp(
    Math.max(0, toNumber(predictionVariance, 0)) / Math.max(0.000001, toNumber(varianceThreshold, 0.0025)),
    0,
    1
  );
  const entropyScore = 1 - entropyNorm;
  const dataScore = clamp(
    Math.max(0, toNumber(availableHistoryRows, 0)) / Math.max(1, toNumber(requiredHistoryRows, 60)),
    0,
    1
  );

  const score = (uncertaintyScore + varianceScore + entropyScore + dataScore) / 4;

  return {
    score: Number(clamp(score, 0, 1).toFixed(6)),
    diagnostics: {
      entropy_normalized: Number(entropyNorm.toFixed(6)),
      uncertainty_score: Number(uncertaintyScore.toFixed(6)),
      variance_score: Number(varianceScore.toFixed(6)),
      data_score: Number(dataScore.toFixed(6)),
      uncertainty: Number(Math.max(0, toNumber(uncertainty, 0)).toFixed(6)),
      prediction_variance: Number(Math.max(0, toNumber(predictionVariance, 0)).toFixed(6)),
    },
  };
};

const detectFailure = ({
  distribution = {},
  decisionSignal = {},
  queueFeatures = null,
  availableHistoryRows = 0,
  requiredHistoryRows = 60,
  uncertaintyThreshold = 0.08,
  varianceThreshold = 0.0025,
  lowConfidenceThreshold = 0.45,
} = {}) => {
  const reasons = [];

  const probs = Object.values(distribution || {})
    .map((value) => toNumber(value, NaN));
  const finite = probs.length > 0 && probs.every((value) => Number.isFinite(value));

  const sum = probs.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
  if (!finite || !Number.isFinite(sum) || Math.abs(sum - 1) > 0.02) {
    reasons.push('Abnormal probability output');
  }

  const maxProb = probs.length > 0 ? Math.max(...probs.map((value) => Math.max(0, value))) : 0;
  if (maxProb >= 0.999) {
    reasons.push('Extreme probabilities');
  }

  const transitionSpread = probs.length > 0
    ? Math.max(...probs.map((value) => Math.max(0, value))) - Math.min(...probs.map((value) => Math.max(0, value)))
    : 0;
  if (transitionSpread > 0.98 || transitionSpread < 0.001) {
    reasons.push('Unstable transitions');
  }

  const requiredQueueKeys = [
    'imbalance_pressure',
    'arrival_rate',
    'service_rate',
    'congestion',
    'spread_stress',
    'execution_delay',
  ];
  const missingQueue = !queueFeatures
    || requiredQueueKeys.some((key) => !Number.isFinite(toNumber(queueFeatures?.[key], NaN)));
  if (missingQueue) {
    reasons.push('Data unavailable');
  }

  const signalUncertainty = Math.max(0, toNumber(decisionSignal?.uncertainty, 0));
  const predictionVariance = computePredictionVariance({
    expectedReturns: [],
    uncertainty: signalUncertainty,
    band: decisionSignal?.band,
  });

  if (signalUncertainty > toNumber(uncertaintyThreshold, 0.08)) {
    reasons.push('Uncertainty above threshold');
  }
  if (Math.max(0, toNumber(availableHistoryRows, 0)) < Math.max(1, toNumber(requiredHistoryRows, 60))) {
    reasons.push('Insufficient data');
  }

  const confidence = computeConfidenceScore({
    distribution,
    uncertainty: signalUncertainty,
    predictionVariance,
    availableHistoryRows,
    requiredHistoryRows,
    uncertaintyThreshold,
    varianceThreshold,
  });

  const lowConfidence = confidence.score < toNumber(lowConfidenceThreshold, 0.45)
    || reasons.includes('Uncertainty above threshold')
    || reasons.includes('Insufficient data');

  if (lowConfidence) {
    reasons.push('Low confidence');
  }

  const stressSignal =
    toNumber(queueFeatures?.congestion, 0) >= 0.8
    || toNumber(queueFeatures?.spread_stress, 0) >= 0.8
    || toNumber(decisionSignal?.loss_prob, 0) >= 0.8;

  if (stressSignal) {
    reasons.push('Extreme stress');
  }

  return {
    failure: reasons.length > 0,
    low_confidence: lowConfidence,
    data_missing: missingQueue,
    extreme_stress: stressSignal,
    reasons: [...new Set(reasons)],
    confidence,
  };
};

const computeRobustnessMetrics = ({
  baseline = null,
  stressed = null,
} = {}) => {
  const base = baseline || {};
  const stress = stressed || {};

  const baselineSignal = base?.signal || {};
  const stressedSignal = stress?.signal || {};

  const varianceBaseline = computePredictionVariance({
    uncertainty: baselineSignal.uncertainty,
    band: baselineSignal.band,
  });
  const varianceStressed = computePredictionVariance({
    uncertainty: stressedSignal.uncertainty,
    band: stressedSignal.band,
  });

  const expectedReturnBaseline = toNumber(baselineSignal.expected_return, 0);
  const expectedReturnStressed = toNumber(stressedSignal.expected_return, 0);

  const confidenceBaseline = toNumber(base?.confidence?.score, 0);
  const confidenceStressed = toNumber(stress?.confidence?.score, 0);

  const actionSeries = safeArray(stress?.decision_series);
  const decisionConsistency = computeDecisionConsistency({ decisions: actionSeries });

  return {
    model_stability: {
      prediction_variance_baseline: varianceBaseline,
      prediction_variance_stressed: varianceStressed,
      variance_delta: Number((varianceStressed - varianceBaseline).toFixed(6)),
    },
    degradation: {
      expected_return_delta: Number((expectedReturnStressed - expectedReturnBaseline).toFixed(6)),
      confidence_delta: Number((confidenceStressed - confidenceBaseline).toFixed(6)),
      calibration_drift_proxy: Number(
        (Math.abs(toNumber(stressedSignal.loss_prob, 0) - toNumber(baselineSignal.loss_prob, 0))
        + Math.abs(toNumber(stressedSignal.gain_prob, 0) - toNumber(baselineSignal.gain_prob, 0))).toFixed(6)
      ),
    },
    decision_consistency: decisionConsistency,
  };
};

module.exports = {
  entropy,
  normalizedEntropy,
  computePredictionVariance,
  computeDecisionConsistency,
  computeConfidenceScore,
  detectFailure,
  computeRobustnessMetrics,
};
