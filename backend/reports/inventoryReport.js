const Product = require('../models/Product');
const SalesHeader = require('../models/SalesHeader');
const SalesItem = require('../models/SalesItem');
const InventoryBatch = require('../models/InventoryBatch');
const {
  buildDateRangeMatch,
  buildScopedMatch,
  toNumber,
  roundCurrency,
  isReconciled,
  formatRangeForResponse,
} = require('./reportUtils');

const generateInventoryReport = async ({
  userId,
  branchId = null,
  period,
  dateRange,
  deadStockWindowDays = 60,
  detailLimit = 100,
} = {}) => {
  const generatedAt = new Date();
  const scopedProductMatch = {
    ...buildScopedMatch(Product, { userId, branchId }),
  };

  const products = await Product.find(scopedProductMatch)
    .sort({ name: 1 })
    .select('name sku unit quantityOnHand reorderLevel price')
    .lean();

  const totalSkus = products.length;
  const totalUnits = products.reduce((sum, row) => sum + Math.max(0, toNumber(row.quantityOnHand, 0)), 0);
  const totalStockValueAtSale = products.reduce(
    (sum, row) => sum + Math.max(0, toNumber(row.quantityOnHand, 0)) * Math.max(0, toNumber(row.price, 0)),
    0
  );

  const lowStockItems = products
    .filter((row) => toNumber(row.quantityOnHand, 0) <= toNumber(row.reorderLevel, 0))
    .slice(0, Math.max(1, Number(detailLimit) || 100))
    .map((row) => ({
      productId: String(row._id),
      productName: row.name,
      sku: row.sku || null,
      quantityOnHand: toNumber(row.quantityOnHand, 0),
      reorderLevel: toNumber(row.reorderLevel, 0),
      unit: row.unit || 'pcs',
    }));

  const lookbackStart = new Date(dateRange.to);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - Math.max(1, Math.trunc(toNumber(deadStockWindowDays, 60))));

  const salesHeaderMatch = {
    ...buildScopedMatch(SalesHeader, { userId, branchId }),
    status: 'posted',
    saleAt: buildDateRangeMatch({ from: lookbackStart, to: dateRange.to }),
  };

  const recentHeaders = await SalesHeader.find(salesHeaderMatch).select('_id').lean();
  const recentHeaderIds = recentHeaders.map((row) => row._id);

  let recentlySoldProductIds = [];
  if (recentHeaderIds.length > 0) {
    recentlySoldProductIds = await SalesItem.distinct('productId', {
      ...buildScopedMatch(SalesItem, { userId, branchId }),
      salesHeaderId: { $in: recentHeaderIds },
    });
  }

  const soldIdSet = new Set(recentlySoldProductIds.map((id) => String(id)));

  const deadStockItems = products
    .filter((row) => toNumber(row.quantityOnHand, 0) > 0 && !soldIdSet.has(String(row._id)))
    .slice(0, Math.max(1, Number(detailLimit) || 100))
    .map((row) => ({
      productId: String(row._id),
      productName: row.name,
      sku: row.sku || null,
      quantityOnHand: toNumber(row.quantityOnHand, 0),
      unit: row.unit || 'pcs',
      stockValueAtSale: roundCurrency(toNumber(row.quantityOnHand, 0) * toNumber(row.price, 0)),
    }));

  const batchAggRows = await InventoryBatch.aggregate([
    {
      $match: {
        ...buildScopedMatch(InventoryBatch, { userId, branchId }),
      },
    },
    {
      $group: {
        _id: null,
        totalBatchQuantity: { $sum: '$quantity' },
        totalBatchValueAtCost: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
      },
    },
  ]);

  const batchAgg = batchAggRows[0] || { totalBatchQuantity: 0, totalBatchValueAtCost: 0 };
  const stockDeltaUnits = toNumber(totalUnits, 0) - toNumber(batchAgg.totalBatchQuantity, 0);

  return {
    reportType: 'inventory',
    generatedAt: generatedAt.toISOString(),
    dateRange: formatRangeForResponse({ ...dateRange, period }),
    dataSources: ['inventory_batches', 'sales_header', 'sales_items'],
    summary: {
      totalSkus,
      totalUnits: roundCurrency(totalUnits),
      totalStockValueAtSale: roundCurrency(totalStockValueAtSale),
      totalStockValueAtCost: roundCurrency(batchAgg.totalBatchValueAtCost),
      lowStockCount: lowStockItems.length,
      deadStockCount: deadStockItems.length,
    },
    breakdown: {
      currentStockLevels: products.slice(0, Math.max(1, Number(detailLimit) || 100)).map((row) => ({
        productId: String(row._id),
        productName: row.name,
        sku: row.sku || null,
        quantityOnHand: toNumber(row.quantityOnHand, 0),
        reorderLevel: toNumber(row.reorderLevel, 0),
        unit: row.unit || 'pcs',
        stockValueAtSale: roundCurrency(toNumber(row.quantityOnHand, 0) * toNumber(row.price, 0)),
      })),
      lowStockItems,
      deadStockItems,
    },
    reconciliation: {
      checks: [
        {
          label: 'inventory_products_vs_inventory_batches_quantity',
          expected: roundCurrency(batchAgg.totalBatchQuantity),
          actual: roundCurrency(totalUnits),
          delta: roundCurrency(stockDeltaUnits),
          reconciled: isReconciled(stockDeltaUnits),
        },
      ],
      reconciled: isReconciled(stockDeltaUnits),
    },
    timestamps: {
      generatedAt: generatedAt.toISOString(),
      sourceWindowFrom: dateRange.from.toISOString(),
      sourceWindowTo: dateRange.to.toISOString(),
    },
  };
};

module.exports = {
  generateInventoryReport,
};
