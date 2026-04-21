const {
  buildLogisticDirectionPrediction,
  buildLogisticRiskPrediction,
} = require('../models/baseline/logisticModel');
const { buildLinearRiskScorePrediction } = require('../models/baseline/linearModel');
const { decideAction } = require('../strategy/decisionEngine');

const ACTIONS = Object.freeze({
  HOLD: 'HOLD',
  REDUCE: 'REDUCE',
  ACCUMULATE: 'ACCUMULATE',
});

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeState = (value) => String(value || '').trim().toUpperCase() || 'SIDEWAYS_STABLE';

const isRiskState = (value) => {
  const state = normalizeState(value);
  return [
    'LIQUIDITY_STRESS',
    'QUEUE_PRESSURE',
    'HIGH_VOLATILITY',
    'DOWNTREND',
  ].includes(state);
};

const baselineSignalFromFeatures = (queueFeatures = {}) => {
  const logisticDirection = buildLogisticDirectionPrediction(queueFeatures);
  const logisticRisk = buildLogisticRiskPrediction(queueFeatures);
  const linearRisk = buildLinearRiskScorePrediction(queueFeatures);

  const riskProb = Math.min(
    1,
    Math.max(
      0,
      (toNumber(logisticRisk.probability, 0.5) + Math.max(0, Math.min(1, toNumber(linearRisk.prediction, 50) / 100))) / 2
    )
  );

  const gainProb = 1 - riskProb;
  const expectedReturn = (gainProb - riskProb) * 0.02;

  return {
    gain_prob: Number(gainProb.toFixed(6)),
    loss_prob: Number(riskProb.toFixed(6)),
    expected_return: Number(expectedReturn.toFixed(6)),
    band: [
      Number((expectedReturn - 0.02).toFixed(6)),
      Number((expectedReturn + 0.02).toFixed(6)),
    ],
    downside: Number((expectedReturn - 0.025).toFixed(6)),
    uncertainty: Number(Math.abs(0.5 - riskProb).toFixed(6)),
    baseline_direction_class: logisticDirection.prediction,
    baseline_risk_bucket: logisticRisk.prediction,
  };
};

const applyFallback = ({
  decision,
  decisionSignal,
  currentState,
  queueFeatures,
  failureReport,
  constraints = {},
  strategyConfigOverride = null,
} = {}) => {
  const originalDecision = decision || {
    action: ACTIONS.HOLD,
    confidence: 0,
    reason: ['No decision available'],
  };

  const report = failureReport || {
    failure: false,
    reasons: [],
    low_confidence: false,
    data_missing: false,
    extreme_stress: false,
    confidence: { score: toNumber(originalDecision?.confidence, 0) },
  };

  if (report.failure !== true) {
    return {
      ...originalDecision,
      fallback: false,
      fallback_source: null,
      fallback_reason: [],
      confidence: toNumber(originalDecision?.confidence, 0),
    };
  }

  const reasons = [...new Set(report.reasons || [])];

  if (report.extreme_stress) {
    const conservativeAction = toNumber(decisionSignal?.loss_prob, 0) >= toNumber(decisionSignal?.gain_prob, 0)
      ? ACTIONS.REDUCE
      : ACTIONS.HOLD;

    return {
      action: conservativeAction,
      confidence: Number(Math.max(0.2, Math.min(1, toNumber(report?.confidence?.score, 0.3))).toFixed(6)),
      fallback: true,
      fallback_source: 'EXTREME_STRESS_GUARDRAIL',
      reason: reasons.length > 0 ? reasons : ['Extreme stress'],
      fallback_reason: reasons.length > 0 ? reasons : ['Extreme stress'],
      target_exposure: originalDecision?.target_exposure,
      current_state: normalizeState(currentState),
      original_action: originalDecision?.action || ACTIONS.HOLD,
    };
  }

  if (report.data_missing) {
    const heuristicAction = isRiskState(currentState) ? ACTIONS.REDUCE : ACTIONS.HOLD;
    return {
      action: heuristicAction,
      confidence: Number(Math.max(0.15, Math.min(0.6, toNumber(report?.confidence?.score, 0.3))).toFixed(6)),
      fallback: true,
      fallback_source: 'HEURISTIC_LAST_STATE',
      reason: reasons.length > 0 ? reasons : ['Data unavailable'],
      fallback_reason: reasons.length > 0 ? reasons : ['Data unavailable'],
      target_exposure: originalDecision?.target_exposure,
      current_state: normalizeState(currentState),
      original_action: originalDecision?.action || ACTIONS.HOLD,
    };
  }

  if (report.low_confidence) {
    const baselineSignal = baselineSignalFromFeatures(queueFeatures || {});
    const baselineDecision = decideAction(
      baselineSignal,
      currentState,
      constraints || {},
      strategyConfigOverride || null
    );

    return {
      ...baselineDecision,
      fallback: true,
      fallback_source: 'BASELINE_MODEL',
      reason: reasons.length > 0 ? reasons : ['Low confidence'],
      fallback_reason: reasons.length > 0 ? reasons : ['Low confidence'],
      baseline_signal: baselineSignal,
      current_state: normalizeState(currentState),
      original_action: originalDecision?.action || ACTIONS.HOLD,
    };
  }

  return {
    ...originalDecision,
    fallback: false,
    fallback_source: null,
    fallback_reason: [],
  };
};

module.exports = {
  ACTIONS,
  applyFallback,
  baselineSignalFromFeatures,
};
