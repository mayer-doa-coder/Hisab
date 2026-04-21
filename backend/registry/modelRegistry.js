const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'artifacts', 'modelRegistry.json');
const MONITORING_LOG_PATH = path.join(__dirname, '..', 'artifacts', 'modelMonitoring.log');

const VERSION_PATTERN = /^markov_model_v(\d+)\.(\d+)$/i;

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const nowIso = () => new Date().toISOString();

const ensureArtifactsDir = () => {
  const directory = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const createDefaultRegistry = () => ({
  schema_version: 'model_registry_v1',
  updated_at: nowIso(),
  active_version: null,
  previous_version: null,
  versions: [],
  history: [],
});

const readJsonFileOrDefault = (filePath, fallbackFactory) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackFactory();
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return fallbackFactory();
    }

    return JSON.parse(raw);
  } catch (error) {
    return fallbackFactory();
  }
};

const writeJsonFile = (filePath, payload) => {
  ensureArtifactsDir();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
};

const appendJsonLogLine = (filePath, payload) => {
  ensureArtifactsDir();
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
};

const parseVersion = (version) => {
  const token = String(version || '').trim();
  const match = token.match(VERSION_PATTERN);
  if (!match) {
    return null;
  }

  return {
    raw: token,
    major: Number(match[1]),
    minor: Number(match[2]),
  };
};

const isValidVersionFormat = (version) => parseVersion(version) !== null;

const assertValidVersion = (version) => {
  if (!isValidVersionFormat(version)) {
    throw new Error('Invalid model version format. Expected markov_model_v<major>.<minor>.');
  }
};

const loadRegistry = () => {
  const registry = readJsonFileOrDefault(REGISTRY_PATH, createDefaultRegistry);
  if (!registry || typeof registry !== 'object') {
    return createDefaultRegistry();
  }

  registry.versions = Array.isArray(registry.versions) ? registry.versions : [];
  registry.history = Array.isArray(registry.history) ? registry.history : [];
  registry.schema_version = registry.schema_version || 'model_registry_v1';
  registry.updated_at = registry.updated_at || nowIso();

  return registry;
};

const saveRegistry = (registry) => {
  const next = {
    ...registry,
    updated_at: nowIso(),
  };
  writeJsonFile(REGISTRY_PATH, next);
  return next;
};

const normalizeCalibrationLayer = (calibrationLayer = null) => {
  if (!calibrationLayer || typeof calibrationLayer !== 'object') {
    return {
      method: 'none',
      version: 'calibration_v0',
      updated_at: nowIso(),
    };
  }

  return {
    method: String(calibrationLayer.method || 'custom').trim().toLowerCase(),
    version: String(calibrationLayer.version || 'calibration_v1').trim(),
    params: deepClone(calibrationLayer.params || {}),
    updated_at: calibrationLayer.updated_at || nowIso(),
  };
};

const buildModelSnapshot = ({ model, calibrationLayer = null } = {}) => {
  if (!model || typeof model !== 'object') {
    throw new Error('Model snapshot requires a valid model object.');
  }

  return {
    states: deepClone(model.states || []),
    model_parameters: deepClone(model.config_snapshot || {}),
    transition_matrices: {
      global: deepClone(model.global_matrix || {}),
      regime: deepClone(model.regime_matrices || {}),
    },
    calibration_layer: normalizeCalibrationLayer(calibrationLayer),
    config_snapshot: deepClone(model.config_snapshot || {}),
    conditional_extension: deepClone(model.conditional_extension || {}),
    model_metadata: deepClone(model.metadata || {}),
  };
};

const getVersionEntry = (version) => {
  const registry = loadRegistry();
  return registry.versions.find((item) => String(item.version || '').trim() === String(version || '').trim()) || null;
};

const listModelVersions = () => {
  const registry = loadRegistry();
  return {
    active_version: registry.active_version || null,
    previous_version: registry.previous_version || null,
    versions: deepClone(registry.versions),
    updated_at: registry.updated_at,
  };
};

const registerModelVersion = ({
  version,
  model,
  calibrationLayer = null,
  performanceMetrics = null,
  metadata = null,
  trainingTimestamp = null,
  activate = false,
  createdBy = 'system',
  mode = 'retrained',
} = {}) => {
  assertValidVersion(version);

  const registry = loadRegistry();
  const snapshot = buildModelSnapshot({ model, calibrationLayer });

  const entry = {
    version: String(version).trim(),
    training_timestamp: trainingTimestamp || nowIso(),
    created_at: nowIso(),
    created_by: String(createdBy || 'system').trim(),
    lifecycle_mode: String(mode || 'retrained').trim().toLowerCase(),
    performance_metrics: deepClone(performanceMetrics || {}),
    metadata: deepClone(metadata || {}),
    snapshot,
  };

  const index = registry.versions.findIndex((item) => item.version === entry.version);
  if (index >= 0) {
    registry.versions[index] = entry;
  } else {
    registry.versions.push(entry);
  }

  if (activate) {
    registry.previous_version = registry.active_version || registry.previous_version || null;
    registry.active_version = entry.version;
  }

  registry.history.push({
    event: 'register_version',
    version: entry.version,
    activate: Boolean(activate),
    at: nowIso(),
  });

  saveRegistry(registry);
  return entry;
};

const setActiveModelVersion = ({ version, reason = 'manual_activation' } = {}) => {
  assertValidVersion(version);

  const registry = loadRegistry();
  const exists = registry.versions.some((item) => item.version === version);
  if (!exists) {
    throw new Error(`Model version not found: ${version}`);
  }

  if (registry.active_version !== version) {
    registry.previous_version = registry.active_version || registry.previous_version || null;
    registry.active_version = version;
  }

  registry.history.push({
    event: 'activate_version',
    version,
    reason: String(reason || 'manual_activation').trim(),
    at: nowIso(),
  });

  saveRegistry(registry);
  return {
    active_version: registry.active_version,
    previous_version: registry.previous_version,
  };
};

const rollbackToPreviousVersion = ({ reason = 'automatic_rollback' } = {}) => {
  const registry = loadRegistry();
  const targetVersion = registry.previous_version;

  if (!targetVersion) {
    return {
      rolled_back: false,
      active_version: registry.active_version || null,
      previous_version: registry.previous_version || null,
      reason: 'no_previous_version_available',
    };
  }

  const exists = registry.versions.some((item) => item.version === targetVersion);
  if (!exists) {
    return {
      rolled_back: false,
      active_version: registry.active_version || null,
      previous_version: registry.previous_version || null,
      reason: 'previous_version_not_found',
    };
  }

  const current = registry.active_version;
  registry.active_version = targetVersion;
  registry.previous_version = current || null;

  registry.history.push({
    event: 'rollback',
    from_version: current || null,
    to_version: targetVersion,
    reason: String(reason || 'automatic_rollback').trim(),
    at: nowIso(),
  });

  saveRegistry(registry);

  return {
    rolled_back: true,
    active_version: registry.active_version,
    previous_version: registry.previous_version,
    reason: String(reason || 'automatic_rollback').trim(),
  };
};

const getActiveVersionEntry = () => {
  const registry = loadRegistry();
  if (!registry.active_version) {
    return null;
  }
  return registry.versions.find((item) => item.version === registry.active_version) || null;
};

const applyVersionSnapshotToModel = (model, versionEntry) => {
  if (!model || typeof model !== 'object') {
    return model;
  }

  const entry = versionEntry || getActiveVersionEntry();
  if (!entry?.snapshot) {
    return model;
  }

  const next = {
    ...model,
    states: deepClone(entry.snapshot.states || model.states || []),
    global_matrix: deepClone(entry.snapshot.transition_matrices?.global || model.global_matrix || {}),
    regime_matrices: deepClone(entry.snapshot.transition_matrices?.regime || model.regime_matrices || {}),
    config_snapshot: deepClone(entry.snapshot.config_snapshot || model.config_snapshot || {}),
    conditional_extension: deepClone(entry.snapshot.conditional_extension || model.conditional_extension || {}),
    registry_version: entry.version,
    calibration_layer: deepClone(entry.snapshot.calibration_layer || {}),
  };

  return next;
};

const recordMonitoringEvent = ({
  eventType,
  modelVersion = null,
  userId = null,
  endpoint = null,
  latencyMs = null,
  fallbackRate = null,
  errorRate = null,
  payload = null,
} = {}) => {
  const record = {
    timestamp: nowIso(),
    event_type: String(eventType || 'unknown').trim().toLowerCase(),
    model_version: modelVersion || null,
    user_id: userId ? String(userId) : null,
    endpoint: endpoint ? String(endpoint) : null,
    latency_ms: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    fallback_rate: Number.isFinite(Number(fallbackRate)) ? Number(fallbackRate) : null,
    error_rate: Number.isFinite(Number(errorRate)) ? Number(errorRate) : null,
    payload: deepClone(payload || {}),
  };

  appendJsonLogLine(MONITORING_LOG_PATH, record);
  return record;
};

const readMonitoringLog = ({ limit = 200 } = {}) => {
  ensureArtifactsDir();
  if (!fs.existsSync(MONITORING_LOG_PATH)) {
    return [];
  }

  const raw = fs.readFileSync(MONITORING_LOG_PATH, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(1, Math.trunc(Number(limit) || 200)));

  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch (error) {
      parsed.push({
        timestamp: nowIso(),
        event_type: 'parse_error',
        payload: { line },
      });
    }
  }

  return parsed;
};

const getMonitoringSummary = ({ limit = 500 } = {}) => {
  const events = readMonitoringLog({ limit });
  const usageEvents = events.filter((item) => item.event_type === 'model_usage');

  const average = (values) => {
    const valid = values.filter((value) => Number.isFinite(value));
    if (valid.length === 0) {
      return null;
    }
    return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(6));
  };

  return {
    sample_size: usageEvents.length,
    avg_latency_ms: average(usageEvents.map((item) => Number(item.latency_ms))),
    avg_fallback_rate: average(usageEvents.map((item) => Number(item.fallback_rate))),
    avg_error_rate: average(usageEvents.map((item) => Number(item.error_rate))),
    by_model_version: usageEvents.reduce((acc, item) => {
      const key = String(item.model_version || 'unversioned');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    recent_events: events.slice(-20),
  };
};

module.exports = {
  REGISTRY_PATH,
  MONITORING_LOG_PATH,
  isValidVersionFormat,
  parseVersion,
  loadRegistry,
  listModelVersions,
  getVersionEntry,
  getActiveVersionEntry,
  registerModelVersion,
  setActiveModelVersion,
  rollbackToPreviousVersion,
  applyVersionSnapshotToModel,
  recordMonitoringEvent,
  readMonitoringLog,
  getMonitoringSummary,
};
