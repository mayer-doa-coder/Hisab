const path = require('path');

const TRUST_OBJECTIVE_CONFIG_PATH = path.join(__dirname, 'trustObjective.json');
const TRUST_OBJECTIVE_CONFIG = require('./trustObjective.json');

const ALIASES = Object.freeze({
  '1d': '1_day',
  '1_day': '1_day',
  '1w': '1_week',
  '1_week': '1_week',
  '7d': '1_week',
  '1m': '1_month',
  '1_month': '1_month',
  '30d': '1_month',
  '3m': '3_month',
  '3_month': '3_month',
  '90d': '3_month',
});

const TRUST_HORIZON_KEYS = Object.freeze([
  '1_day',
  '1_week',
  '1_month',
  '3_month',
]);

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const normalizeTrustHorizon = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) {
    return TRUST_OBJECTIVE_CONFIG.default_horizon;
  }

  return ALIASES[key] || null;
};

const getTrustHorizonDefinition = (horizonKey) => {
  const normalizedKey = normalizeTrustHorizon(horizonKey);
  if (!normalizedKey) {
    return null;
  }

  const definition = TRUST_OBJECTIVE_CONFIG?.horizons?.[normalizedKey] || null;
  return definition ? deepClone(definition) : null;
};

const getTrustObjectiveConfig = () => deepClone(TRUST_OBJECTIVE_CONFIG);

const validateTrustObjectiveConfig = () => {
  if (!TRUST_OBJECTIVE_CONFIG || typeof TRUST_OBJECTIVE_CONFIG !== 'object') {
    throw new Error('Trust objective config is missing or invalid.');
  }

  if (TRUST_OBJECTIVE_CONFIG.locked !== true) {
    throw new Error('Trust objective config must be locked for Phase 0.');
  }

  for (const key of TRUST_HORIZON_KEYS) {
    const definition = TRUST_OBJECTIVE_CONFIG?.horizons?.[key];
    if (!definition) {
      throw new Error(`Missing trust horizon definition: ${key}`);
    }

    if (!definition?.metrics_thresholds) {
      throw new Error(`Missing metrics thresholds for horizon: ${key}`);
    }

    if (!definition?.label_definitions) {
      throw new Error(`Missing label definitions for horizon: ${key}`);
    }
  }
};

validateTrustObjectiveConfig();

module.exports = {
  TRUST_OBJECTIVE_CONFIG_PATH,
  TRUST_OBJECTIVE_CONFIG,
  TRUST_HORIZON_KEYS,
  normalizeTrustHorizon,
  getTrustHorizonDefinition,
  getTrustObjectiveConfig,
};
