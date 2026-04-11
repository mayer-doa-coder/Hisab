const fs = require('fs');
const path = require('path');
const {
  trainChampionModel,
  DEFAULT_FEATURE_KEYS,
  FEATURE_CONFIG,
  sigmoid,
} = require('./monotonicLogistic');

const VERSION = '1.0.0';

const defaultOutputPaths = {
  backendModel: path.resolve(__dirname, '../../artifacts/trustChampionModel.v1.json'),
  backendMetrics: path.resolve(__dirname, '../../artifacts/trustChampionModel.metrics.v1.json'),
  frontendModelJson: path.resolve(__dirname, '../../../frontend/hisab-app/services/customers/models/trustChampionModel.v1.json'),
  frontendModelJs: path.resolve(__dirname, '../../../frontend/hisab-app/services/customers/models/trustChampionModel.v1.js'),
};

const FEATURE_DIRECTIONS = Object.fromEntries(FEATURE_CONFIG.map((item) => [item.key, item.direction]));

const seededRandom = (seedValue) => {
  let seed = seedValue >>> 0;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
};

const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const envFlag = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

const mustUseRealDataset = () => {
  const isProductionEnv = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  return isProductionEnv || envFlag('TRUST_REQUIRE_REAL_DATASET', false);
};

const canFallbackToSynthetic = () => {
  if (!mustUseRealDataset()) {
    return true;
  }

  return envFlag('TRUST_ALLOW_SYNTHETIC_DATASET', false);
};

const buildSyntheticDataset = ({ count = 260, seed = 1337 } = {}) => {
  const rand = seededRandom(seed);
  const rows = [];

  for (let i = 0; i < count; i += 1) {
    const dueAmount = round(rand() ** 2 * 12000, 2);
    const lateCount = Math.floor(rand() * 6);
    const avgDelayDays = round(rand() * 35, 3);
    const transactionDepth = Math.floor(rand() * 35);
    const recencyDays = round(rand() * 60, 3);
    const paymentConsistency = round(0.25 + rand() * 0.75, 4);
    const paymentVolatility = round(rand() * 120, 3);

    const latent =
      -2.05
      + 0.00025 * dueAmount
      + 0.42 * lateCount
      + 0.048 * avgDelayDays
      - 0.05 * transactionDepth
      + 0.03 * recencyDays
      - 1.65 * paymentConsistency
      + 0.006 * paymentVolatility
      + (rand() - 0.5) * 0.15;

    const probability = sigmoid(latent);
    const label = rand() <= probability ? 1 : 0;

    const timestamp = new Date(Date.UTC(2025, 0, 1 + i)).toISOString();
    rows.push({
      score_time: timestamp,
      due_amount: dueAmount,
      late_count: lateCount,
      avg_delay_days: avgDelayDays,
      transaction_depth: transactionDepth,
      recency_days: recencyDays,
      payment_consistency: paymentConsistency,
      payment_volatility: paymentVolatility,
      label,
    });
  }

  return rows;
};

const loadDatasetFromPath = (datasetPath) => {
  const text = fs.readFileSync(datasetPath, 'utf8');
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error('Dataset file must contain a JSON array of rows.');
  }

  return parsed;
};

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const buildModelArtifact = ({ trained, datasetSource, sampleRows }) => {
  const now = new Date().toISOString();

  return {
    model_name: 'hisab_trust_champion',
    version: VERSION,
    created_at: now,
    method: 'monotonic_logistic_regression',
    dataset_source: datasetSource,
    feature_order: [...DEFAULT_FEATURE_KEYS],
    monotonic_constraints: FEATURE_DIRECTIONS,
    intercept: trained.model.intercept,
    coefficients: trained.model.coefficients,
    calibration: {
      method: trained.calibration.method || 'platt_scaling',
      a: trained.calibration.A,
      b: trained.calibration.B,
      blend_alpha: trained.calibration.blend_alpha ?? 1,
      base_rate: trained.calibration.base_rate ?? 0.5,
      x_thresholds: Array.isArray(trained.calibration.x_thresholds) ? trained.calibration.x_thresholds : [],
      y_values: Array.isArray(trained.calibration.y_values) ? trained.calibration.y_values : [],
    },
    probability_thresholds: {
      medium_risk_min: 0.4,
      high_risk_min: 0.7,
    },
    training_summary: {
      samples: sampleRows.length,
      positive_rate: trained.dataset.positive_rate,
      stability: {
        folds: trained.stability.folds,
        coefficient_std_max: trained.stability.coefficient_std_max,
      },
    },
    metrics: {
      auc_pr: trained.metrics.auc_pr,
      recall_at_precision_90: trained.metrics.recall_at_precision_90,
      brier_calibrated: trained.metrics.brier_calibrated,
      ece_calibrated: trained.metrics.ece_calibrated,
    },
  };
};

const buildMetricsArtifact = ({ trained, datasetSource }) => {
  return {
    model_name: 'hisab_trust_champion',
    version: VERSION,
    dataset_source: datasetSource,
    monotonic_sign_ok: trained.monotonic_sign_ok,
    overall_metrics: trained.metrics,
    fold_stability: trained.stability,
    calibration: trained.calibration,
    training_dataset: trained.dataset,
  };
};

const writeArtifacts = ({ modelArtifact, metricsArtifact }) => {
  ensureDir(defaultOutputPaths.backendModel);
  ensureDir(defaultOutputPaths.backendMetrics);
  ensureDir(defaultOutputPaths.frontendModelJson);
  ensureDir(defaultOutputPaths.frontendModelJs);

  fs.writeFileSync(defaultOutputPaths.backendModel, `${JSON.stringify(modelArtifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(defaultOutputPaths.backendMetrics, `${JSON.stringify(metricsArtifact, null, 2)}\n`, 'utf8');

  fs.writeFileSync(defaultOutputPaths.frontendModelJson, `${JSON.stringify(modelArtifact, null, 2)}\n`, 'utf8');

  const jsModule = `export const TRUST_CHAMPION_MODEL = ${JSON.stringify(modelArtifact, null, 2)};\n`;
  fs.writeFileSync(defaultOutputPaths.frontendModelJs, jsModule, 'utf8');
};

const main = () => {
  const datasetArg = process.argv[2] || process.env.TRUST_TRAINING_DATASET_PATH || '';
  const datasetPathArg = datasetArg ? path.resolve(datasetArg) : null;

  let rows;
  let datasetSource;
  if (datasetPathArg && fs.existsSync(datasetPathArg)) {
    rows = loadDatasetFromPath(datasetPathArg);
    datasetSource = datasetPathArg;
  } else {
    if (!canFallbackToSynthetic()) {
      throw new Error(
        'No training dataset was provided. Set TRUST_TRAINING_DATASET_PATH (or pass dataset path as CLI argument). '
        + 'Synthetic fallback is blocked when NODE_ENV=production or TRUST_REQUIRE_REAL_DATASET=true.'
      );
    }

    rows = buildSyntheticDataset();
    datasetSource = 'synthetic_seed_1337';
  }

  const trained = trainChampionModel({
    rows,
    featureKeys: DEFAULT_FEATURE_KEYS,
    foldCount: 5,
    training: {
      epochs: 1800,
      learningRate: 0.04,
      l2Lambda: 0.001,
    },
  });

  const modelArtifact = buildModelArtifact({ trained, datasetSource, sampleRows: rows });
  const metricsArtifact = buildMetricsArtifact({ trained, datasetSource });
  writeArtifacts({ modelArtifact, metricsArtifact });

  const summary = {
    model: defaultOutputPaths.backendModel,
    metrics: defaultOutputPaths.backendMetrics,
    frontend: defaultOutputPaths.frontendModelJson,
    auc_pr: modelArtifact.metrics.auc_pr,
    brier_calibrated: modelArtifact.metrics.brier_calibrated,
    ece_calibrated: modelArtifact.metrics.ece_calibrated,
    monotonic_sign_ok: trained.monotonic_sign_ok,
  };

  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  main();
}

module.exports = {
  buildSyntheticDataset,
};
