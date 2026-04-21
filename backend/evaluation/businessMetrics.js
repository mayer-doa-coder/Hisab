const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundSix = (value) => Number(toNumber(value, 0).toFixed(6));

const HIGH_DEMAND_STATES = new Set([
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RECOVERY_PHASE',
]);

const LOW_DEMAND_STATES = new Set([
  'DOWNTREND',
  'LIQUIDITY_STRESS',
]);

const resolveDemandMultiplier = (state) => {
  const token = String(state || '').trim().toUpperCase();
  if (HIGH_DEMAND_STATES.has(token)) {
    return 1.35;
  }
  if (LOW_DEMAND_STATES.has(token)) {
    return 0.75;
  }
  return 1;
};

const toReorderDecision = (value) => {
  const token = String(value || '').trim().toUpperCase();
  if (token === 'BUY_NOW' || token === 'REORDER') {
    return 'REORDER';
  }
  return 'NO_REORDER';
};

const simulateInventoryPath = ({
  decisionRows = [],
  actualRows = [],
  initialInventory = 60,
  baseDemand = 10,
  leadTimeSteps = 2,
  targetCoverSteps = 3,
} = {}) => {
  const rows = Array.isArray(decisionRows) ? decisionRows : [];
  const outcomes = Array.isArray(actualRows) ? actualRows : [];

  let inventory = Math.max(1, toNumber(initialInventory, 60));
  const effectiveBaseDemand = Math.max(0.1, toNumber(baseDemand, 10));
  const effectiveLeadTime = Math.max(1, Math.trunc(toNumber(leadTimeSteps, 2)));
  const targetInventory = effectiveBaseDemand * Math.max(1, toNumber(targetCoverSteps, 3));

  const pipeline = [];
  const inventorySeries = [];

  let stockoutEvents = 0;
  let stockoutUnits = 0;
  let totalDemand = 0;
  let excessSum = 0;
  let reorderCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const arrivals = pipeline.filter((entry) => entry.step === index);
    if (arrivals.length > 0) {
      const incoming = arrivals.reduce((sum, entry) => sum + Math.max(0, toNumber(entry.qty, 0)), 0);
      inventory += incoming;
    }

    const decision = rows[index] || {};
    const outcome = outcomes[index] || {};

    const multiplier = resolveDemandMultiplier(outcome?.current_state);
    const demand = Math.max(0, effectiveBaseDemand * multiplier);
    totalDemand += demand;

    const fulfilled = Math.min(inventory, demand);
    const unmet = Math.max(0, demand - inventory);

    if (unmet > 0) {
      stockoutEvents += 1;
      stockoutUnits += unmet;
    }

    inventory = Math.max(0, inventory - fulfilled);

    if (toReorderDecision(decision?.decision) === 'REORDER') {
      reorderCount += 1;
      const suggested = Math.max(0, Math.trunc(toNumber(decision?.suggested_order_quantity, 0)));
      const fallbackQty = Math.max(1, Math.ceil(targetInventory - inventory));
      const orderQty = Math.max(1, suggested || fallbackQty);

      pipeline.push({
        step: index + effectiveLeadTime,
        qty: orderQty,
      });
    }

    excessSum += Math.max(0, inventory - targetInventory);
    inventorySeries.push(roundSix(inventory));
  }

  const avgInventory = inventorySeries.length > 0
    ? inventorySeries.reduce((sum, value) => sum + value, 0) / inventorySeries.length
    : 0;

  const stockoutEventRate = rows.length > 0 ? stockoutEvents / rows.length : 0;
  const stockoutUnitRate = totalDemand > 0 ? stockoutUnits / totalDemand : 0;
  const excessInventoryAvg = rows.length > 0 ? excessSum / rows.length : 0;
  const inventoryTurnover = avgInventory > 0 ? totalDemand / avgInventory : 0;

  return {
    sample_count: rows.length,
    reorder_count: reorderCount,
    stockout_events: stockoutEvents,
    stockout_units: roundSix(stockoutUnits),
    stockout_event_rate: roundSix(stockoutEventRate),
    stockout_unit_rate: roundSix(stockoutUnitRate),
    excess_inventory_avg: roundSix(excessInventoryAvg),
    inventory_turnover: roundSix(inventoryTurnover),
    average_inventory: roundSix(avgInventory),
    total_demand: roundSix(totalDemand),
    inventory_series: inventorySeries,
  };
};

const computeBusinessKPIs = ({
  decisionRows = [],
  actualRows = [],
  initialInventory = 60,
  baseDemand = 10,
  leadTimeSteps = 2,
} = {}) => {
  return simulateInventoryPath({
    decisionRows,
    actualRows,
    initialInventory,
    baseDemand,
    leadTimeSteps,
    targetCoverSteps: 3,
  });
};

module.exports = {
  simulateInventoryPath,
  computeBusinessKPIs,
};
