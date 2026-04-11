const { spawnSync } = require('child_process');
const path = require('path');

const {
  ROOT_DIR,
  PATHS,
  REPORTS_DIR,
  readJson,
  writeJson,
  writeText,
  nowIso,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
  stringifyReportHeader,
} = require('./trustOptimizationUtils');

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseCliArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    monitoringPath: '',
    datasetPath: '',
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--monitoring' && args[index + 1]) {
      parsed.monitoringPath = args[index + 1];
      index += 1;
      continue;
    }

    if (token === '--dataset' && args[index + 1]) {
      parsed.datasetPath = args[index + 1];
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      parsed.dryRun = true;
    }
  }

  return parsed;
};

const runCommand = ({ command, args, cwd, label }) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error([
      `[${label}] failed`,
      `command: ${command} ${args.join(' ')}`,
      result.stdout || '',
      result.stderr || '',
    ].join('\n'));
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const loadMonitoringSnapshot = (monitoringPathArg) => {
  if (monitoringPathArg) {
    return readJson(path.resolve(monitoringPathArg), null);
  }

  return readJson(PATHS.monitoringSnapshot, null);
};

const evaluateEmergencyTriggers = ({ snapshot, guardrails }) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      triggered: false,
      reasons: ['monitoring_snapshot_missing'],
    };
  }

  const thresholds = guardrails?.triggers || {};
  const reasons = [];

  const fallbackRate = toFinite(snapshot.fallback_rate, 0);
  const calibrationShift = toFinite(snapshot?.metrics?.calibration_shift, 0);
  const brierDegradation = toFinite(snapshot?.metrics?.brier_degradation, 0);
  const predictionDriftPsi = toFinite(snapshot.prediction_drift_psi, 0);
  const businessLossIncrease = toFinite(snapshot.business_loss_increase_pct, 0);

  const featureDrift = snapshot.feature_drift || {};
  let featureDriftBreached = false;
  for (const drift of Object.values(featureDrift)) {
    if (
      toFinite(drift?.mean_shift, 0) > toFinite(thresholds.feature_mean_shift_max, 0.35)
      || toFinite(drift?.variance_shift, 0) > toFinite(thresholds.feature_variance_shift_max, 0.5)
    ) {
      featureDriftBreached = true;
      break;
    }
  }

  if (featureDriftBreached) {
    reasons.push('feature_drift_exceeds_threshold');
  }

  if (predictionDriftPsi > toFinite(thresholds.prediction_drift_psi_max, 0.25)) {
    reasons.push('prediction_drift_exceeds_threshold');
  }

  if (calibrationShift > toFinite(thresholds.calibration_shift_max, 0.05)) {
    reasons.push('calibration_shift_exceeds_threshold');
  }

  if (brierDegradation > toFinite(thresholds.brier_degradation_max, 0.02)) {
    reasons.push('brier_degradation_exceeds_threshold');
  }

  if (fallbackRate > toFinite(thresholds.fallback_rate_max, 0.3)) {
    reasons.push('fallback_rate_exceeds_threshold');
  }

  if (businessLossIncrease > toFinite(thresholds.business_loss_increase_pct_max, 0.1)) {
    reasons.push('business_loss_increase_exceeds_threshold');
  }

  return {
    triggered: reasons.length > 0,
    reasons,
  };
};

const createEmergencyMarkdown = (report) => {
  let markdown = stringifyReportHeader({
    title: 'Trust Emergency Optimization Report',
    metadata: {
      generated_at: report.generated_at,
      triggered: report.triggered,
      dry_run: report.dry_run,
      trigger_reasons: report.trigger_reasons.join(', ') || 'none',
    },
  });

  markdown += '## Trigger Assessment\n\n';
  report.trigger_reasons.forEach((reason) => {
    markdown += `- ${reason}\n`;
  });
  if (report.trigger_reasons.length === 0) {
    markdown += '- no emergency trigger conditions met\n';
  }

  markdown += '\n## Actions\n\n';
  report.actions.forEach((action) => {
    markdown += `- ${action}\n`;
  });

  return markdown;
};

const main = () => {
  const args = parseCliArgs();
  const guardrails = readJson(PATHS.optimizationGuardrails, null) || {};
  const monitoringSnapshot = loadMonitoringSnapshot(args.monitoringPath);
  const triggerResult = evaluateEmergencyTriggers({
    snapshot: monitoringSnapshot,
    guardrails,
  });

  const generatedAt = nowIso();
  const report = {
    event_type: 'emergency_optimization',
    generated_at: generatedAt,
    triggered: triggerResult.triggered,
    trigger_reasons: triggerResult.reasons,
    monitoring_snapshot_path: args.monitoringPath || PATHS.monitoringSnapshot,
    dry_run: args.dryRun,
    actions: [],
  };

  if (!triggerResult.triggered) {
    report.actions.push('No emergency retraining required. Monitoring continues.');
  }

  if (triggerResult.triggered && args.dryRun) {
    report.actions.push('Emergency trigger detected. Dry run mode: no jobs executed.');
  }

  if (triggerResult.triggered && !args.dryRun) {
    const monthlyScript = path.join(ROOT_DIR, 'backend', 'scripts', 'trust', 'runMonthlyTrustRecalibration.js');
    const quarterlyScript = path.join(ROOT_DIR, 'backend', 'scripts', 'trust', 'runQuarterlyTrustRetraining.js');

    const monthlyArgs = [monthlyScript];
    const quarterlyArgs = [quarterlyScript];
    if (args.datasetPath) {
      monthlyArgs.push(args.datasetPath);
      quarterlyArgs.push(args.datasetPath);
    }

    runCommand({
      command: process.execPath,
      args: monthlyArgs,
      cwd: ROOT_DIR,
      label: 'EMERGENCY_MONTHLY_RECALIBRATION',
    });
    report.actions.push('Monthly recalibration executed.');

    runCommand({
      command: process.execPath,
      args: quarterlyArgs,
      cwd: ROOT_DIR,
      label: 'EMERGENCY_QUARTERLY_RETRAINING',
    });
    report.actions.push('Quarterly retraining pipeline executed as emergency update.');
  }

  const reportJsonPath = path.join(REPORTS_DIR, `trustEmergencyUpdate.${generatedAt.replace(/[:.]/g, '-')}.json`);
  const reportMdPath = path.join(REPORTS_DIR, `trustEmergencyUpdate.${generatedAt.replace(/[:.]/g, '-')}.md`);
  writeJson(reportJsonPath, report);
  writeText(reportMdPath, createEmergencyMarkdown(report));

  let registry = loadRegistry();
  registry = appendRegistryEvent(registry, {
    type: triggerResult.triggered ? 'EMERGENCY_UPDATE_TRIGGERED' : 'EMERGENCY_UPDATE_CHECK_NOOP',
    reasons: triggerResult.reasons,
    report_json: reportJsonPath,
    report_md: reportMdPath,
    dry_run: args.dryRun,
  });
  saveRegistry(registry);

  console.log(JSON.stringify({
    event_type: report.event_type,
    triggered: report.triggered,
    trigger_reasons: report.trigger_reasons,
    dry_run: report.dry_run,
    report_json: reportJsonPath,
    report_markdown: reportMdPath,
  }, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_EMERGENCY_UPDATE] failed: ${error?.message || error}`);
    process.exit(1);
  }
}
