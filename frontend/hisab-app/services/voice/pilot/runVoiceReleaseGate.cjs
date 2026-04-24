const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const { VOICE_TUNING_CONFIG } = require('../config/voiceTuningConfig.js');

const ROOT = process.cwd();
const METRICS_PATH = path.resolve(ROOT, './services/voice/evaluation/metricsReport.json');
const PARSER_REPORT_PATH = path.resolve(ROOT, './services/voice/evaluation/parserRegressionReport.json');
const GO_NO_GO_PATH = path.resolve(ROOT, './services/voice/pilot/pilotGoNoGo.latest.json');
const OUT_JSON = path.resolve(ROOT, './services/voice/pilot/voiceReleaseGate.latest.json');
const OUT_MD = path.resolve(ROOT, './services/voice/pilot/voiceReleaseGate.latest.md');

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const runNodeScript = (relativeScriptPath) => {
  const result = spawnSync(process.execPath, [relativeScriptPath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    script: relativeScriptPath,
  };
};

const readJsonSafe = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const main = () => {
  const evalRun = runNodeScript('./services/voice/evaluation/runVoiceEvaluation.cjs');
  const parserRun = runNodeScript('./services/voice/evaluation/runBnParserRegression.cjs');

  const metrics = readJsonSafe(METRICS_PATH) || {};
  const parser = readJsonSafe(PARSER_REPORT_PATH) || {};
  const goNoGo = readJsonSafe(GO_NO_GO_PATH) || {};

  const thresholds = VOICE_TUNING_CONFIG?.thresholds || {};

  const checks = [
    {
      id: 'voice_evaluation_script',
      ok: evalRun.ok,
      expected: 'runVoiceEvaluation.cjs exits with code 0',
      actual: evalRun.ok ? 'passed' : evalRun.stderr || evalRun.stdout || `exit ${evalRun.status}`,
    },
    {
      id: 'bn_parser_regression_script',
      ok: parserRun.ok,
      expected: 'runBnParserRegression.cjs exits with code 0',
      actual: parserRun.ok ? 'passed' : parserRun.stderr || parserRun.stdout || `exit ${parserRun.status}`,
    },
    {
      id: 'intent_accuracy',
      ok: toNumber(metrics.intent_accuracy) >= toNumber(thresholds.releaseGateIntentAccuracyMin, 0.9),
      expected: `>= ${toNumber(thresholds.releaseGateIntentAccuracyMin, 0.9)}`,
      actual: toNumber(metrics.intent_accuracy),
    },
    {
      id: 'amount_accuracy',
      ok: toNumber(metrics.amount_accuracy) >= toNumber(thresholds.releaseGateAmountAccuracyMin, 0.95),
      expected: `>= ${toNumber(thresholds.releaseGateAmountAccuracyMin, 0.95)}`,
      actual: toNumber(metrics.amount_accuracy),
    },
    {
      id: 'name_accuracy',
      ok: toNumber(metrics.name_accuracy) >= toNumber(thresholds.releaseGateNameAccuracyMin, 0.9),
      expected: `>= ${toNumber(thresholds.releaseGateNameAccuracyMin, 0.9)}`,
      actual: toNumber(metrics.name_accuracy),
    },
    {
      id: 'false_execution_rate',
      ok: toNumber(metrics.false_execution_rate) <= toNumber(thresholds.releaseGateFalseExecutionRateMax, 0.02),
      expected: `<= ${toNumber(thresholds.releaseGateFalseExecutionRateMax, 0.02)}`,
      actual: toNumber(metrics.false_execution_rate),
    },
    {
      id: 'cancellation_rate',
      ok: toNumber(metrics.cancellation_rate) <= toNumber(thresholds.releaseGateCancellationRateMax, 0.3),
      expected: `<= ${toNumber(thresholds.releaseGateCancellationRateMax, 0.3)}`,
      actual: toNumber(metrics.cancellation_rate),
    },
    {
      id: 'parser_pass_rate',
      ok: toNumber(parser.passRate, 0) >= 1,
      expected: '== 1',
      actual: toNumber(parser.passRate, 0),
    },
    {
      id: 'pilot_go_no_go',
      ok: !goNoGo.decision || String(goNoGo.decision || '').toUpperCase() === 'GO',
      expected: 'GO or unavailable',
      actual: goNoGo.decision || 'unavailable',
    },
  ];

  const blockers = checks
    .filter((item) => !item.ok)
    .map((item) => `${item.id}: expected ${item.expected}, got ${item.actual}`);

  const result = {
    generatedAt: new Date().toISOString(),
    decision: blockers.length ? 'BLOCK_RELEASE' : 'PASS_RELEASE',
    blockers,
    checks,
    artifacts: {
      metrics_path: METRICS_PATH,
      parser_report_path: PARSER_REPORT_PATH,
      pilot_go_no_go_path: GO_NO_GO_PATH,
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');

  const md = [
    '# Voice Release Gate',
    '',
    `Decision: ${result.decision}`,
    '',
    '## Checks',
    '',
    ...checks.map((item) => `- ${item.id}: ${item.ok ? 'PASS' : 'FAIL'} (expected ${item.expected}, actual ${item.actual})`),
    '',
    '## Blockers',
    '',
    ...(blockers.length ? blockers.map((item) => `- ${item}`) : ['- None']),
  ].join('\n');

  fs.writeFileSync(OUT_MD, md, 'utf8');

  if (blockers.length) {
    console.error('Voice release gate failed.', result);
    process.exit(1);
  }

  console.log('Voice release gate passed.', result.decision);
};

main();
