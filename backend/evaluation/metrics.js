const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeProbability = (value) => clamp(toNumber(value, 0), 0, 1);

const computeAucPr = ({ labels = [], scores = [] } = {}) => {
  const size = Math.min(labels.length, scores.length);
  if (size === 0) {
    return null;
  }

  const pairs = [];
  for (let index = 0; index < size; index += 1) {
    pairs.push({
      label: Number(labels[index]) > 0 ? 1 : 0,
      score: sanitizeProbability(scores[index]),
    });
  }

  const positives = pairs.reduce((sum, item) => sum + item.label, 0);
  if (positives === 0) {
    return null;
  }

  pairs.sort((left, right) => right.score - left.score);

  let tp = 0;
  let fp = 0;
  let previousRecall = 0;
  let aucPr = 0;

  for (const pair of pairs) {
    if (pair.label === 1) {
      tp += 1;
    } else {
      fp += 1;
    }

    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / positives;
    const deltaRecall = recall - previousRecall;

    if (deltaRecall > 0) {
      aucPr += precision * deltaRecall;
      previousRecall = recall;
    }
  }

  return Number(aucPr.toFixed(6));
};

const computeRecallAtFixedPrecision = ({ labels = [], scores = [], precisionTarget = 0.9 } = {}) => {
  const size = Math.min(labels.length, scores.length);
  if (size === 0) {
    return {
      recall: null,
      threshold: null,
      precision_target: precisionTarget,
    };
  }

  const pairs = [];
  for (let index = 0; index < size; index += 1) {
    pairs.push({
      label: Number(labels[index]) > 0 ? 1 : 0,
      score: sanitizeProbability(scores[index]),
    });
  }

  pairs.sort((left, right) => right.score - left.score);

  const positives = pairs.reduce((sum, item) => sum + item.label, 0);
  if (positives === 0) {
    return {
      recall: null,
      threshold: null,
      precision_target: precisionTarget,
    };
  }

  let tp = 0;
  let fp = 0;
  let bestRecall = 0;
  let bestThreshold = null;

  for (const pair of pairs) {
    if (pair.label === 1) {
      tp += 1;
    } else {
      fp += 1;
    }

    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / positives;

    if (precision >= precisionTarget && recall >= bestRecall) {
      bestRecall = recall;
      bestThreshold = pair.score;
    }
  }

  return {
    recall: Number(bestRecall.toFixed(6)),
    threshold: bestThreshold === null ? null : Number(bestThreshold.toFixed(6)),
    precision_target: Number(toNumber(precisionTarget, 0.9).toFixed(6)),
  };
};

const computeBrierScore = ({ labels = [], scores = [] } = {}) => {
  const size = Math.min(labels.length, scores.length);
  if (size === 0) {
    return null;
  }

  let sum = 0;
  for (let index = 0; index < size; index += 1) {
    const label = Number(labels[index]) > 0 ? 1 : 0;
    const score = sanitizeProbability(scores[index]);
    const error = score - label;
    sum += error * error;
  }

  return Number((sum / size).toFixed(6));
};

const computeEce = ({ labels = [], scores = [], bins = 10 } = {}) => {
  const size = Math.min(labels.length, scores.length);
  if (size === 0) {
    return null;
  }

  const safeBins = Math.max(2, Math.trunc(toNumber(bins, 10)));
  const bucket = new Array(safeBins).fill(null).map(() => ({
    count: 0,
    scoreSum: 0,
    labelSum: 0,
  }));

  for (let index = 0; index < size; index += 1) {
    const score = sanitizeProbability(scores[index]);
    const label = Number(labels[index]) > 0 ? 1 : 0;
    const slot = Math.min(safeBins - 1, Math.floor(score * safeBins));

    bucket[slot].count += 1;
    bucket[slot].scoreSum += score;
    bucket[slot].labelSum += label;
  }

  let ece = 0;
  for (const row of bucket) {
    if (row.count === 0) {
      continue;
    }

    const avgScore = row.scoreSum / row.count;
    const avgLabel = row.labelSum / row.count;
    ece += (row.count / size) * Math.abs(avgScore - avgLabel);
  }

  return Number(ece.toFixed(6));
};

const computeCategoricalAccuracy = ({ actual = [], predicted = [] } = {}) => {
  const size = Math.min(actual.length, predicted.length);
  if (size === 0) {
    return null;
  }

  let correct = 0;
  for (let index = 0; index < size; index += 1) {
    if (String(actual[index]) === String(predicted[index])) {
      correct += 1;
    }
  }

  return Number((correct / size).toFixed(6));
};

const computeReturnDirectionAccuracy = ({ actualReturns = [], predictedReturns = [] } = {}) => {
  const size = Math.min(actualReturns.length, predictedReturns.length);
  if (size === 0) {
    return null;
  }

  const sign = (value) => {
    const numeric = toNumber(value, 0);
    if (numeric > 0.000001) {
      return 1;
    }
    if (numeric < -0.000001) {
      return -1;
    }
    return 0;
  };

  let correct = 0;
  for (let index = 0; index < size; index += 1) {
    if (sign(actualReturns[index]) === sign(predictedReturns[index])) {
      correct += 1;
    }
  }

  return Number((correct / size).toFixed(6));
};

const computeMetrics = ({
  riskLabels = [],
  riskScores = [],
  actualStates = [],
  predictedStates = [],
  actualReturns = [],
  predictedReturns = [],
  precisionTarget = 0.9,
  eceBins = 10,
} = {}) => {
  const aucPr = computeAucPr({ labels: riskLabels, scores: riskScores });
  const recallAtPrecision = computeRecallAtFixedPrecision({
    labels: riskLabels,
    scores: riskScores,
    precisionTarget,
  });

  return {
    auc_pr: aucPr,
    recall_at_fixed_precision: recallAtPrecision,
    calibration: {
      brier_score: computeBrierScore({ labels: riskLabels, scores: riskScores }),
      ece: computeEce({ labels: riskLabels, scores: riskScores, bins: eceBins }),
    },
    prediction_accuracy: {
      state_accuracy: computeCategoricalAccuracy({ actual: actualStates, predicted: predictedStates }),
      return_direction_accuracy: computeReturnDirectionAccuracy({
        actualReturns,
        predictedReturns,
      }),
    },
  };
};

const computeDecisionPrecision = ({
  decisionRows = [],
  threshold = 0.5,
} = {}) => {
  const rows = Array.isArray(decisionRows) ? decisionRows : [];
  const cutoff = clamp(toNumber(threshold, 0.5), 0, 1);

  let truePositive = 0;
  let predictedPositive = 0;

  for (const row of rows) {
    const predicted = Boolean(row?.predicted_positive);
    const confidence = sanitizeProbability(row?.confidence);
    const actual = Number(row?.actual_positive) > 0 ? 1 : 0;

    if (!predicted || confidence < cutoff) {
      continue;
    }

    predictedPositive += 1;
    if (actual === 1) {
      truePositive += 1;
    }
  }

  if (predictedPositive === 0) {
    return null;
  }

  return Number((truePositive / predictedPositive).toFixed(6));
};

const computeDecisionCalibration = ({ decisionRows = [], eceBins = 10 } = {}) => {
  const rows = Array.isArray(decisionRows) ? decisionRows : [];
  const labels = [];
  const scores = [];

  for (const row of rows) {
    labels.push(Number(row?.actual_positive) > 0 ? 1 : 0);
    scores.push(sanitizeProbability(row?.confidence));
  }

  return {
    brier_score: computeBrierScore({ labels, scores }),
    ece: computeEce({ labels, scores, bins: eceBins }),
  };
};

const computeKPIs = ({
  decisionRows = [],
  business = {},
  precisionThreshold = 0.5,
  eceBins = 10,
} = {}) => {
  const calibration = computeDecisionCalibration({ decisionRows, eceBins });

  return {
    precision: computeDecisionPrecision({
      decisionRows,
      threshold: precisionThreshold,
    }),
    calibration,
    calibration_score: calibration?.brier_score,
    stockout_rate: Number.isFinite(Number(business?.stockout_event_rate))
      ? Number(business.stockout_event_rate)
      : null,
    excess_inventory: Number.isFinite(Number(business?.excess_inventory_avg))
      ? Number(business.excess_inventory_avg)
      : null,
    inventory_turnover: Number.isFinite(Number(business?.inventory_turnover))
      ? Number(business.inventory_turnover)
      : null,
  };
};

module.exports = {
  computeAucPr,
  computeRecallAtFixedPrecision,
  computeBrierScore,
  computeEce,
  computeCategoricalAccuracy,
  computeReturnDirectionAccuracy,
  computeMetrics,
  computeDecisionPrecision,
  computeDecisionCalibration,
  computeKPIs,
};
