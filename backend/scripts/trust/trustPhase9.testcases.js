const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  PATHS,
  loadRegistry,
  bumpSemver,
  toModelVersionLabel,
} = require('./trustOptimizationUtils');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runNodeScript = (scriptPath, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    shell: false,
  });

  return result;
};

const createEmergencyMonitoringFixture = () => {
  const filePath = path.join(os.tmpdir(), `trust-monitoring-fixture-${Date.now()}.json`);
  const fixture = {
    generated_at: new Date().toISOString(),
    fallback_rate: 0.45,
    prediction_drift_psi: 0.35,
    business_loss_increase_pct: 0.22,
    metrics: {
      calibration_shift: 0.09,
      brier_degradation: 0.05,
    },
    feature_drift: {
      due_amount: {
        mean_shift: 0.8,
        variance_shift: 0.7,
      },
    },
  };

  fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return filePath;
};

const createMonitoringOutputPath = () => {
  return path.join(os.tmpdir(), `trust-monitoring-output-${Date.now()}.json`);
};

const parseJsonOutput = (stdout) => {
  try {
    return JSON.parse(stdout);
  } catch (_error) {
    return null;
  }
};

const parseArgs = () => {
  const includeMonthlyByEnv = String(process.env.TRUST_PHASE9_INCLUDE_MONTHLY || '').trim().toLowerCase() === 'true';
  const parsed = {
    includeMonthly: includeMonthlyByEnv,
  };

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--include-monthly') {
      parsed.includeMonthly = true;
    }
  }

  return parsed;
};

const main = () => {
  const args = parseArgs();
  const registry = loadRegistry();
  assert(registry && typeof registry === 'object', 'registry must be available');

  const bumpedMinor = bumpSemver('1.0.0', 'minor');
  assert(bumpedMinor === '1.1.0', 'minor semver bump must be 1.1.0');

  const label = toModelVersionLabel('2.3.0');
  assert(label === 'trust_model_v2.3', 'model version label format mismatch');

  const emergencyScript = path.join(__dirname, 'runEmergencyTrustUpdate.js');
  const ingestScript = path.join(__dirname, 'ingestTrustMonitoringSnapshot.js');
  const monitoringFixturePath = createEmergencyMonitoringFixture();
  const monitoringOutputPath = createMonitoringOutputPath();

  try {
    const ingestRun = runNodeScript(ingestScript, [
      '--input',
      monitoringFixturePath,
      '--source',
      'phase9_smoke_test',
      '--output',
      monitoringOutputPath,
    ]);
    assert(ingestRun.status === 0, `monitoring ingestion failed: ${ingestRun.stderr || ingestRun.stdout}`);
    const ingestedSummary = parseJsonOutput(ingestRun.stdout);
    assert(ingestedSummary && Number.isFinite(Number(ingestedSummary.request_count)), 'ingested monitoring summary missing request_count');

    assert(
      path.resolve(String(ingestedSummary.output_path || '')) === path.resolve(monitoringOutputPath),
      'ingested monitoring output path must match temporary output path'
    );

    const emergencyRun = runNodeScript(emergencyScript, ['--monitoring', monitoringFixturePath, '--dry-run']);
    assert(emergencyRun.status === 0, `emergency dry-run failed: ${emergencyRun.stderr || emergencyRun.stdout}`);

    const emergencySummary = parseJsonOutput(emergencyRun.stdout);
    assert(emergencySummary && emergencySummary.triggered === true, 'emergency trigger must be true in dry-run simulation');

    let monthlySummary = {
      skipped: true,
      reason: 'monthly_recalibration_skipped_by_default_to_avoid_artifact_mutation',
    };

    if (args.includeMonthly) {
      const monthlyScript = path.join(__dirname, 'runMonthlyTrustRecalibration.js');
      const monthlyRun = runNodeScript(monthlyScript, []);
      assert(monthlyRun.status === 0, `monthly recalibration failed: ${monthlyRun.stderr || monthlyRun.stdout}`);

      monthlySummary = parseJsonOutput(monthlyRun.stdout);
      assert(monthlySummary && monthlySummary.bundle_version, 'monthly recalibration summary must include bundle version');
    }

    assert(fs.existsSync(PATHS.optimizationRegistry), 'optimization registry artifact must exist');

    console.log(JSON.stringify({
      passed: true,
      include_monthly: args.includeMonthly,
      ingested_monitoring_summary: ingestedSummary,
      emergency_summary: emergencySummary,
      monthly_summary: monthlySummary,
      registry_path: PATHS.optimizationRegistry,
    }, null, 2));
  } finally {
    if (fs.existsSync(monitoringFixturePath)) {
      fs.unlinkSync(monitoringFixturePath);
    }

    if (fs.existsSync(monitoringOutputPath)) {
      fs.unlinkSync(monitoringOutputPath);
    }
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_PHASE9_TESTS] failed: ${error?.message || error}`);
    process.exit(1);
  }
}
