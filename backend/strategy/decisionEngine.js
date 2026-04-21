const {
  ACTIONS,
  normalizeForecastInput,
  resolveRiskContext,
  applyHardRiskConstraints,
} = require('./riskRules');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const decideCandidateAction = ({ forecast, context } = {}) => {
  const reasons = [];

  const expectedLower = Math.min(context.expectedReturnNeutralBand[0], context.expectedReturnNeutralBand[1]);
  const expectedUpper = Math.max(context.expectedReturnNeutralBand[0], context.expectedReturnNeutralBand[1]);

  const accumulateSignal =
    forecast.gain_prob >= context.gainThreshold
    && forecast.expected_return > 0
    && forecast.downside > context.maxDrawdown
    && forecast.uncertainty <= context.uncertaintyThreshold;

  const reduceSignal =
    forecast.loss_prob >= context.lossThreshold
    || forecast.downside <= context.maxDrawdown
    || forecast.uncertainty > context.uncertaintyThreshold;

  if (accumulateSignal) {
    reasons.push('High gain probability and positive expected return.');
    reasons.push('Downside risk within drawdown budget.');
    return {
      action: ACTIONS.ACCUMULATE,
      reason: reasons,
    };
  }

  if (reduceSignal) {
    if (forecast.loss_prob >= context.lossThreshold) {
      reasons.push('High loss probability.');
    }
    if (forecast.downside <= context.maxDrawdown) {
      reasons.push('Downside risk exceeds drawdown budget.');
    }
    if (forecast.uncertainty > context.uncertaintyThreshold) {
      reasons.push('Uncertainty is above acceptable threshold.');
    }
    return {
      action: ACTIONS.REDUCE,
      reason: reasons,
    };
  }

  if (forecast.expected_return >= expectedLower && forecast.expected_return <= expectedUpper) {
    reasons.push('Expected return is within neutral band.');
  } else {
    reasons.push('Signals are mixed across gain, loss, and uncertainty.');
  }

  return {
    action: ACTIONS.HOLD,
    reason: reasons,
  };
};

const computeConfidence = ({ action, forecast, context } = {}) => {
  if (action === ACTIONS.ACCUMULATE) {
    const score = (
      forecast.gain_prob
      + (1 - forecast.loss_prob)
      + clamp((forecast.expected_return + 0.04) / 0.08, 0, 1)
      + clamp((forecast.downside - context.maxDrawdown + 0.15) / 0.2, 0, 1)
      + (1 - clamp(forecast.uncertainty / Math.max(0.0001, context.uncertaintyThreshold), 0, 1))
    ) / 5;
    return Number(clamp(score, 0, 1).toFixed(4));
  }

  if (action === ACTIONS.REDUCE) {
    const score = (
      forecast.loss_prob
      + clamp((-forecast.expected_return + 0.04) / 0.08, 0, 1)
      + clamp((context.maxDrawdown - forecast.downside + 0.15) / 0.2, 0, 1)
      + clamp(forecast.uncertainty / Math.max(0.0001, context.uncertaintyThreshold), 0, 1)
    ) / 4;
    return Number(clamp(score, 0, 1).toFixed(4));
  }

  const holdBalance = 1 - Math.abs(forecast.gain_prob - forecast.loss_prob);
  const holdNeutrality = 1 - clamp(Math.abs(forecast.expected_return), 0, 0.15) / 0.15;
  return Number(clamp((holdBalance + holdNeutrality) / 2, 0, 1).toFixed(4));
};

const decideAction = (forecast, currentState = null, constraints = {}, strategyConfigOverride = null) => {
  const normalizedForecast = normalizeForecastInput(forecast || {});
  const context = resolveRiskContext({
    constraints,
    strategyConfigOverride,
  });

  const baseDecision = decideCandidateAction({
    forecast: normalizedForecast,
    context,
  });

  const constrained = applyHardRiskConstraints({
    candidateAction: baseDecision.action,
    forecast: normalizedForecast,
    context,
    reasons: baseDecision.reason,
  });

  const confidence = computeConfidence({
    action: constrained.action,
    forecast: normalizedForecast,
    context,
  });

  return {
    action: constrained.action,
    confidence,
    reason: constrained.reason,
    target_exposure: constrained.target_exposure,
    current_state: String(currentState || '').trim().toUpperCase() || null,
  };
};

module.exports = {
  decideAction,
};
