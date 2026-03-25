const DEFAULT_RULE_CONFIG = {
  windowDays: 30,
  leadTimeDays: 3,
  reviewPeriodDays: 7,
  safetyDays: 2,
  minOrderQuantity: 1,
};

export const PREDICTOR_TYPES = {
  RULE_BASED: 'rule-based',
  MARKOV_CHAIN: 'markov-chain',
};

const normalizePositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.max(1, Math.trunc(numeric));
};

const normalizeNonNegativeInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Math.max(0, Math.trunc(numeric));
};

export const normalizeRuleConfig = (config = {}) => {
  const base = { ...DEFAULT_RULE_CONFIG, ...config };

  return {
    windowDays: normalizePositiveInt(base.windowDays, DEFAULT_RULE_CONFIG.windowDays),
    leadTimeDays: normalizePositiveInt(base.leadTimeDays, DEFAULT_RULE_CONFIG.leadTimeDays),
    reviewPeriodDays: normalizePositiveInt(base.reviewPeriodDays, DEFAULT_RULE_CONFIG.reviewPeriodDays),
    safetyDays: normalizeNonNegativeInt(base.safetyDays, DEFAULT_RULE_CONFIG.safetyDays),
    minOrderQuantity: normalizePositiveInt(base.minOrderQuantity, DEFAULT_RULE_CONFIG.minOrderQuantity),
  };
};

const buildSalesStatsByProduct = (salesRows, windowDays) => {
  const statsMap = new Map();

  for (const row of salesRows || []) {
    const productId = Number(row.product_id);
    const unitsSold = Math.max(0, Number(row.units_sold || 0));

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(unitsSold)) {
      continue;
    }

    const existing = statsMap.get(productId) || {
      totalUnitsSold: 0,
      salesDays: 0,
    };

    existing.totalUnitsSold += unitsSold;
    existing.salesDays += unitsSold > 0 ? 1 : 0;
    statsMap.set(productId, existing);
  }

  for (const [productId, stats] of statsMap.entries()) {
    statsMap.set(productId, {
      totalUnitsSold: stats.totalUnitsSold,
      salesDays: stats.salesDays,
      dailySalesRate: stats.totalUnitsSold / windowDays,
    });
  }

  return statsMap;
};

const roundToTwo = (value) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Math.round(value * 100) / 100;
};

const buildReasonText = ({ reorderByDays, reorderByStock, dailySalesRate, daysRemaining }) => {
  if (reorderByDays && reorderByStock) {
    return 'Low projected days remaining and stock below reorder point.';
  }

  if (reorderByDays) {
    return 'Projected stockout before lead time ends.';
  }

  if (reorderByStock) {
    return 'Current stock is below reorder point.';
  }

  if (dailySalesRate <= 0) {
    return 'No recent sales trend detected.';
  }

  if (!Number.isFinite(daysRemaining)) {
    return 'Stable stock level based on current trend.';
  }

  return 'Stock level is currently healthy.';
};

export const buildRuleBasedReorderSuggestions = ({ products, salesRows, config }) => {
  const normalizedConfig = normalizeRuleConfig(config);
  const statsByProduct = buildSalesStatsByProduct(salesRows, normalizedConfig.windowDays);

  return (products || [])
    .map((product) => {
      const productId = Number(product.id);
      const quantity = Math.max(0, Math.trunc(Number(product.quantity || 0)));
      const threshold = Math.max(0, Math.trunc(Number(product.low_stock_threshold || 5)));
      const stats = statsByProduct.get(productId) || {
        totalUnitsSold: 0,
        salesDays: 0,
        dailySalesRate: 0,
      };

      const dailySalesRate = Math.max(0, Number(stats.dailySalesRate || 0));
      const safetyStockUnits = Math.max(threshold, Math.ceil(dailySalesRate * normalizedConfig.safetyDays));
      const reorderPoint = Math.max(threshold, Math.ceil(dailySalesRate * normalizedConfig.leadTimeDays) + safetyStockUnits);
      const targetLevel = Math.max(
        reorderPoint,
        Math.ceil(dailySalesRate * (normalizedConfig.leadTimeDays + normalizedConfig.reviewPeriodDays)) + safetyStockUnits
      );

      const daysRemaining = dailySalesRate > 0 ? quantity / dailySalesRate : Number.POSITIVE_INFINITY;
      const reorderByStock = quantity <= reorderPoint;
      const reorderByDays = dailySalesRate > 0 && daysRemaining <= normalizedConfig.leadTimeDays;
      const shouldReorder = reorderByStock || reorderByDays;

      let suggestedOrderQuantity = 0;
      if (shouldReorder) {
        suggestedOrderQuantity = Math.max(
          normalizedConfig.minOrderQuantity,
          Math.ceil(targetLevel - quantity)
        );
      }

      if (!shouldReorder && dailySalesRate <= 0 && quantity <= threshold) {
        suggestedOrderQuantity = Math.max(normalizedConfig.minOrderQuantity, threshold * 2 - quantity);
      }

      const urgencyScore = shouldReorder
        ? reorderByDays
          ? 3
          : quantity <= threshold
            ? 2
            : 1
        : 0;

      return {
        productId,
        productName: String(product.name || ''),
        quantity,
        threshold,
        totalUnitsSold: Math.trunc(stats.totalUnitsSold || 0),
        salesDays: Math.trunc(stats.salesDays || 0),
        dailySalesRate: roundToTwo(dailySalesRate),
        daysRemaining: Number.isFinite(daysRemaining) ? roundToTwo(daysRemaining) : null,
        reorderPoint,
        targetLevel,
        shouldReorder,
        suggestedOrderQuantity: Math.max(0, Math.trunc(suggestedOrderQuantity)),
        urgencyScore,
        reason: buildReasonText({ reorderByDays, reorderByStock, dailySalesRate, daysRemaining }),
      };
    })
    .sort((a, b) => {
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }

      if (a.shouldReorder !== b.shouldReorder) {
        return a.shouldReorder ? -1 : 1;
      }

      return a.productName.localeCompare(b.productName);
    });
};

const createRuleBasedPredictor = () => ({
  type: PREDICTOR_TYPES.RULE_BASED,
  predict: ({ products, salesRows, config }) =>
    buildRuleBasedReorderSuggestions({ products, salesRows, config }),
});

const createMarkovChainPredictor = () => ({
  type: PREDICTOR_TYPES.MARKOV_CHAIN,
  predict: () => {
    throw new Error('Markov Chain predictor is not implemented yet.');
  },
});

export const createReorderPredictor = (type = PREDICTOR_TYPES.RULE_BASED) => {
  if (type === PREDICTOR_TYPES.MARKOV_CHAIN) {
    return createMarkovChainPredictor();
  }

  return createRuleBasedPredictor();
};
