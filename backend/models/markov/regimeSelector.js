const { buildLagSafeFeatureSet } = require('../../features/featureBuilder');

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const selectRegime = ({ markovFeatures = {}, queueFeatures = {}, thresholds = {} } = {}) => {
  const volatility = toNumber(markovFeatures.volatility_ratio, 0);
  const liquidityStress = toNumber(markovFeatures.liquidity_stress_score, 0);
  const congestion = toNumber(queueFeatures.congestion, 0);
  const spreadStress = toNumber(queueFeatures.spread_stress, 0);

  if (
    congestion >= toNumber(thresholds.stressedCongestionMin, 0.45)
    || spreadStress >= toNumber(thresholds.stressedSpreadStressMin, 0.008)
    || liquidityStress >= toNumber(thresholds.stressedLiquidityStressMin, 0.6)
  ) {
    return 'STRESSED';
  }

  if (volatility >= toNumber(thresholds.highVolatilityMin, 0.04)) {
    return 'HIGH_VOLATILITY';
  }

  if (
    volatility <= toNumber(thresholds.lowVolatilityMax, 0.02)
    && congestion <= toNumber(thresholds.stableCongestionMax, 0.2)
  ) {
    return 'LOW_VOLATILITY';
  }

  return 'STABLE';
};

const annotateSequencesWithRegimes = ({
  sequences = [],
  thresholds = {},
  rollingWindows = [7, 30],
} = {}) => {
  const annotated = [];

  for (const sequence of Array.isArray(sequences) ? sequences : []) {
    const entityRows = sequence.points.map((point) => point.observation);
    const points = sequence.points.map((point) => {
      const featureSet = buildLagSafeFeatureSet({
        rows: entityRows,
        anchorTimestamp: point.t,
        windows: rollingWindows,
      });

      const selectedFeatures = featureSet.selected_features || {
        imbalance_pressure: 0,
        arrival_rate: 0,
        service_rate: 0,
        congestion: 0,
        spread_stress: 0,
        execution_delay: 0,
      };

      const regime = selectRegime({
        markovFeatures: point.observation?.markov_features || {},
        queueFeatures: selectedFeatures,
        thresholds,
      });

      return {
        ...point,
        regime,
        queue_features: selectedFeatures,
      };
    });

    annotated.push({
      ...sequence,
      points,
    });
  }

  return annotated;
};

module.exports = {
  selectRegime,
  annotateSequencesWithRegimes,
};
