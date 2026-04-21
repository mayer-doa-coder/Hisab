const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => Number(toNumber(value, 0).toFixed(6));

const mean = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + toNumber(value, 0), 0);
  return total / values.length;
};

const stdDev = (values = [], baseMean = null) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const mu = baseMean === null ? mean(values) : toNumber(baseMean, 0);
  const squared = values.reduce((sum, value) => {
    const delta = toNumber(value, 0) - mu;
    return sum + (delta * delta);
  }, 0);

  return Math.sqrt(squared / values.length);
};

const computeModelAgreement = ({ emaScore = 0, thresholdScore = 0, markovScore = 0 } = {}) => {
  const values = [emaScore, thresholdScore, markovScore]
    .map((value) => clamp(toNumber(value, 0), 0, 1));

  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  return roundSix(1 - clamp(maxValue - minValue, 0, 1));
};

const computeConfidenceBand = ({
  expectedDemand = 0,
  series = [],
  horizonDays = 7,
  sampleDays = 0,
  stateUncertainty = 1,
  modelAgreement = 0,
  trendVolatility = 0,
} = {}) => {
  const safeExpectedDemand = Math.max(0, toNumber(expectedDemand, 0));
  const safeHorizonDays = Math.max(1, Math.trunc(toNumber(horizonDays, 7)));
  const safeSampleDays = Math.max(0, Math.trunc(toNumber(sampleDays, 0)));

  const units = (Array.isArray(series) ? series : []).map((point) => {
    if (point && typeof point === 'object') {
      return Math.max(0, toNumber(point.units, 0));
    }
    return Math.max(0, toNumber(point, 0));
  });

  const baseMean = units.length > 0 ? mean(units) : 0;
  const baseStd = units.length > 0 ? stdDev(units, baseMean) : Math.max(0, toNumber(trendVolatility, 0));
  const horizonStd = baseStd * Math.sqrt(safeHorizonDays);

  const sampleFactor = clamp(safeSampleDays / 60, 0, 1);
  const agreementFactor = clamp(toNumber(modelAgreement, 0), 0, 1);
  const uncertaintyFactor = 1 - clamp(toNumber(stateUncertainty, 1), 0, 1);

  const volatilityRatio = baseMean > 0 ? clamp(baseStd / baseMean, 0, 2) : 1;
  const volatilityPenalty = clamp(volatilityRatio / 2, 0, 1);

  const confidence = clamp(
    0.12
      + (0.34 * sampleFactor)
      + (0.26 * agreementFactor)
      + (0.24 * uncertaintyFactor)
      - (0.2 * volatilityPenalty),
    0.05,
    0.99
  );

  const zFactor = 1 + ((1 - confidence) * 1.5);
  const dynamicFloor = safeExpectedDemand * (0.08 + ((1 - confidence) * 0.3));
  const margin = Math.max(horizonStd * zFactor, dynamicFloor, 0.05);

  const lower = Math.max(0, safeExpectedDemand - margin);
  const upper = Math.max(lower, safeExpectedDemand + margin);

  return {
    expected: roundSix(safeExpectedDemand),
    lower: roundSix(lower),
    upper: roundSix(upper),
    confidence: roundSix(confidence),
    band_width: roundSix(upper - lower),
    components: {
      sample_factor: roundSix(sampleFactor),
      agreement_factor: roundSix(agreementFactor),
      uncertainty_factor: roundSix(uncertaintyFactor),
      volatility_penalty: roundSix(volatilityPenalty),
    },
  };
};

module.exports = {
  computeModelAgreement,
  computeConfidenceBand,
};
