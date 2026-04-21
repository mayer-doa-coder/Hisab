const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundSix = (value) => {
  if (!Number.isFinite(value)) {
    return NaN;
  }

  return Number(Number(value).toFixed(6));
};

const calculateSafetyStock = ({
  z = 1.65,
  volatility = 0,
  leadTime = 0,
} = {}) => {
  const safeZ = Math.max(0, toNumber(z, 1.65));
  const safeVolatility = Math.max(0, toNumber(volatility, 0));
  const safeLeadTime = Math.max(0, toNumber(leadTime, 0));

  const safetyStock = safeZ * safeVolatility * Math.sqrt(safeLeadTime);
  return roundSix(Math.max(0, safetyStock));
};

const calculateROP = ({
  salesVelocity = 0,
  leadTime = 0,
  safetyStock = 0,
} = {}) => {
  const safeVelocity = Math.max(0, toNumber(salesVelocity, 0));
  const safeLeadTime = Math.max(0, toNumber(leadTime, 0));
  const safeSafetyStock = Math.max(0, toNumber(safetyStock, 0));

  const reorderPoint = (safeVelocity * safeLeadTime) + safeSafetyStock;
  return roundSix(Math.max(0, reorderPoint));
};

const calculateDaysRemaining = ({
  stockPosition = 0,
  salesVelocity = 0,
  maxDays = 3650,
} = {}) => {
  const safeStock = Math.max(0, toNumber(stockPosition, 0));
  const safeVelocity = Math.max(0, toNumber(salesVelocity, 0));

  if (safeVelocity <= 0) {
    return roundSix(maxDays);
  }

  const daysRemaining = safeStock / safeVelocity;
  return roundSix(clamp(daysRemaining, 0, Math.max(1, toNumber(maxDays, 3650))));
};

module.exports = {
  calculateSafetyStock,
  calculateROP,
  calculateDaysRemaining,
};
