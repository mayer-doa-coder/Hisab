const toTimestamp = (value) => {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
};

const assertStrictChronologicalOrder = (rows = [], label = 'rows') => {
  let previous = null;
  for (let index = 0; index < rows.length; index += 1) {
    const ts = toTimestamp(rows[index]?.timestamp);
    if (ts === null) {
      throw new Error(`[LEAKAGE] ${label} has invalid timestamp at index ${index}.`);
    }

    if (previous !== null && ts <= previous) {
      throw new Error(`[LEAKAGE] ${label} is not strictly increasing at index ${index}.`);
    }

    previous = ts;
  }

  return true;
};

const assertTrainTestBoundary = (trainRows = [], testRows = []) => {
  if (trainRows.length === 0 || testRows.length === 0) {
    return true;
  }

  const trainEnd = toTimestamp(trainRows[trainRows.length - 1]?.timestamp);
  const testStart = toTimestamp(testRows[0]?.timestamp);

  if (trainEnd === null || testStart === null) {
    throw new Error('[LEAKAGE] Unable to determine train/test timestamp boundary.');
  }

  if (trainEnd >= testStart) {
    throw new Error('[LEAKAGE] Train/Test overlap detected at boundary.');
  }

  return true;
};

const assertNoTimestampOverlap = (trainRows = [], testRows = []) => {
  const seen = new Set();
  for (const row of trainRows) {
    const ts = toTimestamp(row?.timestamp);
    if (ts !== null) {
      seen.add(ts);
    }
  }

  for (const row of testRows) {
    const ts = toTimestamp(row?.timestamp);
    if (ts !== null && seen.has(ts)) {
      throw new Error('[LEAKAGE] Exact timestamp overlap between train and test rows.');
    }
  }

  return true;
};

const assertFeatureAlignment = ({
  featureTimestamp,
  labelTimestamp,
  context = 'feature_window',
} = {}) => {
  const featureTs = toTimestamp(featureTimestamp);
  const labelTs = toTimestamp(labelTimestamp);

  if (featureTs === null || labelTs === null) {
    throw new Error(`[LEAKAGE] Invalid feature/label timestamp in ${context}.`);
  }

  if (featureTs >= labelTs) {
    throw new Error(`[LEAKAGE] Feature timestamp is not strictly before label timestamp in ${context}.`);
  }

  return true;
};

const runLeakageChecks = ({ trainRows = [], testRows = [] } = {}) => {
  assertStrictChronologicalOrder(trainRows, 'trainRows');
  assertStrictChronologicalOrder(testRows, 'testRows');
  assertTrainTestBoundary(trainRows, testRows);
  assertNoTimestampOverlap(trainRows, testRows);

  return {
    passed: true,
    checks: {
      strict_chronology: true,
      train_before_test: true,
      no_timestamp_overlap: true,
    },
  };
};

module.exports = {
  toTimestamp,
  runLeakageChecks,
  assertStrictChronologicalOrder,
  assertTrainTestBoundary,
  assertNoTimestampOverlap,
  assertFeatureAlignment,
};
