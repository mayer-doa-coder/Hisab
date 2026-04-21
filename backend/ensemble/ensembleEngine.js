const { adjustWeights } = require('./weightAdjuster');
const { applyFallback } = require('./fallbackHandler');

const SCORE_THRESHOLDS = Object.freeze({
  high: 0.67,
  mid: 0.45,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundToSix = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(6));
};

const computeThresholdScore = (threshold = {}) => {
  const decision = String(threshold?.decision || 'NO_REORDER').trim().toUpperCase();
  return decision === 'REORDER' ? 1 : 0;
};

const computeMarkovScore = (markov = {}) => {
  const distribution = markov?.next_state_distribution || {};
  const highDemand = clamp(toNumber(distribution.HIGH_DEMAND, 0), 0, 1);
  const stable = clamp(toNumber(distribution.STABLE, 0), 0, 1);
  const lowDemand = clamp(toNumber(distribution.LOW_DEMAND, 0), 0, 1);

  const directional = clamp((highDemand + (0.5 * stable)) - (0.35 * lowDemand), 0, 1);
  const confidence = clamp(toNumber(markov?.confidence, 0), 0, 1);
  const uncertainty = clamp(toNumber(markov?.uncertainty, 1), 0, 1);

  return clamp(directional * confidence * (1 - (0.5 * uncertainty)), 0, 1);
};

const computeAgreement = ({ emaScore, thresholdScore, markovScore } = {}) => {
  const values = [emaScore, thresholdScore, markovScore].map((value) => clamp(toNumber(value, 0), 0, 1));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + (delta * delta);
  }, 0) / values.length;

  return clamp(1 - Math.sqrt(variance), 0, 1);
};

const mapScoreToDecision = ({ score, mode = 'BUY_NOW_WATCH_HOLD' } = {}) => {
  const normalizedMode = String(mode || 'BUY_NOW_WATCH_HOLD').trim().toUpperCase();

  if (normalizedMode === 'REORDER_NO_REORDER') {
    return score >= SCORE_THRESHOLDS.mid ? 'REORDER' : 'NO_REORDER';
  }

  if (score >= SCORE_THRESHOLDS.high) {
    return 'BUY_NOW';
  }
  if (score >= SCORE_THRESHOLDS.mid) {
    return 'WATCH';
  }
  return 'HOLD';
};

const buildRationale = ({
  decision,
  score,
  weights,
  breakdown,
  reasons,
} = {}) => {
  const parts = [
    `Ensemble decision ${decision} with score ${roundToSix(score)}.`,
    `Weights EMA ${roundToSix(weights.ema)}, Threshold ${roundToSix(weights.threshold)}, Markov ${roundToSix(weights.markov)}.`,
    `Model signals EMA ${roundToSix(breakdown.ema)}, Threshold ${roundToSix(breakdown.threshold)}, Markov ${roundToSix(breakdown.markov)}.`,
  ];

  if (Array.isArray(reasons) && reasons.length > 0) {
    parts.push(reasons.join(' '));
  }

  return parts.join(' ').trim();
};

const combineModels = ({
  symbol = 'UNKNOWN',
  horizon = '1W',
  ema = null,
  threshold = null,
  markov = null,
  context = {},
  thresholds = SCORE_THRESHOLDS,
  mode = 'BUY_NOW_WATCH_HOLD',
  suggestedOrderQuantity = 0,
} = {}) => {
  const fallback = applyFallback({
    inputs: { ema, threshold, markov },
    context,
  });

  if (fallback.forceSafeHold) {
    return {
      symbol: String(symbol || 'UNKNOWN').trim().toUpperCase(),
      horizon: String(horizon || '1W').trim().toUpperCase() || '1W',
      decision: mode === 'REORDER_NO_REORDER' ? 'NO_REORDER' : 'HOLD',
      confidence: 0.15,
      model_breakdown: {
        ema: 0,
        threshold: 0,
        markov: 0,
      },
      weights: {
        ema: 0,
        threshold: 1,
        markov: 0,
      },
      model_votes: {
        ema: 0,
        threshold: 1,
        markov: 0,
      },
      buy_quantity: 0,
      rationale: fallback.fallbackNotes.join(' '),
      diagnostics: {
        score: 0,
        agreement: 0,
        uncertainty: 1,
        fallback_applied: true,
        fallback_notes: fallback.fallbackNotes,
      },
    };
  }

  const safeInputs = fallback.sanitized;

  const emaScore = clamp(toNumber(safeInputs.ema.ema_score, 0.5), 0, 1);
  const thresholdScore = computeThresholdScore(safeInputs.threshold);
  const markovScore = computeMarkovScore(safeInputs.markov);

  const adjusted = adjustWeights({
    context,
    inputs: safeInputs,
  });

  const weights = adjusted.weights;
  const score =
    (weights.ema * emaScore)
    + (weights.threshold * thresholdScore)
    + (weights.markov * markovScore);

  const decision = mapScoreToDecision({
    score,
    mode,
    thresholds,
  });

  const agreement = computeAgreement({
    emaScore,
    thresholdScore,
    markovScore,
  });

  const uncertainty = clamp(toNumber(safeInputs.markov.uncertainty, 1), 0, 1);
  const confidence = clamp(
    (0.5 * agreement)
      + (0.25 * safeInputs.threshold.confidence)
      + (0.25 * safeInputs.markov.confidence)
      - (0.2 * uncertainty),
    0.05,
    0.99
  );

  const buyQuantity = decision === 'BUY_NOW' || decision === 'REORDER'
    ? Math.max(1, Math.trunc(Number(suggestedOrderQuantity || 1)))
    : 0;

  const breakdown = {
    ema: roundToSix(emaScore),
    threshold: roundToSix(thresholdScore),
    markov: roundToSix(markovScore),
  };

  const mergedReasons = [
    ...fallback.fallbackNotes,
    ...adjusted.reasons,
  ];

  return {
    symbol: String(symbol || 'UNKNOWN').trim().toUpperCase(),
    horizon: String(horizon || '1W').trim().toUpperCase() || '1W',
    decision,
    confidence: roundToSix(confidence),
    model_breakdown: breakdown,
    weights: {
      ema: roundToSix(weights.ema),
      threshold: roundToSix(weights.threshold),
      markov: roundToSix(weights.markov),
    },
    model_votes: {
      ema: roundToSix(weights.ema),
      threshold: roundToSix(weights.threshold),
      markov: roundToSix(weights.markov),
    },
    buy_quantity: buyQuantity,
    rationale: buildRationale({
      decision,
      score,
      weights,
      breakdown,
      reasons: mergedReasons,
    }),
    diagnostics: {
      score: roundToSix(score),
      agreement: roundToSix(agreement),
      uncertainty: roundToSix(uncertainty),
      fallback_applied: fallback.fallbackNotes.length > 0,
      fallback_notes: fallback.fallbackNotes,
    },
  };
};

module.exports = {
  SCORE_THRESHOLDS,
  combineModels,
};
