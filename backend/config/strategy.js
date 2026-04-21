const STRATEGY_CONFIG = Object.freeze({
  gainThreshold: 0.65,
  lossThreshold: 0.6,
  maxDrawdown: -0.1,
  turnoverLimit: 0.2,
  exposureBounds: [0.1, 0.8],
  expectedReturnNeutralBand: [-0.01, 0.01],
  uncertaintyThreshold: 0.08,
  exposureStep: 0.05,
});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const normalizeBounds = (bounds, fallback) => {
  const source = Array.isArray(bounds) && bounds.length >= 2 ? bounds : fallback;
  const left = Number(source[0]);
  const right = Number(source[1]);

  const min = Number.isFinite(left) ? left : fallback[0];
  const max = Number.isFinite(right) ? right : fallback[1];

  return min <= max ? [min, max] : [max, min];
};

const toNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveStrategyConfig = (override = null) => {
  const base = deepClone(STRATEGY_CONFIG);
  if (!override || typeof override !== 'object') {
    return base;
  }

  return {
    ...base,
    ...override,
    gainThreshold: toNumber(override.gainThreshold, base.gainThreshold),
    lossThreshold: toNumber(override.lossThreshold, base.lossThreshold),
    maxDrawdown: toNumber(override.maxDrawdown, base.maxDrawdown),
    turnoverLimit: toNumber(override.turnoverLimit, base.turnoverLimit),
    uncertaintyThreshold: toNumber(override.uncertaintyThreshold, base.uncertaintyThreshold),
    exposureStep: toNumber(override.exposureStep, base.exposureStep),
    exposureBounds: normalizeBounds(override.exposureBounds, base.exposureBounds),
    expectedReturnNeutralBand: normalizeBounds(override.expectedReturnNeutralBand, base.expectedReturnNeutralBand),
  };
};

module.exports = {
  STRATEGY_CONFIG,
  resolveStrategyConfig,
  getStrategyConfig: () => deepClone(STRATEGY_CONFIG),
};
