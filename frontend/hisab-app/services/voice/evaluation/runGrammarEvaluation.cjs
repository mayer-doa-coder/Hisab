'use strict';

/**
 * Grammar Evaluation Runner
 *
 * For each utterance in the dataset this script simulates what happens when
 * the user speaks each slot in its dedicated FSM state.  It applies
 * `applyGrammarConstraint` per state, measures accuracy and noise reduction,
 * and produces tuning recommendations.
 *
 * Metrics computed
 * ─────────────────
 *   intent_accuracy        – WAIT_INTENT grammar correctly resolves the intent
 *   slot_accuracy.name     – WAIT_NAME grammar correctly resolves the name
 *   slot_accuracy.amount   – WAIT_AMOUNT grammar correctly resolves the amount
 *   false_execution_rate   – grammar passes a slot value that should be absent
 *   noise_reduction_rate   – average fraction of tokens stripped per utterance
 *
 * Breakdowns: by noise_tag (clean / shop_noise / interrupted / mispronounced / mixed)
 */

const fs   = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({ target: 'es2020', format: 'cjs' });

const { applyGrammarConstraint, filterTokensByVocabulary } = require('../asr/decoder.js');
const { parseAmount } = require('../normalization/numberParser.js');
const { VOICE_TUNING_CONFIG } = require('../config/voiceTuningConfig.js');

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATASET_PATH = path.resolve(__dirname, '../dataset/utterances.json');
const OUT_JSON     = path.resolve(__dirname, './grammarEvaluationReport.json');
const OUT_MD       = path.resolve(__dirname, './grammarEvaluationReport.md');

// ─── Known names (matches dataset generator's canonical list) ─────────────────

// Known names mirror the dataset generator's canonical list.
// Aliases cover Bengali-script and common mispronounced forms so that
// the fuzzy name-matcher in pickName can resolve them.
const KNOWN_NAMES = [
  { id: 'c1', name: 'Rahim',  aliases: ['rahim', 'rohim', 'rahin', 'raheem', 'রহিম', 'রহিন', 'রহীম'] },
  { id: 'c2', name: 'Karim',  aliases: ['karim', 'korim', 'করিম', 'করীম', 'করিন'] },
  { id: 'c3', name: 'Jalal',  aliases: ['jalal', 'jolal', 'জালাল', 'জলাল'] },
  { id: 'c4', name: 'Salam',  aliases: ['salam', 'solam', 'সালাম', 'ছালাম'] },
  { id: 'c5', name: 'Monir',  aliases: ['monir', 'munir', 'মনির', 'মনিরে'] },
  { id: 'c6', name: 'Babul',  aliases: ['babul', 'babool', 'বাবুল', 'বাবল'] },
  { id: 'c7', name: 'Rina',   aliases: ['rina', 'reena', 'রিনা', 'রিনার'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safe = (v) => String(v || '').trim().toLowerCase();

const toNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : (n === 0 && String(v).trim() !== '' ? 0 : null);
};

// Counters bucket for one noise_tag or overall
const makeBucket = () => ({
  intentTotal:    0,
  intentCorrect:  0,
  nameTotal:      0,
  nameCorrect:    0,
  amountTotal:    0,
  amountCorrect:  0,
  // false execution: grammar passed a value when expected was null/absent
  falseIntentFired: 0,
  falseAmountFired: 0,
  falseExecDenom:   0,
  noiseRatioSum:    0,
  noiseRatioCount:  0,
});

const finalizeMetrics = (b) => {
  const intentAcc   = b.intentTotal   > 0 ? b.intentCorrect  / b.intentTotal  : null;
  const nameAcc     = b.nameTotal     > 0 ? b.nameCorrect    / b.nameTotal    : null;
  const amountAcc   = b.amountTotal   > 0 ? b.amountCorrect  / b.amountTotal  : null;
  const falseExec   = b.falseExecDenom > 0
    ? (b.falseIntentFired + b.falseAmountFired) / b.falseExecDenom
    : 0;
  const noiseRedux  = b.noiseRatioCount > 0
    ? b.noiseRatioSum / b.noiseRatioCount
    : 0;

  return {
    intent_accuracy:      intentAcc   !== null ? round4(intentAcc)  : null,
    slot_accuracy: {
      name:   nameAcc   !== null ? round4(nameAcc)   : null,
      amount: amountAcc !== null ? round4(amountAcc) : null,
    },
    false_execution_rate:  round4(falseExec),
    noise_reduction_rate:  round4(noiseRedux),
    counts: {
      intent_total:   b.intentTotal,
      name_total:     b.nameTotal,
      amount_total:   b.amountTotal,
      false_exec_denom: b.falseExecDenom,
    },
  };
};

const round4 = (n) => Number(Number(n).toFixed(4));

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = () => {
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`Dataset not found: ${DATASET_PATH}`);
    process.exit(1);
  }

  const raw  = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const rows = Array.isArray(raw.utterances) ? raw.utterances : [];

  const overall  = makeBucket();
  const byTag    = {};
  const failures = [];
  let _fallbackFired = 0; // tracks how many written-word amounts needed parseAmount fallback

  // Confidence floor under which we treat a constrained result as "rejected"
  const CONF_FLOOR = Number(VOICE_TUNING_CONFIG?.thresholds?.asrAcceptance || 0.68);

  for (const row of rows) {
    const text     = String(row.text || '');
    const tag      = String(row.noise_tag || 'clean');
    const expIntent = safe(row.expected?.intent);
    const expName   = safe(row.expected?.name);
    const expAmount = toNumber(row.expected?.amount);

    if (!byTag[tag]) byTag[tag] = makeBucket();
    const tagBucket = byTag[tag];

    // ── WAIT_INTENT constraint ───────────────────────────────────────────────
    {
      const result     = applyGrammarConstraint({ text, state: 'WAIT_INTENT', knownNames: KNOWN_NAMES });
      const gotIntent  = result.confidence >= CONF_FLOOR ? safe(result.acceptedToken) : '';
      const isPresent  = Boolean(expIntent);

      // accumulate noise ratio
      overall.noiseRatioSum   += result.noiseRatio;
      overall.noiseRatioCount += 1;
      tagBucket.noiseRatioSum   += result.noiseRatio;
      tagBucket.noiseRatioCount += 1;

      if (isPresent) {
        overall.intentTotal   += 1;
        tagBucket.intentTotal += 1;
        if (gotIntent === expIntent) {
          overall.intentCorrect   += 1;
          tagBucket.intentCorrect += 1;
        } else {
          failures.push({
            id: row.id, text, noise_tag: tag, state: 'WAIT_INTENT',
            expected: expIntent, predicted: gotIntent,
            confidence: result.confidence, strippedTokens: result.strippedTokens,
          });
        }
      }

      // False-execution check: grammar fires an intent when none expected
      if (!isPresent && gotIntent) {
        overall.falseIntentFired   += 1;
        tagBucket.falseIntentFired += 1;
      }
      if (!isPresent) {
        overall.falseExecDenom   += 1;
        tagBucket.falseExecDenom += 1;
      }
    }

    // ── WAIT_NAME constraint ─────────────────────────────────────────────────
    {
      const result  = applyGrammarConstraint({ text, state: 'WAIT_NAME', knownNames: KNOWN_NAMES });
      const gotName = result.confidence >= CONF_FLOOR ? safe(result.acceptedToken) : '';

      if (expName) {
        overall.nameTotal   += 1;
        tagBucket.nameTotal += 1;
        if (gotName === expName) {
          overall.nameCorrect   += 1;
          tagBucket.nameCorrect += 1;
        } else {
          failures.push({
            id: row.id, text, noise_tag: tag, state: 'WAIT_NAME',
            expected: expName, predicted: gotName,
            confidence: result.confidence, strippedTokens: result.strippedTokens,
          });
        }
      }
    }

    // ── WAIT_AMOUNT constraint ───────────────────────────────────────────────
    {
      const result = applyGrammarConstraint({ text, state: 'WAIT_AMOUNT', knownNames: KNOWN_NAMES });
      // Primary: grammar constraint resolved a digit string.
      // Fallback: parseAmount handles written word-numbers (eksho, pachash, …)
      // that pass the vocabulary filter but can't be detected by pickNumeric.
      let gotAmount = result.confidence >= CONF_FLOOR ? toNumber(result.acceptedToken) : null;
      if (gotAmount === null) {
        const parsed = parseAmount(result.tokens.join(' '));
        if (parsed.amount !== null && Number(parsed.confidence || 0) >= CONF_FLOOR) {
          gotAmount = parsed.amount;
          _fallbackFired += 1;
        }
      }
      const isPresent = expAmount !== null;

      if (isPresent) {
        overall.amountTotal   += 1;
        tagBucket.amountTotal += 1;
        if (gotAmount === expAmount) {
          overall.amountCorrect   += 1;
          tagBucket.amountCorrect += 1;
        } else {
          failures.push({
            id: row.id, text, noise_tag: tag, state: 'WAIT_AMOUNT',
            expected: expAmount, predicted: gotAmount,
            confidence: result.confidence, strippedTokens: result.strippedTokens,
          });
        }
      }

      // False-execution: grammar fires an amount when none expected
      if (!isPresent && gotAmount !== null) {
        overall.falseAmountFired   += 1;
        tagBucket.falseAmountFired += 1;
      }
    }
  }

  // ─── Aggregate results ───────────────────────────────────────────────────────

  const overallMetrics = finalizeMetrics(overall);
  const byTagMetrics   = Object.fromEntries(
    Object.entries(byTag).map(([tag, b]) => [tag, finalizeMetrics(b)])
  );

  // ─── Tuning recommendations ───────────────────────────────────────────────

  const recommendations = buildTuningRecommendations(overallMetrics, byTagMetrics, failures);

  // ─── Failure analysis ─────────────────────────────────────────────────────

  const failuresByState = {
    WAIT_INTENT: failures.filter((f) => f.state === 'WAIT_INTENT').slice(0, 10),
    WAIT_NAME:   failures.filter((f) => f.state === 'WAIT_NAME').slice(0, 10),
    WAIT_AMOUNT: failures.filter((f) => f.state === 'WAIT_AMOUNT').slice(0, 10),
  };

  const report = {
    generated_at: new Date().toISOString(),
    dataset_version: String(raw.version || 'unknown'),
    sample_count: rows.length,
    confidence_floor: CONF_FLOOR,
    overall: overallMetrics,
    by_noise_tag: byTagMetrics,
    failure_analysis: {
      total_failures: failures.length,
      by_state: {
        WAIT_INTENT: failuresByState.WAIT_INTENT.length,
        WAIT_NAME:   failuresByState.WAIT_NAME.length,
        WAIT_AMOUNT: failuresByState.WAIT_AMOUNT.length,
      },
      samples: failuresByState,
    },
    tuning_recommendations: recommendations,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, buildMarkdown(report), 'utf8');

  console.log('\n=== Grammar Evaluation Complete ===\n');
  console.log(`Samples evaluated : ${rows.length}`);
  console.log(`Intent accuracy   : ${overallMetrics.intent_accuracy}`);
  console.log(`Name accuracy     : ${overallMetrics.slot_accuracy.name}`);
  console.log(`Amount accuracy   : ${overallMetrics.slot_accuracy.amount}`);
  console.log(`False exec rate   : ${overallMetrics.false_execution_rate}`);
  console.log(`Noise reduction   : ${overallMetrics.noise_reduction_rate}`);
  console.log(`Total failures    : ${failures.length}`);
  console.log(`Written-amt fallback used : ${_fallbackFired} / ${rows.length} utterances`);
  console.log(`\nReports written to:`);
  console.log(`  ${OUT_JSON}`);
  console.log(`  ${OUT_MD}`);
};

// ─── Tuning recommendations ────────────────────────────────────────────────────

const buildTuningRecommendations = (overall, byTag, failures) => {
  const recs = [];
  const thresholds = VOICE_TUNING_CONFIG?.thresholds || {};

  // Intent accuracy
  const intentAcc = overall.intent_accuracy ?? 1;
  const intentMin = Number(thresholds.releaseGateIntentAccuracyMin || 0.90);
  if (intentAcc < intentMin) {
    const intentFailures = failures.filter((f) => f.state === 'WAIT_INTENT');
    const missed = [...new Set(intentFailures.map((f) => f.expected).filter(Boolean))];
    recs.push({
      priority: 'HIGH',
      area: 'grammar.WAIT_INTENT',
      metric: 'intent_accuracy',
      current: intentAcc,
      target: intentMin,
      action: `Expand intent aliases for: ${missed.join(', ') || 'unknown'}. Add misrecognition variants to commandGrammar.v1.js INTENTS[].tokens.misrecognitions.`,
    });
  }

  // Name accuracy
  const nameAcc = overall.slot_accuracy.name ?? 1;
  const nameMin = Number(thresholds.releaseGateNameAccuracyMin || 0.90);
  if (nameAcc < nameMin) {
    const nameFailures = failures.filter((f) => f.state === 'WAIT_NAME');
    const misheard = nameFailures.slice(0, 5).map((f) => `"${f.text}" → expected "${f.expected}" got "${f.predicted}"`);
    recs.push({
      priority: 'HIGH',
      area: 'grammar.WAIT_NAME',
      metric: 'slot_accuracy.name',
      current: nameAcc,
      target: nameMin,
      action: `Lower nameMatchMin threshold (currently ${thresholds.nameMatchMin}) to 0.80 for noisy conditions. Add phonetic variants to hotwordDictionary. Cases: ${misheard.join(' | ')}.`,
    });
  }

  // Amount accuracy
  const amountAcc = overall.slot_accuracy.amount ?? 1;
  const amountMin = Number(thresholds.releaseGateAmountAccuracyMin || 0.95);
  if (amountAcc < amountMin) {
    const amountFails = failures.filter((f) => f.state === 'WAIT_AMOUNT').slice(0, 5);
    const forms = amountFails.map((f) => `"${f.text}"`);
    recs.push({
      priority: 'MEDIUM',
      area: 'grammar.WAIT_AMOUNT',
      metric: 'slot_accuracy.amount',
      current: amountAcc,
      target: amountMin,
      action: `Extend numberParser.js with additional Bengali written-word forms. Failing inputs: ${forms.join(', ')}.`,
    });
  }

  // False execution rate
  const fer = overall.false_execution_rate;
  const ferMax = Number(thresholds.releaseGateFalseExecutionRateMax || 0.02);
  if (fer > ferMax) {
    recs.push({
      priority: 'HIGH',
      area: 'thresholds',
      metric: 'false_execution_rate',
      current: fer,
      target: ferMax,
      action: `Raise asrAcceptance threshold (currently ${thresholds.asrAcceptance}) to 0.75+ to reduce false grammar acceptances. Consider adding a slot-present gate: require confidence ≥ 0.80 before accepting any slot.`,
    });
  }

  // Noise reduction per tag
  const shopNoise = byTag['shop_noise'];
  if (shopNoise && shopNoise.noise_reduction_rate < 0.15) {
    recs.push({
      priority: 'MEDIUM',
      area: 'noise.shop_noise',
      metric: 'noise_reduction_rate',
      current: shopNoise.noise_reduction_rate,
      target: 0.20,
      action: 'Add shop-floor noise tokens to NOISE_INDICATORS set in decoder.js (e.g. background chatter patterns returned by ASR).',
    });
  }

  // Per-tag intent accuracy
  for (const [tag, metrics] of Object.entries(byTag)) {
    const tagIntentAcc = metrics.intent_accuracy;
    if (tagIntentAcc !== null && tagIntentAcc < 0.85) {
      recs.push({
        priority: 'MEDIUM',
        area: `noise_tag.${tag}`,
        metric: 'intent_accuracy',
        current: tagIntentAcc,
        target: 0.85,
        action: `Intent accuracy is low for noise_tag="${tag}". Review STT word-boost hints passed in this condition and add more banglish misrecognition variants.`,
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      priority: 'INFO',
      area: 'all',
      metric: 'overall',
      current: null,
      target: null,
      action: 'All metrics are within release-gate thresholds. No immediate tuning required.',
    });
  }

  return recs;
};

// ─── Markdown report builder ───────────────────────────────────────────────────

const buildMarkdown = (r) => {
  const o  = r.overall;
  const fa = r.failure_analysis;

  const statusIcon = (val, target, lowerIsBetter = false) => {
    if (val === null) return '—';
    return (lowerIsBetter ? val <= target : val >= target) ? '✅' : '❌';
  };

  const thresholds = VOICE_TUNING_CONFIG?.thresholds || {};
  const intentMin  = Number(thresholds.releaseGateIntentAccuracyMin || 0.90);
  const nameMin    = Number(thresholds.releaseGateNameAccuracyMin   || 0.90);
  const amountMin  = Number(thresholds.releaseGateAmountAccuracyMin || 0.95);
  const ferMax     = Number(thresholds.releaseGateFalseExecutionRateMax || 0.02);

  const lines = [
    '# Grammar Evaluation Report',
    '',
    `Generated: ${r.generated_at}  `,
    `Dataset: ${r.dataset_version} · ${r.sample_count} samples  `,
    `Confidence floor: ${r.confidence_floor}`,
    '',
    '## Overall Metrics',
    '',
    '| Metric | Value | Target | Status |',
    '|--------|-------|--------|--------|',
    `| Intent accuracy (WAIT_INTENT) | ${o.intent_accuracy ?? '—'} | ≥ ${intentMin} | ${statusIcon(o.intent_accuracy, intentMin)} |`,
    `| Name accuracy (WAIT_NAME) | ${o.slot_accuracy.name ?? '—'} | ≥ ${nameMin} | ${statusIcon(o.slot_accuracy.name, nameMin)} |`,
    `| Amount accuracy (WAIT_AMOUNT) | ${o.slot_accuracy.amount ?? '—'} | ≥ ${amountMin} | ${statusIcon(o.slot_accuracy.amount, amountMin)} |`,
    `| False execution rate | ${o.false_execution_rate} | ≤ ${ferMax} | ${statusIcon(o.false_execution_rate, ferMax, true)} |`,
    `| Noise reduction rate (avg tokens stripped) | ${o.noise_reduction_rate} | — | — |`,
    '',
    '## Breakdown by Noise Tag',
    '',
    '| Tag | Intent Acc | Name Acc | Amount Acc | False Exec | Noise Redux |',
    '|-----|-----------|----------|------------|------------|-------------|',
    ...Object.entries(r.by_noise_tag).map(([tag, m]) =>
      `| ${tag} | ${m.intent_accuracy ?? '—'} | ${m.slot_accuracy.name ?? '—'} | ${m.slot_accuracy.amount ?? '—'} | ${m.false_execution_rate} | ${m.noise_reduction_rate} |`
    ),
    '',
    '## Failure Analysis',
    '',
    `Total failures: **${fa.total_failures}**`,
    '',
    `| State | Failures |`,
    `|-------|---------|`,
    `| WAIT_INTENT | ${fa.by_state.WAIT_INTENT} |`,
    `| WAIT_NAME | ${fa.by_state.WAIT_NAME} |`,
    `| WAIT_AMOUNT | ${fa.by_state.WAIT_AMOUNT} |`,
    '',
    '### WAIT_INTENT Failure Samples',
    '',
    ...renderFailureSamples(fa.samples.WAIT_INTENT),
    '',
    '### WAIT_NAME Failure Samples',
    '',
    ...renderFailureSamples(fa.samples.WAIT_NAME),
    '',
    '### WAIT_AMOUNT Failure Samples',
    '',
    ...renderFailureSamples(fa.samples.WAIT_AMOUNT),
    '',
    '## Tuning Recommendations',
    '',
    ...r.tuning_recommendations.map((rec) => [
      `### [${rec.priority}] ${rec.area} — ${rec.metric}`,
      '',
      rec.current !== null ? `- **Current**: ${rec.current}  ` : '',
      rec.target  !== null ? `- **Target**: ${rec.target}  `  : '',
      `- **Action**: ${rec.action}`,
      '',
    ].filter(Boolean)).flat(),
  ];

  return lines.join('\n');
};

const renderFailureSamples = (samples) => {
  if (!samples || samples.length === 0) return ['_None_'];
  return samples.map((f) =>
    `- \`${f.text}\` (${f.noise_tag}) → expected \`${f.expected}\` got \`${f.predicted}\` (conf=${f.confidence})`
  );
};

main();
