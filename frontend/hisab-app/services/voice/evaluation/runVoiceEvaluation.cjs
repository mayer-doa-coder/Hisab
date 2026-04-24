const fs = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const { normalize } = require('../normalization/normalizer.js');
const { buildStructuredPayload, evaluateExecutionSafety } = require('../commandExecutor.js');
const { summarizeFailurePatterns } = require('../voiceAnalyticsLogger.js');
const { VOICE_TUNING_CONFIG } = require('../config/voiceTuningConfig.js');
const HOTWORDS = require('../config/hotwordDictionary.json');

const DATASET_PATH = path.resolve(__dirname, '../dataset/utterances.json');
const OUT_JSON = path.resolve(__dirname, './metricsReport.json');
const OUT_MD = path.resolve(__dirname, './metricsReport.md');
const EVAL_NOW = new Date('2026-04-21T00:00:00.000Z');

const safeLower = (value) => String(value || '').trim().toLowerCase();
const toNumberOrNull = (value) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
};

const toExpectedDateIso = (token) => {
  const value = safeLower(token);
  if (!value) {
    return '';
  }

  if (value === 'aj') {
    return '2026-04-21';
  }

  if (value === 'kal') {
    return '2026-04-22';
  }

  return value;
};

const main = () => {
  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const rows = Array.isArray(raw.utterances) ? raw.utterances : [];

  let intentCorrect = 0;
  let nameCorrect = 0;
  let amountCorrect = 0;
  let dateCorrect = 0;
  let executedWrong = 0;
  let executionAttempts = 0;
  let cancellations = 0;

  const failures = [];
  const threshold = Number(VOICE_TUNING_CONFIG?.thresholds?.normalizationOverall || 0.82);

  for (const row of rows) {
    const normalized = normalize(row.text, HOTWORDS, { threshold, now: EVAL_NOW });

    const expectedIntent = safeLower(row.expected?.intent);
    const expectedName = safeLower(row.expected?.name);
    const expectedAmount = toNumberOrNull(row.expected?.amount);
    const expectedDate = toExpectedDateIso(row.expected?.date);

    const gotIntent = safeLower(normalized.intent);
    const gotName = safeLower(normalized.name);
    const gotAmount = toNumberOrNull(normalized.amount);
    const gotDate = safeLower(normalized.date);

    if (expectedIntent && gotIntent === expectedIntent) {
      intentCorrect += 1;
    }

    if (expectedName && gotName === expectedName) {
      nameCorrect += 1;
    }

    if (expectedAmount !== null && gotAmount === expectedAmount) {
      amountCorrect += 1;
    }

    if ((expectedDate || '') === (gotDate || '')) {
      dateCorrect += 1;
    }

    const payload = buildStructuredPayload({
      intentToken: normalized.intent,
      customerId: normalized.name ? `match_${normalized.name}` : null,
      amount: normalized.amount,
      date: normalized.date,
      confidence: normalized.confidence?.overall,
    });

    const safety = evaluateExecutionSafety({
      payload,
      context: { status: 'CONFIRMED' },
    });

    if (!normalized.intent || !normalized.amount || Number(normalized.confidence?.overall || 0) < 0.6) {
      cancellations += 1;
    }

    if (payload.intent && payload.amount) {
      executionAttempts += 1;

      const expectedSafe = Boolean(expectedIntent && expectedAmount && (expectedAmount > 0));
      if (safety.ok && !expectedSafe) {
        executedWrong += 1;
      }
    }

    if (!(expectedIntent && gotIntent === expectedIntent) || !(expectedAmount !== null && gotAmount === expectedAmount)) {
      failures.push({
        id: row.id,
        text: row.text,
        expected: row.expected,
        predicted: {
          intent: normalized.intent,
          name: normalized.name,
          amount: normalized.amount,
          date: normalized.date,
          confidence: normalized.confidence?.overall,
          shouldClarify: normalized.shouldClarify,
        },
      });
    }
  }

  const sampleCount = rows.length || 1;
  const report = {
    sample_count: sampleCount,
    intent_accuracy: Number((intentCorrect / sampleCount).toFixed(4)),
    slot_accuracy: {
      name: Number((nameCorrect / sampleCount).toFixed(4)),
      amount: Number((amountCorrect / sampleCount).toFixed(4)),
      date: Number((dateCorrect / sampleCount).toFixed(4)),
    },
    amount_accuracy: Number((amountCorrect / sampleCount).toFixed(4)),
    name_accuracy: Number((nameCorrect / sampleCount).toFixed(4)),
    date_accuracy: Number((dateCorrect / sampleCount).toFixed(4)),
    false_execution_rate: Number((executionAttempts ? executedWrong / executionAttempts : 0).toFixed(4)),
    cancellation_rate: Number((cancellations / sampleCount).toFixed(4)),
    execution_attempts: executionAttempts,
    failure_samples_top20: failures.slice(0, 20),
    analytics_failure_summary: summarizeFailurePatterns(),
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    '# Voice Evaluation Metrics',
    '',
    `Samples: ${sampleCount}`,
    `Threshold: ${threshold}`,
    '',
    `- Intent Accuracy: ${report.intent_accuracy}`,
    `- Amount Accuracy: ${report.amount_accuracy}`,
    `- Name Accuracy: ${report.name_accuracy}`,
    `- Date Accuracy: ${report.date_accuracy}`,
    `- False Execution Rate: ${report.false_execution_rate}`,
    `- Cancellation Rate: ${report.cancellation_rate}`,
    '',
    '## Failure Analysis',
    '',
    `Top mismatch samples captured: ${report.failure_samples_top20.length}`,
    `Execution attempts: ${executionAttempts}`,
    '',
    'Focus areas:',
    '- Mispronounced names under noisy_tag inputs',
    '- Interrupted utterances lacking intent or amount',
    '- Mixed Bangla/Banglish number forms requiring confirmation',
  ].join('\n');

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log('Evaluation complete:', report);
};

main();
