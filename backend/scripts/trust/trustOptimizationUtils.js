const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..', '..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'backend', 'artifacts');
const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');

const PATHS = {
  championModel: path.join(ARTIFACTS_DIR, 'trustChampionModel.v1.json'),
  championMetrics: path.join(ARTIFACTS_DIR, 'trustChampionModel.metrics.v1.json'),
  challengerModel: path.join(ARTIFACTS_DIR, 'trustChallengerModel.v1.json'),
  challengerMetrics: path.join(ARTIFACTS_DIR, 'trustChallengerModel.metrics.v1.json'),
  promotionReport: path.join(ARTIFACTS_DIR, 'trustBacktestReport.v1.json'),
  promotionDecisions: path.join(ARTIFACTS_DIR, 'trustSegmentPromotion.v1.json'),
  optimizationRegistry: path.join(ARTIFACTS_DIR, 'trustModelRegistry.v1.json'),
  optimizationState: path.join(ARTIFACTS_DIR, 'trustOptimizationState.v1.json'),
  optimizationGuardrails: path.join(ARTIFACTS_DIR, 'trustOptimizationGuardrails.v1.json'),
  monitoringSnapshot: path.join(ARTIFACTS_DIR, 'trustMonitoringSnapshot.v1.json'),
  promotionAuditLog: path.join(ARTIFACTS_DIR, 'trustPromotionAuditLog.v1.json'),
  activeBundle: path.join(ARTIFACTS_DIR, 'trustActiveBundle.v1.json'),
};

const ensureDir = (targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });
};

const ensureParentDir = (filePath) => {
  ensureDir(path.dirname(filePath));
};

const readJson = (filePath, fallback = null) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (_error) {
    return fallback;
  }
};

const writeJson = (filePath, payload) => {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const writeText = (filePath, text) => {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, text, 'utf8');
};

const nowIso = () => new Date().toISOString();

const parseSemver = (value) => {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return { major: 1, minor: 0, patch: 0 };
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const toSemverString = ({ major, minor, patch }) => `${major}.${minor}.${patch}`;

const bumpSemver = (version, type = 'patch') => {
  const parsed = parseSemver(version);

  if (type === 'major') {
    return toSemverString({ major: parsed.major + 1, minor: 0, patch: 0 });
  }

  if (type === 'minor') {
    return toSemverString({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }

  return toSemverString({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
};

const compareSemver = (a, b) => {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  if (pa.major !== pb.major) {
    return pa.major - pb.major;
  }

  if (pa.minor !== pb.minor) {
    return pa.minor - pb.minor;
  }

  return pa.patch - pb.patch;
};

const resolveLatestBundleVersion = (registry) => {
  const candidates = [];
  if (registry?.active_bundle?.bundle_version) {
    candidates.push(String(registry.active_bundle.bundle_version));
  }

  for (const key of Object.keys(registry?.bundles || {})) {
    candidates.push(String(key));
  }

  if (candidates.length === 0) {
    return '1.0.0';
  }

  return candidates.sort(compareSemver).at(-1);
};

const toModelVersionLabel = (semver) => {
  const parsed = parseSemver(semver);
  return `trust_model_v${parsed.major}.${parsed.minor}`;
};

const fileDigest = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
};

const defaultRegistry = () => ({
  schema_version: '1.0.0',
  created_at: nowIso(),
  updated_at: nowIso(),
  active_bundle: {
    bundle_version: '1.0.0',
    model_version_label: toModelVersionLabel('1.0.0'),
    champion_version: '1.0.0',
    challenger_version: '1.0.0',
    promotion_decision_version: '1.0.0',
  },
  active_history: [],
  bundles: {},
  events: [],
});

const loadRegistry = () => {
  const loaded = readJson(PATHS.optimizationRegistry, null);
  if (!loaded) {
    const initial = defaultRegistry();
    writeJson(PATHS.optimizationRegistry, initial);
    return initial;
  }

  return loaded;
};

const saveRegistry = (registry) => {
  const next = {
    ...registry,
    updated_at: nowIso(),
  };
  writeJson(PATHS.optimizationRegistry, next);
  return next;
};

const appendRegistryEvent = (registry, event) => {
  const events = Array.isArray(registry.events) ? [...registry.events] : [];
  events.push({
    timestamp: nowIso(),
    ...event,
  });

  while (events.length > 500) {
    events.shift();
  }

  return {
    ...registry,
    events,
  };
};

const copyFile = (fromPath, toPath) => {
  ensureParentDir(toPath);
  fs.copyFileSync(fromPath, toPath);
};

const stringifyReportHeader = ({ title, metadata = {} }) => {
  const lines = [`# ${title}`, ''];
  for (const [key, value] of Object.entries(metadata)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
};

const resolveVersionedArtifactPath = (artifactPrefix, semver, extension = 'json') => {
  return path.join(ARTIFACTS_DIR, `${artifactPrefix}.v${semver}.${extension}`);
};

module.exports = {
  ROOT_DIR,
  ARTIFACTS_DIR,
  REPORTS_DIR,
  PATHS,
  ensureDir,
  ensureParentDir,
  readJson,
  writeJson,
  writeText,
  nowIso,
  parseSemver,
  toSemverString,
  bumpSemver,
  compareSemver,
  resolveLatestBundleVersion,
  toModelVersionLabel,
  fileDigest,
  defaultRegistry,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
  copyFile,
  stringifyReportHeader,
  resolveVersionedArtifactPath,
};
