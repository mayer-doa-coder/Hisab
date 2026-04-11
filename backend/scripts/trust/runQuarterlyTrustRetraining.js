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
  bumpSemver,
  resolveLatestBundleVersion,
  toModelVersionLabel,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
  resolveVersionedArtifactPath,
  fileDigest,
  stringifyReportHeader,
  copyFile,
} = require('./trustOptimizationUtils');

const TRUST_OBJECTIVE_GATES = {
  auc_pr_min: 0.5,
  recall_at_precision_90_min: 0.3,
  brier_max: 0.18,
  ece_max: 0.06,
  business_loss_reduction_min: 0.15,
};

const toFinite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const runCommand = ({ command, args, cwd, label }) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    const errorMessage = [
      `[${label}] command failed`,
      `command: ${command} ${args.join(' ')}`,
      result.stdout || '',
      result.stderr || '',
    ].join('\n');
    throw new Error(errorMessage);
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const summarizeObjectiveGates = ({ championModel, challengerModel }) => {
  const championMetrics = championModel?.metrics || {};
  const challengerMetrics = challengerModel?.metrics || {};
  const challengerComparison = challengerModel?.comparison_vs_champion || {};

  const checks = {
    champion_auc_pr_ok: toFinite(championMetrics.auc_pr, 0) >= TRUST_OBJECTIVE_GATES.auc_pr_min,
    champion_recall_p90_ok:
      toFinite(championMetrics.recall_at_precision_90, 0) >= TRUST_OBJECTIVE_GATES.recall_at_precision_90_min,
    champion_brier_ok: toFinite(championMetrics.brier_calibrated, 1) <= TRUST_OBJECTIVE_GATES.brier_max,
    champion_ece_ok: toFinite(championMetrics.ece_calibrated, 1) <= TRUST_OBJECTIVE_GATES.ece_max,
    challenger_auc_pr_ok: toFinite(challengerMetrics.auc_pr, 0) >= TRUST_OBJECTIVE_GATES.auc_pr_min,
    challenger_recall_p90_ok:
      toFinite(challengerMetrics.recall_at_precision_90, 0) >= TRUST_OBJECTIVE_GATES.recall_at_precision_90_min,
    challenger_brier_ok: toFinite(challengerMetrics.brier_calibrated, 1) <= TRUST_OBJECTIVE_GATES.brier_max,
    challenger_ece_ok: toFinite(challengerMetrics.ece_calibrated, 1) <= TRUST_OBJECTIVE_GATES.ece_max,
    business_loss_reduction_ok:
      toFinite(challengerComparison.estimated_loss_reduction_vs_champion, 0)
      >= TRUST_OBJECTIVE_GATES.business_loss_reduction_min,
  };

  const diagnostics = [];
  if (!checks.champion_ece_ok || !checks.challenger_ece_ok) {
    diagnostics.push({
      category: 'miscalibration',
      message: 'ECE gate failed. Recalibration with stronger shrinkage/blending is required.',
      champion_ece: toFinite(championMetrics.ece_calibrated, null),
      challenger_ece: toFinite(challengerMetrics.ece_calibrated, null),
      threshold: TRUST_OBJECTIVE_GATES.ece_max,
    });
  }

  if (!checks.business_loss_reduction_ok) {
    diagnostics.push({
      category: 'business_impact',
      message: 'Estimated loss reduction below threshold. Threshold tuning or feature updates needed.',
      value: toFinite(challengerComparison.estimated_loss_reduction_vs_champion, 0),
      threshold: TRUST_OBJECTIVE_GATES.business_loss_reduction_min,
    });
  }

  const championPositiveRate = toFinite(championModel?.training_summary?.positive_rate, null);
  if (championPositiveRate !== null && (championPositiveRate < 0.15 || championPositiveRate > 0.85)) {
    diagnostics.push({
      category: 'data_imbalance',
      message: 'Training label distribution is highly imbalanced. Consider weighting/re-sampling safeguards.',
      positive_rate: championPositiveRate,
    });
  }

  const pass = Object.values(checks).every((value) => value === true);
  return {
    pass,
    checks,
    diagnostics,
  };
};

const summarizePromotionGatePass = (backtestReport) => {
  if (!backtestReport || typeof backtestReport !== 'object') {
    return {
      pass: false,
      reason: 'missing_backtest_report',
    };
  }

  const segmentSummary = backtestReport.segment_summary || {};
  const evaluatedSegments = Object.values(segmentSummary).filter((entry) => {
    return toFinite(entry.evaluated_windows, 0) > 0;
  });

  const hasValidEvaluations = evaluatedSegments.length > 0;
  return {
    pass: hasValidEvaluations,
    reason: hasValidEvaluations ? 'phase7_backtest_completed' : 'no_evaluated_segments',
    evaluated_segments: evaluatedSegments.length,
  };
};

const summarizeGuardrailGatePass = () => {
  const monitoringSnapshot = readJson(PATHS.monitoringSnapshot, null);
  if (!monitoringSnapshot) {
    return {
      pass: false,
      reason: 'missing_monitoring_snapshot',
      triggered_guardrails: [],
    };
  }

  const triggered = Array.isArray(monitoringSnapshot.triggered_guardrails)
    ? monitoringSnapshot.triggered_guardrails
    : [];

  return {
    pass: triggered.length === 0,
    reason: triggered.length === 0 ? 'no_guardrail_breach' : 'active_guardrail_breach',
    triggered_guardrails: triggered,
  };
};

const makeQuarterlyReportMarkdown = (report) => {
  let markdown = stringifyReportHeader({
    title: 'Trust Quarterly Retraining Report',
    metadata: {
      generated_at: report.generated_at,
      bundle_version: report.bundle_version,
      model_label: report.model_version_label,
      dataset_source: report.dataset_source,
      deployment_status: report.deployment_status,
    },
  });

  markdown += '## Pipeline Steps\n\n';
  report.pipeline_steps.forEach((step) => {
    markdown += `- ${step}\n`;
  });

  markdown += '\n## Evaluation Gates\n\n';
  markdown += `- objective_gate_pass: ${report.gate_results.objective.pass}\n`;
  markdown += `- phase7_backtest_gate_pass: ${report.gate_results.phase7.pass}\n`;
  markdown += `- phase8_guardrail_gate_pass: ${report.gate_results.phase8.pass}\n\n`;

  markdown += '## Champion Metrics\n\n';
  const championMetrics = report.metrics.champion || {};
  markdown += `- auc_pr: ${championMetrics.auc_pr}\n`;
  markdown += `- recall_at_precision_90: ${championMetrics.recall_at_precision_90}\n`;
  markdown += `- brier_calibrated: ${championMetrics.brier_calibrated}\n`;
  markdown += `- ece_calibrated: ${championMetrics.ece_calibrated}\n\n`;

  markdown += '## Challenger Metrics\n\n';
  const challengerMetrics = report.metrics.challenger || {};
  markdown += `- auc_pr: ${challengerMetrics.auc_pr}\n`;
  markdown += `- recall_at_precision_90: ${challengerMetrics.recall_at_precision_90}\n`;
  markdown += `- brier_calibrated: ${challengerMetrics.brier_calibrated}\n`;
  markdown += `- ece_calibrated: ${challengerMetrics.ece_calibrated}\n\n`;

  markdown += '## Deployment Safety\n\n';
  markdown += '- Candidate deployment remains feature-flagged and must roll out gradually (5% -> 25% -> 50% -> 100%).\n';
  markdown += '- Block production cutover if any objective, backtest, or guardrail gate is failing.\n';

  return markdown;
};

const main = () => {
  const datasetPathArg = process.argv[2] || process.env.TRUST_TRAINING_DATASET_PATH || '';
  const pythonExe = process.env.TRUST_PYTHON_EXE || path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe');

  const championTrainScript = path.join(ROOT_DIR, 'backend', 'scripts', 'trust', 'trainTrustChampionModel.js');
  const challengerTrainScript = path.join(ROOT_DIR, 'backend', 'scripts', 'trust', 'trainTrustChallengerModel.py');
  const backtestScript = path.join(ROOT_DIR, 'backend', 'scripts', 'trust', 'backtestTrustPromotion.py');

  const championArgs = [championTrainScript];
  const challengerArgs = [challengerTrainScript];
  const backtestArgs = [backtestScript];
  if (datasetPathArg) {
    championArgs.push(datasetPathArg);
    challengerArgs.push(datasetPathArg);
    backtestArgs.push(datasetPathArg);
  }

  runCommand({
    command: process.execPath,
    args: championArgs,
    cwd: ROOT_DIR,
    label: 'TRAIN_CHAMPION',
  });

  runCommand({
    command: pythonExe,
    args: challengerArgs,
    cwd: ROOT_DIR,
    label: 'TRAIN_CHALLENGER',
  });

  runCommand({
    command: pythonExe,
    args: backtestArgs,
    cwd: ROOT_DIR,
    label: 'BACKTEST_PHASE7',
  });

  const championModel = readJson(PATHS.championModel, null);
  const challengerModel = readJson(PATHS.challengerModel, null);
  const backtestReport = readJson(PATHS.promotionReport, null);
  const segmentDecisions = readJson(PATHS.promotionDecisions, null);

  if (!championModel || !challengerModel || !backtestReport || !segmentDecisions) {
    throw new Error('Quarterly retraining artifacts are incomplete after pipeline execution.');
  }

  const objectiveGate = summarizeObjectiveGates({ championModel, challengerModel });
  const phase7Gate = summarizePromotionGatePass(backtestReport);
  const phase8Gate = summarizeGuardrailGatePass();

  const registry = loadRegistry();
  const currentBundleVersion = resolveLatestBundleVersion(registry);
  const nextBundleVersion = bumpSemver(currentBundleVersion, 'major');
  const modelVersionLabel = toModelVersionLabel(nextBundleVersion);

  const championVersioned = resolveVersionedArtifactPath('trustChampionModel', nextBundleVersion, 'json');
  const challengerVersioned = resolveVersionedArtifactPath('trustChallengerModel', nextBundleVersion, 'json');
  const backtestVersioned = resolveVersionedArtifactPath('trustBacktestReport', nextBundleVersion, 'json');
  const segmentVersioned = resolveVersionedArtifactPath('trustSegmentPromotion', nextBundleVersion, 'json');

  copyFile(PATHS.championModel, championVersioned);
  copyFile(PATHS.challengerModel, challengerVersioned);
  copyFile(PATHS.promotionReport, backtestVersioned);
  copyFile(PATHS.promotionDecisions, segmentVersioned);

  const deploymentStatus = objectiveGate.pass && phase7Gate.pass && phase8Gate.pass
    ? 'candidate_bundle'
    : 'candidate_blocked_by_gates';

  const report = {
    event_type: 'quarterly_retraining',
    generated_at: nowIso(),
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    dataset_source: datasetPathArg || 'synthetic_fallback',
    deployment_status: deploymentStatus,
    lifecycle_state: deploymentStatus === 'candidate_bundle' ? 'candidate_bundle' : 'candidate_blocked_by_gates',
    pipeline_steps: [
      'dataset rebuild with latest snapshots',
      'feature recomputation with Phase 1 schema',
      'champion retraining (monotonic logistic)',
      'challenger retraining (lightgbm)',
      'phase 7 rolling-window backtest',
      'phase 8 guardrail gate check before deployment candidate creation',
    ],
    metrics: {
      champion: championModel.metrics || {},
      challenger: challengerModel.metrics || {},
      challenger_comparison: challengerModel.comparison_vs_champion || {},
    },
    gate_results: {
      objective: objectiveGate,
      phase7: phase7Gate,
      phase8: phase8Gate,
    },
    artifacts: {
      champion_model: {
        path: championVersioned,
        sha256: fileDigest(championVersioned),
      },
      challenger_model: {
        path: challengerVersioned,
        sha256: fileDigest(challengerVersioned),
      },
      backtest_report: {
        path: backtestVersioned,
        sha256: fileDigest(backtestVersioned),
      },
      segment_decisions: {
        path: segmentVersioned,
        sha256: fileDigest(segmentVersioned),
      },
    },
  };

  const reportJsonPath = path.join(REPORTS_DIR, `trustQuarterlyRetraining.${nextBundleVersion}.json`);
  const reportMdPath = path.join(REPORTS_DIR, `trustQuarterlyRetraining.${nextBundleVersion}.md`);
  writeJson(reportJsonPath, report);
  writeText(reportMdPath, makeQuarterlyReportMarkdown(report));

  const deploymentCandidatePath = path.join(path.dirname(PATHS.optimizationRegistry), 'trustDeploymentCandidate.v1.json');
  writeJson(deploymentCandidatePath, {
    generated_at: report.generated_at,
    bundle_version: report.bundle_version,
    model_version_label: report.model_version_label,
    deployment_status: report.deployment_status,
    required_rollout_stages: ['5%', '25%', '50%', '100%'],
    gate_results: report.gate_results,
    artifacts: report.artifacts,
  });

  let nextRegistry = {
    ...registry,
    bundles: {
      ...(registry.bundles || {}),
      [nextBundleVersion]: {
        bundle_version: nextBundleVersion,
        model_version_label: modelVersionLabel,
        type: 'quarterly_retraining',
        created_at: report.generated_at,
        dataset_source: report.dataset_source,
        deployment_status: report.deployment_status,
        lifecycle_state: report.lifecycle_state,
        reports: {
          quarterly_json: reportJsonPath,
          quarterly_md: reportMdPath,
        },
        artifacts: report.artifacts,
        gate_results: report.gate_results,
      },
    },
  };

  nextRegistry = appendRegistryEvent(nextRegistry, {
    type: 'QUARTERLY_RETRAINING_COMPLETED',
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    deployment_status: deploymentStatus,
    report_json: reportJsonPath,
    report_md: reportMdPath,
  });

  saveRegistry(nextRegistry);

  console.log(JSON.stringify({
    event_type: report.event_type,
    bundle_version: nextBundleVersion,
    model_version_label: modelVersionLabel,
    deployment_status: deploymentStatus,
    report_json: reportJsonPath,
    report_markdown: reportMdPath,
    deployment_candidate: deploymentCandidatePath,
  }, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_QUARTERLY_RETRAINING] failed: ${error?.message || error}`);
    process.exit(1);
  }
}
