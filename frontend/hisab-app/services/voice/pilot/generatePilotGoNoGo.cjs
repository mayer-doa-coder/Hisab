const fs = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const {
  buildPilotGoNoGoReport,
} = require('../voiceAnalyticsLogger.js');
const { PILOT_ROLLOUT_CONFIG } = require('./pilotConfig.js');

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, './pilotEvents.sample.json');
const OUT_JSON = path.resolve(__dirname, './pilotGoNoGo.latest.json');
const OUT_MD = path.resolve(__dirname, './pilotGoNoGo.latest.md');

const raw = fs.existsSync(INPUT_PATH)
  ? JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'))
  : [];

const eventRows = Array.isArray(raw) ? raw : (Array.isArray(raw.events) ? raw.events : []);
const cycleDays = Number(PILOT_ROLLOUT_CONFIG?.cycleDays || 7);

const report = buildPilotGoNoGoReport({
  eventRows,
  cycleDays,
  thresholds: PILOT_ROLLOUT_CONFIG?.kpiThresholds || {},
});

const fullReport = {
  week: report.week,
  decision: report.decision,
  kpis: report.kpis,
  blockers: report.blockers,
  recommendations: report.recommendations,
  diagnostics: report.diagnostics,
  source: INPUT_PATH,
  eventCount: eventRows.length,
  cycleDays: report.cycleDays,
  thresholds: report.thresholds,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(OUT_JSON, JSON.stringify(fullReport, null, 2), 'utf8');

const md = [
  '# Pilot Go/No-Go Review',
  '',
  `Week: ${report.week}`,
  `Source: ${INPUT_PATH}`,
  `Events: ${eventRows.length}`,
  `Cycle days: ${report.cycleDays}`,
  '',
  `Decision: ${report.decision}`,
  '',
  '## KPI Snapshot',
  '',
  `- Intent accuracy: ${report.kpis.intent_accuracy}`,
  `- Slot accuracy (name): ${report.kpis.slot_accuracy?.name}`,
  `- Slot accuracy (amount): ${report.kpis.slot_accuracy?.amount}`,
  `- False execution rate: ${report.kpis.false_execution_rate}`,
  `- Cancellation rate: ${report.kpis.cancellation_rate}`,
  `- Latency p95 (ms): ${report.kpis.p95_latency_ms}`,
  `- STT failure rate: ${report.kpis.stt_failure_rate}`,
  `- Retry rate: ${report.kpis.retry_rate}`,
  '',
  '## Blockers',
  '',
  ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ['- None']),
  '',
  '## Recommendations',
  '',
  ...(report.recommendations.length ? report.recommendations.map((item) => `- ${item}`) : ['- None']),
].join('\n');

fs.writeFileSync(OUT_MD, md, 'utf8');
console.log('Pilot go/no-go report generated:', report.decision);
