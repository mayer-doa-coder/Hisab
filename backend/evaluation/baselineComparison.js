const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundSix = (value) => {
  const numeric = toNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(6));
};

const safeImprovement = ({ baseline, contender, higherIsBetter = true } = {}) => {
  const b = toNumber(baseline, null);
  const c = toNumber(contender, null);
  if (b === null || c === null) {
    return null;
  }

  const denominator = Math.max(Math.abs(b), 1e-9);
  const raw = higherIsBetter
    ? (c - b) / denominator
    : (b - c) / denominator;

  return roundSix(raw);
};

const compareModels = ({ ensemble = {}, baseline = {} } = {}) => {
  const stockoutReduction = safeImprovement({
    baseline: baseline.stockout_rate,
    contender: ensemble.stockout_rate,
    higherIsBetter: false,
  });

  const excessInventoryReduction = safeImprovement({
    baseline: baseline.excess_inventory,
    contender: ensemble.excess_inventory,
    higherIsBetter: false,
  });

  const precisionGain = safeImprovement({
    baseline: baseline.precision,
    contender: ensemble.precision,
    higherIsBetter: true,
  });

  const calibrationGain = safeImprovement({
    baseline: baseline.calibration,
    contender: ensemble.calibration,
    higherIsBetter: false,
  });

  const turnoverGain = safeImprovement({
    baseline: baseline.inventory_turnover,
    contender: ensemble.inventory_turnover,
    higherIsBetter: true,
  });

  return {
    stockout_reduction: stockoutReduction,
    excess_inventory_reduction: excessInventoryReduction,
    precision_gain: precisionGain,
    calibration_gain: calibrationGain,
    inventory_turnover_improvement: turnoverGain,
    ensemble_outperforms_baseline: Boolean(
      (precisionGain !== null && precisionGain > 0)
      && (stockoutReduction !== null && stockoutReduction > 0)
      && (excessInventoryReduction !== null && excessInventoryReduction > 0)
    ),
  };
};

module.exports = {
  compareModels,
};
