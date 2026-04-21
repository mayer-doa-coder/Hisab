const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return Number(Number(value).toFixed(6));
};

const evaluateRisk = ({
  daysRemaining = 0,
  leadTime = 0,
} = {}) => {
  const safeDaysRemaining = Math.max(0, toNumber(daysRemaining, 0));
  const safeLeadTime = Math.max(0, toNumber(leadTime, 0));

  if (safeLeadTime <= 0) {
    return {
      stockout_risk: RISK_LEVELS.LOW,
      risk_ratio: roundSix(0),
    };
  }

  const ratio = safeDaysRemaining / safeLeadTime;
  const safeRatio = Number.isFinite(ratio) ? ratio : 0;

  if (safeRatio < 1) {
    return {
      stockout_risk: RISK_LEVELS.HIGH,
      risk_ratio: roundSix(safeRatio),
    };
  }

  if (safeRatio >= 1 && safeRatio <= 1.2) {
    return {
      stockout_risk: RISK_LEVELS.MEDIUM,
      risk_ratio: roundSix(safeRatio),
    };
  }

  return {
    stockout_risk: RISK_LEVELS.LOW,
    risk_ratio: roundSix(safeRatio),
  };
};

module.exports = {
  RISK_LEVELS,
  evaluateRisk,
};
