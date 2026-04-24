const fs = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const {
  buildProductionOpsSummary,
  buildPilotGoNoGoReport,
} = require('../voiceAnalyticsLogger.js');
const { PILOT_ROLLOUT_CONFIG } = require('./pilotConfig.js');

const ROOT = process.cwd();

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(ROOT, './services/voice/pilot/pilotEvents.sample.json');
const OUT_JSON = path.resolve(ROOT, './services/voice/pilot/voiceOps.latest.json');
const OUT_MD = path.resolve(ROOT, './services/voice/pilot/voiceOps.latest.md');

const readEvents = () => {
  if (!fs.existsSync(INPUT_PATH)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  return Array.isArray(raw) ? raw : (Array.isArray(raw.events) ? raw.events : []);
};

const pctDelta = (current, previous) => {
  const now = Number(current || 0);
  const prev = Number(previous || 0);
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }

  return Number((((now - prev) / prev) * 100).toFixed(2));
};

const main = () => {
  const rows = readEvents();
  const cycleDays = Number(PILOT_ROLLOUT_CONFIG?.cycleDays || 7);
  const now = new Date();
  const previousWindowNow = new Date(now.getTime() - (cycleDays * 24 * 60 * 60 * 1000));

  const current = buildProductionOpsSummary({
    eventRows: rows,
    cycleDays,
    now,
  });

  const previous = buildProductionOpsSummary({
    eventRows: rows,
    cycleDays,
    now: previousWindowNow,
  });

  const goNoGo = buildPilotGoNoGoReport({
    eventRows: rows,
    cycleDays,
    thresholds: PILOT_ROLLOUT_CONFIG?.kpiThresholds || {},
    now,
  });

  const report = {
    generatedAt: now.toISOString(),
    cycleDays,
    weekly_kpi_summary: current.kpis,
    reliability_summary: current.reliability,
    cost_summary: current.cost,
    confusion_summary: current.confusion,
    go_no_go: {
      week: goNoGo.week,
      decision: goNoGo.decision,
      blockers: goNoGo.blockers,
      recommendations: goNoGo.recommendations,
    },
    accuracy_trends: {
      intent_accuracy_delta_pct: pctDelta(current.kpis.intent_accuracy, previous.kpis.intent_accuracy),
      slot_name_accuracy_delta_pct: pctDelta(current.kpis.slot_accuracy?.name_accuracy, previous.kpis.slot_accuracy?.name_accuracy),
      slot_amount_accuracy_delta_pct: pctDelta(current.kpis.slot_accuracy?.amount_accuracy, previous.kpis.slot_accuracy?.amount_accuracy),
      p95_latency_delta_pct: pctDelta(current.kpis.p95_latency_ms, previous.kpis.p95_latency_ms),
      stt_cost_delta_pct: pctDelta(current.cost.estimated_monthly_spend_usd, previous.cost.estimated_monthly_spend_usd),
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    '# Voice Operations Weekly Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Cycle days: ${report.cycleDays}`,
    '',
    `Decision: ${report.go_no_go.decision}`,
    '',
    '## KPI Summary',
    '',
    `- Transcription availability: ${report.weekly_kpi_summary.transcription_availability}`,
    `- Intent accuracy: ${report.weekly_kpi_summary.intent_accuracy}`,
    `- Slot accuracy (name): ${report.weekly_kpi_summary.slot_accuracy?.name_accuracy}`,
    `- Slot accuracy (amount): ${report.weekly_kpi_summary.slot_accuracy?.amount_accuracy}`,
    `- False execution rate: ${report.weekly_kpi_summary.false_execution_rate}`,
    `- P95 latency (ms): ${report.weekly_kpi_summary.p95_latency_ms}`,
    '',
    '## Cost Summary',
    '',
    `- Request count: ${report.cost_summary.request_count}`,
    `- Audio seconds: ${report.cost_summary.audio_seconds}`,
    `- Estimated monthly spend USD: ${report.cost_summary.estimated_monthly_spend_usd}`,
    '',
    '## Reliability Summary',
    '',
    `- Failure rate: ${report.reliability_summary.failure_rate}`,
    `- Retry rate: ${report.reliability_summary.retry_rate}`,
    `- Timeout frequency: ${report.reliability_summary.timeout_frequency}`,
    '',
    '## Top Confusions',
    '',
    ...(report.confusion_summary.misrecognized_names_top.length
      ? report.confusion_summary.misrecognized_names_top.map((item) => `- Name: ${item.key} (${item.count})`)
      : ['- None']),
    ...(report.confusion_summary.number_extraction_errors_top.length
      ? report.confusion_summary.number_extraction_errors_top.map((item) => `- Number: ${item.key} (${item.count})`)
      : ['- Number errors: None']),
    ...(report.confusion_summary.intent_confusions_top.length
      ? report.confusion_summary.intent_confusions_top.map((item) => `- Intent: ${item.key} (${item.count})`)
      : ['- Intent confusions: None']),
  ].join('\n');

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log('Voice ops report generated:', report.go_no_go.decision);
};

main();
