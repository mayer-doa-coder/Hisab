const fs = require('fs');

const {
  PATHS,
  nowIso,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
  parseSemver,
  compareSemver,
  readJson,
  writeJson,
} = require('./trustOptimizationUtils');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    bundleVersion: '',
    maxMonitoringAgeHours: Number(process.env.TRUST_MONITORING_MAX_AGE_HOURS || 48),
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--bundle' && args[index + 1]) {
      parsed.bundleVersion = String(args[index + 1]).trim();
      index += 1;
      continue;
    }

    if (token === '--max-monitoring-age-hours' && args[index + 1]) {
      const numeric = Number(args[index + 1]);
      if (Number.isFinite(numeric) && numeric > 0) {
        parsed.maxMonitoringAgeHours = numeric;
      }
      index += 1;
    }
  }

  return parsed;
};

const getLatestCandidateVersion = (registry) => {
  const candidates = Object.entries(registry?.bundles || {})
    .filter(([, bundle]) => {
      const status = String(bundle?.deployment_status || bundle?.lifecycle_state || '').toLowerCase();
      return status.startsWith('candidate');
    })
    .map(([version]) => version)
    .sort(compareSemver);

  return candidates.length ? candidates[candidates.length - 1] : '';
};

const isGatePass = (value) => value === true;

const checkArtifacts = (bundle = {}) => {
  const missing = [];
  const artifactPaths = [];

  if (bundle?.artifacts?.champion_model?.path) {
    artifactPaths.push(bundle.artifacts.champion_model.path);
  }
  if (bundle?.artifacts?.challenger_model?.path) {
    artifactPaths.push(bundle.artifacts.challenger_model.path);
  }
  if (bundle?.artifacts?.backtest_report?.path) {
    artifactPaths.push(bundle.artifacts.backtest_report.path);
  }
  if (bundle?.artifacts?.segment_decisions?.path) {
    artifactPaths.push(bundle.artifacts.segment_decisions.path);
  }

  for (const artifactPath of artifactPaths) {
    if (!fs.existsSync(artifactPath)) {
      missing.push(artifactPath);
    }
  }

  return {
    artifact_count: artifactPaths.length,
    missing,
    pass: missing.length === 0 && artifactPaths.length >= 2,
  };
};

const checkMonitoringFreshness = ({ maxMonitoringAgeHours }) => {
  const snapshot = readJson(PATHS.monitoringSnapshot, null);
  if (!snapshot) {
    return {
      pass: false,
      reason: 'monitoring_snapshot_missing',
      generated_at: null,
      age_hours: null,
    };
  }

  const generatedAt = new Date(snapshot.generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    return {
      pass: false,
      reason: 'monitoring_snapshot_invalid_timestamp',
      generated_at: snapshot.generated_at || null,
      age_hours: null,
    };
  }

  const ageHours = (Date.now() - generatedAt.getTime()) / (60 * 60 * 1000);
  return {
    pass: ageHours <= maxMonitoringAgeHours,
    reason: ageHours <= maxMonitoringAgeHours ? 'ok' : 'monitoring_snapshot_stale',
    generated_at: generatedAt.toISOString(),
    age_hours: Number(ageHours.toFixed(3)),
  };
};

const appendAudit = (entry) => {
  const current = readJson(PATHS.promotionAuditLog, []);
  const next = Array.isArray(current) ? [...current, entry] : [entry];
  while (next.length > 1000) {
    next.shift();
  }
  writeJson(PATHS.promotionAuditLog, next);
};

const main = () => {
  const args = parseArgs();
  const registry = loadRegistry();

  const bundleVersion = args.bundleVersion || getLatestCandidateVersion(registry);
  if (!bundleVersion) {
    throw new Error('No candidate bundle found. Run quarterly retraining first.');
  }

  const bundle = registry?.bundles?.[bundleVersion];
  if (!bundle) {
    throw new Error(`Bundle ${bundleVersion} was not found in registry.`);
  }

  const semver = parseSemver(bundleVersion);
  if (!Number.isInteger(semver.major)) {
    throw new Error(`Invalid bundle semver: ${bundleVersion}`);
  }

  const gateChecks = {
    objective_pass: isGatePass(bundle?.gate_results?.objective?.pass),
    phase7_pass: isGatePass(bundle?.gate_results?.phase7?.pass),
    phase8_pass: isGatePass(bundle?.gate_results?.phase8?.pass),
  };

  const artifactCheck = checkArtifacts(bundle);
  const monitoringCheck = checkMonitoringFreshness({
    maxMonitoringAgeHours: args.maxMonitoringAgeHours,
  });

  const blockedByStatus = String(bundle?.deployment_status || '').toLowerCase() === 'candidate_blocked_by_gates';
  const pass = !blockedByStatus
    && gateChecks.objective_pass
    && gateChecks.phase7_pass
    && gateChecks.phase8_pass
    && artifactCheck.pass
    && monitoringCheck.pass;

  const validatedAt = nowIso();

  const summary = {
    bundle_version: bundleVersion,
    deployment_status_before: bundle.deployment_status || null,
    checks: {
      ...gateChecks,
      artifacts_pass: artifactCheck.pass,
      monitoring_freshness_pass: monitoringCheck.pass,
      blocked_by_status: blockedByStatus,
    },
    artifact_check: artifactCheck,
    monitoring_check: monitoringCheck,
    validated: pass,
    validated_at: pass ? validatedAt : null,
  };

  if (pass) {
    registry.bundles[bundleVersion] = {
      ...bundle,
      deployment_status: 'validated_bundle',
      lifecycle_state: 'validated_bundle',
      validated_at: validatedAt,
    };

    const nextRegistry = appendRegistryEvent(registry, {
      type: 'BUNDLE_VALIDATED',
      bundle_version: bundleVersion,
      validated_at: validatedAt,
      checks: summary.checks,
    });
    saveRegistry(nextRegistry);
  }

  appendAudit({
    timestamp: nowIso(),
    action: 'VALIDATE_BUNDLE',
    actor: 'automation',
    ...summary,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (!pass) {
    process.exitCode = 2;
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_VALIDATE_BUNDLE] failed: ${error?.message || error}`);
    process.exit(1);
  }
}