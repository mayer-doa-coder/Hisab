const { resolveStrategyConfig } = require('../config/strategy');

const ACTIONS = Object.freeze({
  HOLD: 'HOLD',
  REDUCE: 'REDUCE',
  ACCUMULATE: 'ACCUMULATE',
});

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeAction = (value, fallback = ACTIONS.HOLD) => {
  const token = String(value || '').trim().toUpperCase();
  if (token === ACTIONS.HOLD || token === ACTIONS.REDUCE || token === ACTIONS.ACCUMULATE) {
    return token;
  }
  return fallback;
};

const normalizeForecastInput = (forecast = {}) => {
  const gainProb = toNumber(forecast.gain_prob ?? forecast.gain_probability, 0);
  const lossProb = toNumber(forecast.loss_prob ?? forecast.loss_probability, 0);
  const expectedReturn = toNumber(forecast.expected_return, 0);

  const bandArray = Array.isArray(forecast.band)
    ? forecast.band
    : [
      toNumber(forecast?.return_band?.p10, 0),
      toNumber(forecast?.return_band?.p90, 0),
    ];

  const downside = toNumber(
    forecast.downside
      ?? forecast?.downside_risk?.value_at_risk_95,
    0
  );
  const uncertainty = toNumber(
    forecast.uncertainty
      ?? forecast?.uncertainty?.standard_deviation,
    0
  );

  return {
    gain_prob: clamp(gainProb, 0, 1),
    loss_prob: clamp(lossProb, 0, 1),
    expected_return: expectedReturn,
    band: [toNumber(bandArray[0], 0), toNumber(bandArray[1], 0)],
    downside,
    uncertainty: Math.max(0, uncertainty),
  };
};

const resolveRiskContext = ({ constraints = {}, strategyConfigOverride = null } = {}) => {
  const config = resolveStrategyConfig(strategyConfigOverride);
  const exposureBounds = Array.isArray(constraints?.exposureBounds) && constraints.exposureBounds.length >= 2
    ? constraints.exposureBounds
    : config.exposureBounds;
  const bounds = [
    toNumber(exposureBounds[0], config.exposureBounds[0]),
    toNumber(exposureBounds[1], config.exposureBounds[1]),
  ];
  const normalizedBounds = bounds[0] <= bounds[1] ? bounds : [bounds[1], bounds[0]];

  return {
    gainThreshold: toNumber(constraints?.gainThreshold, config.gainThreshold),
    lossThreshold: toNumber(constraints?.lossThreshold, config.lossThreshold),
    maxDrawdown: toNumber(constraints?.maxDrawdown, config.maxDrawdown),
    turnoverLimit: toNumber(constraints?.turnoverLimit, config.turnoverLimit),
    uncertaintyThreshold: toNumber(constraints?.uncertaintyThreshold, config.uncertaintyThreshold),
    expectedReturnNeutralBand: Array.isArray(constraints?.expectedReturnNeutralBand)
      && constraints.expectedReturnNeutralBand.length >= 2
      ? [
        toNumber(constraints.expectedReturnNeutralBand[0], config.expectedReturnNeutralBand[0]),
        toNumber(constraints.expectedReturnNeutralBand[1], config.expectedReturnNeutralBand[1]),
      ]
      : [...config.expectedReturnNeutralBand],
    exposureBounds: normalizedBounds,
    exposureStep: Math.max(0, toNumber(constraints?.exposureStep, config.exposureStep)),
    currentExposure: toNumber(constraints?.currentExposure, normalizedBounds[0]),
    turnoverRate: toNumber(
      constraints?.turnoverRate
      ?? constraints?.recentTurnover
      ?? constraints?.turnover,
      0
    ),
    previousAction: normalizeAction(
      constraints?.previousAction
      ?? constraints?.lastAction
      ?? constraints?.currentAction,
      ACTIONS.HOLD
    ),
  };
};

const resolveTargetExposure = ({ action, context }) => {
  const minExposure = context.exposureBounds[0];
  const maxExposure = context.exposureBounds[1];
  const current = clamp(context.currentExposure, minExposure, maxExposure);

  if (action === ACTIONS.ACCUMULATE) {
    return clamp(current + context.exposureStep, minExposure, maxExposure);
  }
  if (action === ACTIONS.REDUCE) {
    return clamp(current - context.exposureStep, minExposure, maxExposure);
  }
  return current;
};

const applyHardRiskConstraints = ({ candidateAction, forecast = {}, context, reasons = [] } = {}) => {
  const outputReasons = [...reasons];
  let finalAction = normalizeAction(candidateAction, ACTIONS.HOLD);

  if (forecast.downside <= context.maxDrawdown) {
    finalAction = ACTIONS.REDUCE;
    outputReasons.push('Drawdown budget exceeded; forced REDUCE.');
  }

  const targetExposure = resolveTargetExposure({ action: finalAction, context });
  if (finalAction === ACTIONS.ACCUMULATE && targetExposure >= context.exposureBounds[1] && context.currentExposure >= context.exposureBounds[1]) {
    finalAction = ACTIONS.HOLD;
    outputReasons.push('Exposure already at upper bound; cannot ACCUMULATE.');
  }
  if (finalAction === ACTIONS.REDUCE && targetExposure <= context.exposureBounds[0] && context.currentExposure <= context.exposureBounds[0]) {
    finalAction = ACTIONS.HOLD;
    outputReasons.push('Exposure already at lower bound; cannot REDUCE further.');
  }

  const isSwitch = finalAction !== context.previousAction;
  if (isSwitch && context.turnoverRate > context.turnoverLimit) {
    finalAction = context.previousAction;
    outputReasons.push('Turnover cap reached; action switch blocked.');
  }

  return {
    action: finalAction,
    reason: [...new Set(outputReasons)],
    target_exposure: resolveTargetExposure({ action: finalAction, context }),
  };
};

module.exports = {
  ACTIONS,
  normalizeForecastInput,
  resolveRiskContext,
  resolveTargetExposure,
  applyHardRiskConstraints,
};
