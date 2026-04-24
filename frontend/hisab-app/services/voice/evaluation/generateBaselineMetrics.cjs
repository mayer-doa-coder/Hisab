const fs = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const { computeBaselineMetricsFromEvents, VOICE_KPI_THRESHOLDS } = require('../voiceAnalyticsLogger.js');

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '../pilot/pilotEvents.sample.json');

const OUT_JSON = path.resolve(__dirname, '../baselineMetrics.json');

const readEventRows = () => {
  if (!fs.existsSync(INPUT_PATH)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  return Array.isArray(raw) ? raw : (Array.isArray(raw.events) ? raw.events : []);
};

const eventRows = readEventRows();
const baseline = computeBaselineMetricsFromEvents({
  eventRows,
  cycleDays: 30,
});

const payload = {
  ...baseline,
  thresholds: VOICE_KPI_THRESHOLDS,
  source: INPUT_PATH,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Baseline metrics written to ${OUT_JSON}`);
