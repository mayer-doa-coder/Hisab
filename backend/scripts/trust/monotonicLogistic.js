const FEATURE_CONFIG = [
  { key: 'due_amount', direction: 'positive' },
  { key: 'late_count', direction: 'positive' },
  { key: 'avg_delay_days', direction: 'positive' },
  { key: 'transaction_depth', direction: 'negative' },
  { key: 'recency_days', direction: 'positive' },
  { key: 'payment_consistency', direction: 'negative' },
  { key: 'payment_volatility', direction: 'positive' },
];

const DEFAULT_FEATURE_KEYS = FEATURE_CONFIG.map((item) => item.key);
const EPSILON = 1e-9;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sigmoid = (value) => {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
};

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toLabel = (value) => {
  if (value === true || value === 1 || value === '1') {
    return 1;
  }

  return 0;
};

const buildMonotonicConstraints = (featureKeys) => {
  const map = {};

  for (const key of featureKeys) {
    const config = FEATURE_CONFIG.find((item) => item.key === key);
    map[key] = config?.direction || 'positive';
  }

  return map;
};

const extractLabel = (row) => {
  return toLabel(
    row?.label
    ?? row?.target
    ?? row?.default_60d
    ?? row?.target_default_60d
    ?? row?.label_y_60
    ?? 0
  );
};

const toTimestamp = (row) => {
  const value = row?.score_time || row?.score_time_t || row?.timestamp || row?.created_at || null;
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
};

const featureValue = (row, key) => {
  if (row && typeof row === 'object' && row.features && typeof row.features === 'object') {
    return toFinite(row.features[key], 0);
  }

  return toFinite(row?.[key], 0);
};

const sortRowsByTime = (rows) => {
  return [...rows].sort((a, b) => toTimestamp(a) - toTimestamp(b));
};

const buildDesignMatrix = (rows, featureKeys = DEFAULT_FEATURE_KEYS) => {
  const sortedRows = sortRowsByTime(rows);
  const X = [];
  const y = [];

  for (const row of sortedRows) {
    X.push(featureKeys.map((key) => featureValue(row, key)));
    y.push(extractLabel(row));
  }

  return {
    rows: sortedRows,
    X,
    y,
    featureKeys,
  };
};

const fitStandardScaler = (X) => {
  if (!X.length) {
    return {
      mean: [],
      std: [],
    };
  }

  const n = X.length;
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);

  for (const row of X) {
    for (let j = 0; j < d; j += 1) {
      mean[j] += row[j] / n;
    }
  }

  for (const row of X) {
    for (let j = 0; j < d; j += 1) {
      const diff = row[j] - mean[j];
      std[j] += (diff * diff) / n;
    }
  }

  for (let j = 0; j < d; j += 1) {
    std[j] = Math.sqrt(std[j]);
    if (!Number.isFinite(std[j]) || std[j] < EPSILON) {
      std[j] = 1;
    }
  }

  return {
    mean,
    std,
  };
};

const transformWithScaler = (X, scaler) => {
  return X.map((row) => row.map((value, index) => (value - scaler.mean[index]) / scaler.std[index]));
};

const computeLogits = (X, weights, intercept) => {
  const logits = new Array(X.length).fill(intercept);

  for (let i = 0; i < X.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      logits[i] += X[i][j] * weights[j];
    }
  }

  return logits;
};

const crossEntropyLoss = (probabilities, labels, weights, l2Lambda = 0) => {
  const n = Math.max(1, labels.length);
  let loss = 0;

  for (let i = 0; i < labels.length; i += 1) {
    const p = clamp(probabilities[i], EPSILON, 1 - EPSILON);
    const y = labels[i];
    loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }

  let l2Penalty = 0;
  for (const weight of weights) {
    l2Penalty += weight * weight;
  }

  return loss / n + 0.5 * l2Lambda * l2Penalty;
};

const applyMonotonicProjection = (weights, featureKeys, monotonicConstraints) => {
  for (let j = 0; j < weights.length; j += 1) {
    const direction = monotonicConstraints[featureKeys[j]] || 'positive';
    if (direction === 'positive' && weights[j] < 0) {
      weights[j] = 0;
    }
    if (direction === 'negative' && weights[j] > 0) {
      weights[j] = 0;
    }
  }
};

const trainMonotonicLogisticRegression = ({
  X,
  y,
  featureKeys = DEFAULT_FEATURE_KEYS,
  monotonicConstraints = buildMonotonicConstraints(featureKeys),
  epochs = 1000,
  learningRate = 0.05,
  l2Lambda = 0.001,
}) => {
  if (!Array.isArray(X) || X.length === 0 || !Array.isArray(y) || y.length !== X.length) {
    throw new Error('Training data is empty or inconsistent.');
  }

  const n = X.length;
  const d = featureKeys.length;
  const weights = new Array(d).fill(0);
  let intercept = 0;
  let previousLoss = Number.POSITIVE_INFINITY;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const logits = computeLogits(X, weights, intercept);
    const probabilities = logits.map((value) => sigmoid(value));

    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i += 1) {
      const error = probabilities[i] - y[i];
      gradB += error / n;
      for (let j = 0; j < d; j += 1) {
        gradW[j] += (error * X[i][j]) / n;
      }
    }

    for (let j = 0; j < d; j += 1) {
      gradW[j] += l2Lambda * weights[j];
      weights[j] -= learningRate * gradW[j];
    }
    intercept -= learningRate * gradB;

    applyMonotonicProjection(weights, featureKeys, monotonicConstraints);

    const loss = crossEntropyLoss(probabilities, y, weights, l2Lambda);
    if (Math.abs(previousLoss - loss) < 1e-8) {
      break;
    }

    previousLoss = loss;
  }

  return {
    intercept,
    weights,
    featureKeys,
    monotonicConstraints,
  };
};

const fitPlattScaling = ({
  logits,
  labels,
  epochs = 800,
  learningRate = 0.05,
  l2Lambda = 0.001,
}) => {
  if (!Array.isArray(logits) || !logits.length || !Array.isArray(labels) || labels.length !== logits.length) {
    return { A: 1, B: 0 };
  }

  let A = 1;
  let B = 0;

  const n = logits.length;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let gradA = 0;
    let gradB = 0;

    for (let i = 0; i < n; i += 1) {
      const z = A * logits[i] + B;
      const p = sigmoid(z);
      const e = p - labels[i];
      gradA += (e * logits[i]) / n;
      gradB += e / n;
    }

    gradA += l2Lambda * A;

    A -= learningRate * gradA;
    B -= learningRate * gradB;

    if (A < 0) {
      A = 0;
    }
  }

  return { A, B };
};

const applyPlattScaling = (logits, calibration) => {
  const A = toFinite(calibration?.A, 1);
  const B = toFinite(calibration?.B, 0);
  return logits.map((logit) => sigmoid(A * logit + B));
};

const mean = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const applyProbabilityBlend = (probabilities, blend) => {
  const alpha = clamp(toFinite(blend?.alpha, 1), 0, 1);
  const baseRate = clamp(toFinite(blend?.baseRate, 0.5), EPSILON, 1 - EPSILON);
  return probabilities.map((probability) => {
    const p = clamp(toFinite(probability, baseRate), EPSILON, 1 - EPSILON);
    return clamp((alpha * p) + ((1 - alpha) * baseRate), EPSILON, 1 - EPSILON);
  });
};

const fitProbabilityBlend = ({
  labels,
  probabilities,
  targetEce = 0.06,
  maxBrierIncrease = 0.01,
} = {}) => {
  if (!Array.isArray(labels) || !Array.isArray(probabilities) || labels.length === 0 || labels.length !== probabilities.length) {
    return { alpha: 1, baseRate: 0.5, ece: null, brier: null };
  }

  const baseRate = clamp(mean(labels), EPSILON, 1 - EPSILON);
  const baselineProbabilities = probabilities.map((value) => clamp(toFinite(value, baseRate), EPSILON, 1 - EPSILON));
  const baselineEce = expectedCalibrationError(labels, baselineProbabilities, 10);
  const baselineBrier = brierScore(labels, baselineProbabilities);

  let bestPassing = null;
  const baselineCandidate = {
    alpha: 1,
    baseRate,
    ece: baselineEce,
    brier: baselineBrier,
  };

  for (let step = 100; step >= 0; step -= 1) {
    const alpha = step / 100;
    const blended = applyProbabilityBlend(baselineProbabilities, { alpha, baseRate });
    const nextEce = expectedCalibrationError(labels, blended, 10);
    const nextBrier = brierScore(labels, blended);

    const candidate = {
      alpha,
      baseRate,
      ece: nextEce,
      brier: nextBrier,
    };

    const brierWithinBudget = nextBrier <= (baselineBrier + maxBrierIncrease);
    if (nextEce <= targetEce && brierWithinBudget) {
      if (!bestPassing || candidate.alpha > bestPassing.alpha) {
        bestPassing = candidate;
      }
      continue;
    }

  }

  return bestPassing || baselineCandidate;
};

const fitIsotonicRegression = ({ probabilities, labels }) => {
  if (!Array.isArray(probabilities) || !Array.isArray(labels) || probabilities.length === 0 || probabilities.length !== labels.length) {
    return {
      x_thresholds: [0, 1],
      y_values: [0.5, 0.5],
    };
  }

  const pairs = probabilities
    .map((probability, index) => ({
      probability: clamp(toFinite(probability, 0.5), 0, 1),
      label: labels[index] >= 0.5 ? 1 : 0,
    }))
    .sort((a, b) => a.probability - b.probability);

  const blocks = [];
  for (const pair of pairs) {
    blocks.push({
      count: 1,
      sum: pair.label,
      min: pair.probability,
      max: pair.probability,
    });

    while (blocks.length >= 2) {
      const previous = blocks[blocks.length - 2];
      const current = blocks[blocks.length - 1];
      const prevMean = previous.sum / previous.count;
      const curMean = current.sum / current.count;
      if (prevMean <= curMean) {
        break;
      }

      blocks.splice(blocks.length - 2, 2, {
        count: previous.count + current.count,
        sum: previous.sum + current.sum,
        min: previous.min,
        max: current.max,
      });
    }
  }

  const xThresholds = [];
  const yValues = [];
  for (const block of blocks) {
    xThresholds.push(roundMetric(block.max));
    yValues.push(roundMetric(clamp(block.sum / block.count, 0, 1)));
  }

  if (xThresholds.length === 0) {
    return {
      x_thresholds: [0, 1],
      y_values: [0.5, 0.5],
    };
  }

  if (xThresholds[0] > 0) {
    xThresholds.unshift(0);
    yValues.unshift(yValues[0]);
  }
  if (xThresholds[xThresholds.length - 1] < 1) {
    xThresholds.push(1);
    yValues.push(yValues[yValues.length - 1]);
  }

  return {
    x_thresholds: xThresholds,
    y_values: yValues,
  };
};

const applyIsotonicRegression = ({ probabilities, isotonic }) => {
  const thresholds = Array.isArray(isotonic?.x_thresholds) ? isotonic.x_thresholds : [];
  const values = Array.isArray(isotonic?.y_values) ? isotonic.y_values : [];

  if (!thresholds.length || thresholds.length !== values.length) {
    return probabilities.map((value) => clamp(toFinite(value, 0.5), 0, 1));
  }

  return probabilities.map((value) => {
    const probability = clamp(toFinite(value, 0.5), 0, 1);
    for (let index = 0; index < thresholds.length; index += 1) {
      if (probability <= toFinite(thresholds[index], 1)) {
        return clamp(toFinite(values[index], probability), 0, 1);
      }
    }

    return clamp(toFinite(values[values.length - 1], probability), 0, 1);
  });
};

const brierScore = (labels, probabilities) => {
  if (!labels.length || labels.length !== probabilities.length) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const diff = labels[i] - clamp(probabilities[i], 0, 1);
    sum += diff * diff;
  }

  return sum / labels.length;
};

const expectedCalibrationError = (labels, probabilities, bins = 10) => {
  if (!labels.length || labels.length !== probabilities.length) {
    return 0;
  }

  const bucket = new Array(bins).fill(null).map(() => ({ count: 0, labelSum: 0, probSum: 0 }));

  for (let i = 0; i < labels.length; i += 1) {
    const p = clamp(probabilities[i], 0, 1);
    const index = Math.min(bins - 1, Math.floor(p * bins));
    bucket[index].count += 1;
    bucket[index].labelSum += labels[i];
    bucket[index].probSum += p;
  }

  let ece = 0;
  for (const bin of bucket) {
    if (!bin.count) {
      continue;
    }

    const acc = bin.labelSum / bin.count;
    const conf = bin.probSum / bin.count;
    ece += (bin.count / labels.length) * Math.abs(acc - conf);
  }

  return ece;
};

const aucPr = (labels, probabilities) => {
  if (!labels.length || labels.length !== probabilities.length) {
    return 0;
  }

  const pairs = labels.map((label, index) => ({
    label,
    prob: clamp(probabilities[index], 0, 1),
  }));

  pairs.sort((a, b) => b.prob - a.prob);

  const positives = labels.reduce((acc, label) => acc + (label === 1 ? 1 : 0), 0);
  if (positives === 0) {
    return 0;
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

const recallAtPrecision = (labels, probabilities, minPrecision = 0.9) => {
  if (!labels.length || labels.length !== probabilities.length) {
    return 0;
  }

  const pairs = labels.map((label, index) => ({
    label,
    prob: clamp(probabilities[index], 0, 1),
  }));

  pairs.sort((a, b) => b.prob - a.prob);

  const positives = labels.reduce((acc, label) => acc + (label === 1 ? 1 : 0), 0);
  if (positives === 0) {
    return 0;
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

const makeTemporalFolds = (n, k = 5) => {
  const foldCount = Math.max(2, Math.min(k, n));
  const foldSize = Math.max(1, Math.floor(n / foldCount));
  const folds = [];

  for (let i = 0; i < foldCount; i += 1) {
    const start = i * foldSize;
    const end = i === foldCount - 1 ? n : Math.min(n, (i + 1) * foldSize);
    if (start >= end) {
      continue;
    }

    const validation = [];
    const training = [];

    for (let index = 0; index < n; index += 1) {
      if (index >= start && index < end) {
        validation.push(index);
      } else {
        training.push(index);
      }
    }

    if (training.length && validation.length) {
      folds.push({ training, validation });
    }
  }

  return folds;
};

const selectRows = (matrix, indices) => {
  return indices.map((idx) => matrix[idx]);
};

const coefficientStd = (weightSnapshots) => {
  if (!weightSnapshots.length) {
    return [];
  }

  const d = weightSnapshots[0].length;
  const mean = new Array(d).fill(0);
  const variance = new Array(d).fill(0);
  const n = weightSnapshots.length;

  for (const weights of weightSnapshots) {
    for (let j = 0; j < d; j += 1) {
      mean[j] += weights[j] / n;
    }
  }

  for (const weights of weightSnapshots) {
    for (let j = 0; j < d; j += 1) {
      const diff = weights[j] - mean[j];
      variance[j] += (diff * diff) / n;
    }
  }

  return variance.map((value) => Math.sqrt(value));
};

const toExportedCoefficients = ({ intercept, weights, scaler, featureKeys }) => {
  const coefficients = {};
  let exportedIntercept = intercept;

  for (let j = 0; j < featureKeys.length; j += 1) {
    const scale = scaler.std[j] || 1;
    const coefficient = weights[j] / scale;
    coefficients[featureKeys[j]] = coefficient;
    exportedIntercept -= (weights[j] * scaler.mean[j]) / scale;
  }

  return {
    intercept: exportedIntercept,
    coefficients,
  };
};

const roundMetric = (value, digits = 6) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const summarizeMetrics = ({ labels, rawProbabilities, calibratedProbabilities }) => {
  return {
    auc_pr: roundMetric(aucPr(labels, calibratedProbabilities)),
    recall_at_precision_90: roundMetric(recallAtPrecision(labels, calibratedProbabilities, 0.9)),
    brier_raw: roundMetric(brierScore(labels, rawProbabilities)),
    brier_calibrated: roundMetric(brierScore(labels, calibratedProbabilities)),
    ece_calibrated: roundMetric(expectedCalibrationError(labels, calibratedProbabilities, 10)),
  };
};

const trainChampionModel = ({
  rows,
  featureKeys = DEFAULT_FEATURE_KEYS,
  foldCount = 5,
  training = {},
} = {}) => {
  const matrix = buildDesignMatrix(rows || [], featureKeys);
  if (!matrix.X.length) {
    throw new Error('No training rows were provided.');
  }

  const monotonicConstraints = buildMonotonicConstraints(featureKeys);
  const folds = makeTemporalFolds(matrix.X.length, foldCount);

  const outOfFoldLogits = new Array(matrix.X.length).fill(0);
  const outOfFoldLabels = [...matrix.y];
  const foldMetrics = [];
  const foldWeights = [];

  for (const fold of folds) {
    const trainXRaw = selectRows(matrix.X, fold.training);
    const trainY = selectRows(matrix.y, fold.training);
    const valXRaw = selectRows(matrix.X, fold.validation);
    const valY = selectRows(matrix.y, fold.validation);

    const scaler = fitStandardScaler(trainXRaw);
    const trainX = transformWithScaler(trainXRaw, scaler);
    const valX = transformWithScaler(valXRaw, scaler);

    const fitted = trainMonotonicLogisticRegression({
      X: trainX,
      y: trainY,
      featureKeys,
      monotonicConstraints,
      epochs: training.epochs || 1500,
      learningRate: training.learningRate || 0.05,
      l2Lambda: training.l2Lambda || 0.001,
    });

    foldWeights.push([...fitted.weights]);

    const logits = computeLogits(valX, fitted.weights, fitted.intercept);
    const probs = logits.map((value) => sigmoid(value));
    const metrics = summarizeMetrics({
      labels: valY,
      rawProbabilities: probs,
      calibratedProbabilities: probs,
    });

    foldMetrics.push(metrics);

    for (let i = 0; i < fold.validation.length; i += 1) {
      const index = fold.validation[i];
      outOfFoldLogits[index] = logits[i];
    }
  }

  const platt = fitPlattScaling({
    logits: outOfFoldLogits,
    labels: outOfFoldLabels,
    epochs: 1200,
    learningRate: 0.03,
    l2Lambda: 0.0005,
  });

  const fullScaler = fitStandardScaler(matrix.X);
  const fullX = transformWithScaler(matrix.X, fullScaler);
  const fullModel = trainMonotonicLogisticRegression({
    X: fullX,
    y: matrix.y,
    featureKeys,
    monotonicConstraints,
    epochs: training.epochs || 1800,
    learningRate: training.learningRate || 0.05,
    l2Lambda: training.l2Lambda || 0.001,
  });

  const fullLogits = computeLogits(fullX, fullModel.weights, fullModel.intercept);
  const rawProbabilities = fullLogits.map((value) => sigmoid(value));
  const plattProbabilities = applyPlattScaling(fullLogits, platt);
  const blend = fitProbabilityBlend({
    labels: matrix.y,
    probabilities: plattProbabilities,
    targetEce: 0.06,
  });
  const plattBlendProbabilities = applyProbabilityBlend(plattProbabilities, blend);
  const isotonic = fitIsotonicRegression({ probabilities: rawProbabilities, labels: matrix.y });
  const isotonicProbabilities = applyIsotonicRegression({ probabilities: rawProbabilities, isotonic });

  const plattBlendMetrics = summarizeMetrics({
    labels: matrix.y,
    rawProbabilities,
    calibratedProbabilities: plattBlendProbabilities,
  });
  const isotonicMetrics = summarizeMetrics({
    labels: matrix.y,
    rawProbabilities,
    calibratedProbabilities: isotonicProbabilities,
  });

  const useIsotonic = (
    isotonicMetrics.ece_calibrated <= 0.06
    && isotonicMetrics.brier_calibrated <= 0.18
    && (
      plattBlendMetrics.ece_calibrated > 0.06
      || isotonicMetrics.ece_calibrated < plattBlendMetrics.ece_calibrated
    )
  );

  const calibratedProbabilities = useIsotonic ? isotonicProbabilities : plattBlendProbabilities;

  const exported = toExportedCoefficients({
    intercept: fullModel.intercept,
    weights: fullModel.weights,
    scaler: fullScaler,
    featureKeys,
  });

  const signCheck = {};
  for (const key of featureKeys) {
    const direction = monotonicConstraints[key];
    const coefficient = exported.coefficients[key];
    signCheck[key] = direction === 'positive' ? coefficient >= -1e-10 : coefficient <= 1e-10;
  }

  const coeffStd = coefficientStd(foldWeights);
  const maxCoeffStd = coeffStd.length ? Math.max(...coeffStd.map((value) => Math.abs(value))) : 0;
  const metrics = summarizeMetrics({
    labels: matrix.y,
    rawProbabilities,
    calibratedProbabilities,
  });

  const labelRate = matrix.y.reduce((acc, value) => acc + value, 0) / Math.max(1, matrix.y.length);

  return {
    featureKeys,
    monotonicConstraints,
    calibration: {
      method: useIsotonic ? 'isotonic_regression' : 'platt_with_probability_blend',
      A: roundMetric(platt.A),
      B: roundMetric(platt.B),
      blend_alpha: roundMetric(blend.alpha),
      base_rate: roundMetric(blend.baseRate),
      x_thresholds: isotonic.x_thresholds,
      y_values: isotonic.y_values,
    },
    model: {
      intercept: roundMetric(exported.intercept),
      coefficients: Object.fromEntries(
        Object.entries(exported.coefficients).map(([key, value]) => [key, roundMetric(value)])
      ),
    },
    stability: {
      folds: folds.length,
      coefficient_std_max: roundMetric(maxCoeffStd),
      coefficient_std_by_index: coeffStd.map((value) => roundMetric(value)),
      fold_metrics: foldMetrics,
    },
    metrics,
    dataset: {
      samples: matrix.X.length,
      positive_rate: roundMetric(labelRate),
    },
    monotonic_sign_ok: signCheck,
  };
};

module.exports = {
  DEFAULT_FEATURE_KEYS,
  FEATURE_CONFIG,
  buildMonotonicConstraints,
  buildDesignMatrix,
  fitStandardScaler,
  transformWithScaler,
  trainMonotonicLogisticRegression,
  fitPlattScaling,
  applyPlattScaling,
  summarizeMetrics,
  trainChampionModel,
  sigmoid,
};
