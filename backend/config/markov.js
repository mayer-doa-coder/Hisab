const { MARKOV_STATE_CONFIG } = require('./markovStates');

const MARKOV_CONFIG = Object.freeze({
  states: Object.freeze(MARKOV_STATE_CONFIG.states.map((item) => item.key)),
  smoothingAlpha: 0.5,
  useRegimes: true,
  enableConditional: false,
  maxGapDays: 14,
  regimeThresholds: {
    highVolatilityMin: 0.04,
    lowVolatilityMax: 0.02,
    stressedCongestionMin: 0.45,
    stressedSpreadStressMin: 0.008,
    stressedLiquidityStressMin: 0.6,
    stableCongestionMax: 0.2,
  },
  rollingWindows: [7, 30],
  forecast: {
    defaultSimulationCount: 2000,
    minSimulationCount: 200,
    maxSimulationCount: 5000,
    maxStoredPathsPerHorizon: 40,
    maxHorizonSteps: 365,
  },
  conditionalGate: {
    minAucPrGain: 0.005,
    minRecallAtPrecisionGain: 0,
    maxBrierIncrease: 0,
    maxEceIncrease: 0,
  },
});

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const getMarkovConfig = () => deepClone(MARKOV_CONFIG);

module.exports = {
  MARKOV_CONFIG,
  getMarkovConfig,
};
