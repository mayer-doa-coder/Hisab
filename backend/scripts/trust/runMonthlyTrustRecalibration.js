const path = require('path');

const {
  PATHS,
  REPORTS_DIR,
  readJson,
  writeJson,
  writeText,
  nowIso,
  bumpSemver,
  resolveLatestBundleVersion,
  toModelVersionLabel,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
  resolveVersionedArtifactPath,
  fileDigest,
  stringifyReportHeader,
} = require('./trustOptimizationUtils');
const { buildSyntheticDataset } = require('./trainTrustChampionModel');

const clip = (value, min, max) => Math.max(min, Math.min(max, value));

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sigmoid = (value) => {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
};

const logit = (probability) => {
  const clipped = clip(toFinite(probability, 0.5), 1e-6, 1 - 1e-6);
  return Math.log(clipped / (1 - clipped));
};

const applyPlatt = (probability, calibration) => {
  const a = toFinite(calibration?.a, 1);
  const b = toFinite(calibration?.b, 0);
  return clip(sigmoid(a * logit(probability) + b), 0, 1);
};

const mean = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const applyBlend = (probability, calibration) => {
  const alpha = clip(toFinite(calibration?.blend_alpha, 1), 0, 1);
  const baseRate = clip(toFinite(calibration?.base_rate, 0.5), 1e-6, 1 - 1e-6);
  return clip((alpha * probability) + ((1 - alpha) * baseRate), 0, 1);
};

const applyCalibration = (probability, calibration) => {
  const platt = applyPlatt(probability, calibration);
  return applyBlend(platt, calibration);
};

const fitProbabilityBlend = (probabilities, labels, { targetEce = 0.06, maxBrierIncrease = 0.01 } = {}) => {
  if (!Array.isArray(probabilities) || !Array.isArray(labels) || probabilities.length === 0 || probabilities.length !== labels.length) {
    return { blend_alpha: 1, base_rate: 0.5 };
  }

  const baseRate = clip(mean(labels.map((value) => (toFinite(value, 0) >= 0.5 ? 1 : 0))), 1e-6, 1 - 1e-6);
  const baseline = probabilities.map((value) => clip(toFinite(value, baseRate), 1e-6, 1 - 1e-6));
  const baselineBrier = brierScore(labels, baseline);
  const baselineEce = calibrationShift(labels, baseline);

  let bestPassing = null;
  const baselineCandidate = {
    blend_alpha: 1,
    base_rate: baseRate,
    ece: baselineEce,
    brier: baselineBrier,
  };

  for (let step = 100; step >= 0; step -= 1) {
    const alpha = step / 100;
    const blended = baseline.map((value) => applyBlend(value, { blend_alpha: alpha, base_rate: baseRate }));
    const nextBrier = brierScore(labels, blended);
    const nextCalShift = calibrationShift(labels, blended);

    const candidate = {
      blend_alpha: alpha,
      base_rate: baseRate,
      ece: nextCalShift,
      brier: nextBrier,
    };

    const brierWithinBudget = nextBrier !== null && baselineBrier !== null
      ? nextBrier <= (baselineBrier + maxBrierIncrease)
      : true;

    if (nextCalShift !== null && nextCalShift <= targetEce && brierWithinBudget) {
      if (!bestPassing || candidate.blend_alpha > bestPassing.blend_alpha) {
        bestPassing = candidate;
      }
      continue;
    }

  }

  return {
    blend_alpha: Number((bestPassing || baselineCandidate).blend_alpha.toFixed(6)),
    base_rate: Number((bestPassing || baselineCandidate).base_rate.toFixed(6)),
  };
};

const fitPlattFromProbabilities = (probabilities, labels, { epochs = 1800, learningRate = 0.03, l2 = 0.0005 } = {}) => {
  if (!Array.isArray(probabilities) || !Array.isArray(labels) || probabilities.length === 0 || probabilities.length !== labels.length) {
    return { a: 1, b: 0 };
  }

  let a = 1;
  let b = 0;
  const logits = probabilities.map((value) => logit(value));
  const n = probabilities.length;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let gradA = 0;
    let gradB = 0;

    for (let index = 0; index < n; index += 1) {
      const prediction = sigmoid(a * logits[index] + b);
      const error = prediction - labels[index];
      gradA += (error * logits[index]) / n;
      gradB += error / n;
    }

    gradA += l2 * a;
    a -= learningRate * gradA;
    b -= learningRate * gradB;

    if (a < 0) {
      a = 0;
    }
  }

  return {
    a: Number(a.toFixed(6)),
    b: Number(b.toFixed(6)),
  };
};

const brierScore = (labels, probabilities) => {
  if (!Array.isArray(labels) || !Array.isArray(probabilities) || labels.length === 0 || labels.length !== probabilities.length) {
    return null;
  }

  const total = labels.reduce((sum, label, index) => {
    const y = toFinite(label, 0) >= 0.5 ? 1 : 0;
    const p = clip(toFinite(probabilities[index], 0), 0, 1);
    const diff = p - y;
    return sum + diff * diff;
  }, 0);

  return Number((total / labels.length).toFixed(6));
};

const calibrationShift = (labels, probabilities) => {
  if (!Array.isArray(labels) || !Array.isArray(probabilities) || labels.length === 0 || labels.length !== probabilities.length) {
    return null;
  }

  const avgActual = labels.reduce((sum, value) => sum + (toFinite(value, 0) >= 0.5 ? 1 : 0), 0) / labels.length;
  const avgPred = probabilities.reduce((sum, value) => sum + clip(toFinite(value, 0), 0, 1), 0) / probabilities.length;
  return Number(Math.abs(avgPred - avgActual).toFixed(6));
};

const computeChampionProbability = (featureRow, model) => {
  const featureOrder = Array.isArray(model?.feature_order) ? model.feature_order : [];
  const coefficients = model?.coefficients || {};
  let linear = toFinite(model?.intercept, 0);

  for (const featureKey of featureOrder) {
    const value = toFinite(featureRow?.[featureKey], 0);
    linear += value * toFinite(coefficients[featureKey], 0);
  }

  const calibration = {
    a: toFinite(model?.calibration?.a, 1),
    b: toFinite(model?.calibration?.b, 0),
    blend_alpha: toFinite(model?.calibration?.blend_alpha, 1),
    base_rate: toFinite(model?.calibration?.base_rate, 0.5),
  };

  return applyCalibration(sigmoid(linear), calibration);
};

const randomJitter = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const loadCalibrationRows = ({ datasetPath, championModel }) => {
  if (datasetPath) {
    const loaded = readJson(path.resolve(datasetPath), null);
    if (Array.isArray(loaded)) {
      return loaded;
    }
  }

  // Fallback synthetic rows to keep the monthly job runnable in dev environments.
  const sourceRows = buildSyntheticDataset({ count: 320, seed: 1432 });
  const rand = randomJitter(9091);

  return sourceRows.map((row) => {
    const championProbability = computeChampionProbability(row, championModel);
    const challengerProbability = clip(championProbability + (rand() - 0.5) * 0.08, 0.001, 0.999);

    return {
      actual_outcome: row.label,
      champion_probability: championProbability,
      challenger_probability: challengerProbability,
    };
  });
};

const buildModelCalibrationDataset = (rows, modelKey) => {
  const probabilities = [];
  const labels = [];

  for (const row of rows) {
    const labelRaw = row.actual_outcome ?? row.actualOutcome ?? row.label ?? row.defaulted ?? row.target;
    if (labelRaw === null || labelRaw === undefined) {
      continue;
    }

    const label = toFinite(labelRaw, 0) >= 0.5 ? 1 : 0;

    let probability = null;
    if (row.model_key) {
      const key = String(row.model_key).trim().toLowerCase();
      if (key === modelKey) {
        probability = row.predicted_probability ?? row.probability ?? row.score_probability;
      }
    } else if (modelKey === 'champion') {
      probability = row.champion_probability ?? row.predicted_probability ?? row.probability;
    } else if (modelKey === 'challenger') {
      probability = row.challenger_probability ?? row.predicted_probability ?? row.probability;
    }

    const p = toFinite(probability, Number.NaN);
    if (!Number.isFinite(p)) {
      continue;
    }

    probabilities.push(clip(p, 0.001, 0.999));
    labels.push(label);
  }

  return { probabilities, labels };
};

const createModelSnapshot = ({ modelName, semver, sourcePath, payload }) => {
  const versionedPath = resolveVersionedArtifactPath(modelName, semver, 'json');
  writeJson(versionedPath, payload);

  return {
    version: semver,
    path: versionedPath,
    sha256: fileDigest(versionedPath),
    source_path: sourcePath,
  };
};

const createMonthlyReportMarkdown = (report) => {
  let markdown = stringifyReportHeader({
    title: 'Trust Monthly Recalibration Report',
    metadata: {
      generated_at: report.generated_at,
      bundle_version: report.bundle_version,
      model_label: report.model_version_label,
      dataset_source: report.dataset_source,
      samples_total: report.samples_total,
    },
  });

  markdown += '## Calibration Updates\n\n';
  for (const model of report.models) {
    markdown += `### ${model.model_key}\n`;
    markdown += `- calibration_before: a=${model.calibration_before.a}, b=${model.calibration_before.b}\n`;
    markdown += `- calibration_after: a=${model.calibration_after.a}, b=${model.calibration_after.b}\n`;
    markdown += `- brier_before: ${model.brier_before}\n`;
    markdown += `- brier_after: ${model.brier_after}\n`;
    markdown += `- calibration_shift_before: ${model.calibration_shift_before}\n`;
    markdown += `- calibration_shift_after: ${model.calibration_shift_after}\n\n`;
  }

  markdown += '## Safety Notes\n\n';
  markdown += '- Core model coefficients and tree structure were not modified.\n';
  markdown += '- Only calibration layer parameters were updated.\n';
  markdown += '- Candidate bundle should be deployed through Phase 8 feature flag rollout gates.\n';

  return markdown;
};

const main = () => {
  const datasetPathArg = process.argv[2] || process.env.TRUST_CALIBRATION_DATASET_PATH || '';

  const championModel = readJson(PATHS.championModel, null);
  const challengerModel = readJson(PATHS.challengerModel, null);
  if (!championModel || !challengerModel) {
    throw new Error('Champion and challenger artifacts must exist before monthly recalibration.');
  }

  const calibrationRows = loadCalibrationRows({
    datasetPath: datasetPathArg,
    championModel,
  });

  const championSet = buildModelCalibrationDataset(calibrationRows, 'champion');
  const challengerSet = buildModelCalibrationDataset(calibrationRows, 'challenger');

  const championBefore = {
    a: toFinite(championModel?.calibration?.a, 1),
    b: toFinite(championModel?.calibration?.b, 0),
  };
  const challengerBefore = {
    a: toFinite(challengerModel?.calibration?.a, 1),
    b: toFinite(challengerModel?.calibration?.b, 0),
  };

  const championPlattAfter = championSet.labels.length > 0
    ? fitPlattFromProbabilities(championSet.probabilities, championSet.labels)
    : championBefore;
  const challengerPlattAfter = challengerSet.labels.length > 0
    ? fitPlattFromProbabilities(challengerSet.probabilities, challengerSet.labels)
    : challengerBefore;

  const championPlattCalibrated = championSet.probabilities.map((value) => applyPlatt(value, championPlattAfter));
  const challengerPlattCalibrated = challengerSet.probabilities.map((value) => applyPlatt(value, challengerPlattAfter));

  const championBlend = fitProbabilityBlend(championPlattCalibrated, championSet.labels, {
    targetEce: 0.06,
    maxBrierIncrease: 0.01,
  });
  const challengerBlend = fitProbabilityBlend(challengerPlattCalibrated, challengerSet.labels, {
    targetEce: 0.06,
    maxBrierIncrease: 0.01,
  });

  const championAfter = {
    ...championPlattAfter,
    ...championBlend,
  };
  const challengerAfter = {
    ...challengerPlattAfter,
    ...challengerBlend,
  };

  const championBeforeCalibrated = championSet.probabilities.map((value) => applyCalibration(value, championBefore));
  const championAfterCalibrated = championSet.probabilities.map((value) => applyCalibration(value, championAfter));
  const challengerBeforeCalibrated = challengerSet.probabilities.map((value) => applyCalibration(value, challengerBefore));
  const challengerAfterCalibrated = challengerSet.probabilities.map((value) => applyCalibration(value, challengerAfter));

  const championNext = {
    ...championModel,
    version: championModel.version,
    calibration: {
      ...(championModel.calibration || {}),
      method: 'platt_scaling',
      a: championAfter.a,
      b: championAfter.b,
      blend_alpha: championAfter.blend_alpha,
      base_rate: championAfter.base_rate,
      updated_at: nowIso(),
      update_type: 'monthly_recalibration',
    },
  };

  const challengerNext = {
    ...challengerModel,
    version: challengerModel.version,
    calibration: {
      ...(challengerModel.calibration || {}),
      method: 'platt_scaling',
      a: challengerAfter.a,
      b: challengerAfter.b,
      blend_alpha: challengerAfter.blend_alpha,
      base_rate: challengerAfter.base_rate,
      updated_at: nowIso(),
      update_type: 'monthly_recalibration',
    },
  };

  const registry = loadRegistry();
  const currentBundleVersion = resolveLatestBundleVersion(registry);
  const nextBundleVersion = bumpSemver(currentBundleVersion, 'minor');
  const modelVersionLabel = toModelVersionLabel(nextBundleVersion);

  const championSnapshot = createModelSnapshot({
    modelName: 'trustChampionModel',
    semver: nextBundleVersion,
    sourcePath: PATHS.championModel,
    payload: championNext,
  });

  const challengerSnapshot = createModelSnapshot({
    modelName: 'trustChallengerModel',
    semver: nextBundleVersion,
    sourcePath: PATHS.challengerModel,
    payload: challengerNext,
  });

  const report = {
    event_type: 'monthly_recalibration',
    generated_at: nowIso(),
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    dataset_source: datasetPathArg || 'synthetic_fallback',
    samples_total: calibrationRows.length,
    models: [
      {
        model_key: 'champion',
        samples: championSet.labels.length,
        calibration_before: championBefore,
        calibration_after: championAfter,
        brier_before: brierScore(championSet.labels, championBeforeCalibrated),
        brier_after: brierScore(championSet.labels, championAfterCalibrated),
        calibration_shift_before: calibrationShift(championSet.labels, championBeforeCalibrated),
        calibration_shift_after: calibrationShift(championSet.labels, championAfterCalibrated),
      },
      {
        model_key: 'challenger',
        samples: challengerSet.labels.length,
        calibration_before: challengerBefore,
        calibration_after: challengerAfter,
        brier_before: brierScore(challengerSet.labels, challengerBeforeCalibrated),
        brier_after: brierScore(challengerSet.labels, challengerAfterCalibrated),
        calibration_shift_before: calibrationShift(challengerSet.labels, challengerBeforeCalibrated),
        calibration_shift_after: calibrationShift(challengerSet.labels, challengerAfterCalibrated),
      },
    ],
    artifact_snapshots: {
      champion: championSnapshot,
      challenger: challengerSnapshot,
    },
    deployment_status: 'candidate_bundle',
    lifecycle_state: 'candidate_bundle',
  };

  const reportJsonPath = path.join(REPORTS_DIR, `trustMonthlyRecalibration.${nextBundleVersion}.json`);
  const reportMdPath = path.join(REPORTS_DIR, `trustMonthlyRecalibration.${nextBundleVersion}.md`);
  writeJson(reportJsonPath, report);
  writeText(reportMdPath, createMonthlyReportMarkdown(report));

  let nextRegistry = {
    ...registry,
    bundles: {
      ...(registry.bundles || {}),
      [nextBundleVersion]: {
        bundle_version: nextBundleVersion,
        model_version_label: modelVersionLabel,
        type: 'monthly_recalibration',
        created_at: report.generated_at,
        dataset_source: report.dataset_source,
        deployment_status: 'candidate_bundle',
        lifecycle_state: 'candidate_bundle',
        champion: championSnapshot,
        challenger: challengerSnapshot,
        reports: {
          monthly_json: reportJsonPath,
          monthly_md: reportMdPath,
        },
      },
    },
  };

  nextRegistry = appendRegistryEvent(nextRegistry, {
    type: 'MONTHLY_RECALIBRATION_COMPLETED',
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    report_json: reportJsonPath,
    report_md: reportMdPath,
  });

  saveRegistry(nextRegistry);

  const summary = {
    event_type: report.event_type,
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    report_json: reportJsonPath,
    report_markdown: reportMdPath,
    champion_calibration: championAfter,
    challenger_calibration: challengerAfter,
    deployment_status: report.deployment_status,
  };

  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_MONTHLY_RECALIBRATION] failed: ${error?.message || error}`);
    process.exit(1);
  }
}
