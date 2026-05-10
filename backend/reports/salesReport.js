const SalesHeader = require('../models/SalesHeader');
const SalesItem = require('../models/SalesItem');
const Transaction = require('../models/Transaction');
const {
  buildDateRangeMatch,
  getBucketExpression,
  buildScopedMatch,
  toObjectIdIfPossible,
  toNumber,
  roundCurrency,
  isReconciled,
  formatRangeForResponse,
} = require('./reportUtils');

const generateSalesReport = async ({
  userId,
  branchId = null,
  period,
  dateRange,
  detailLimit = 100,
  topLimit = 10,
} = {}) => {
  const generatedAt = new Date();
  const rangeMatch = buildDateRangeMatch(dateRange);
  const headerMatch = {
    ...buildScopedMatch(SalesHeader, { userId, branchId }),
    status: 'posted',
  };

  if (rangeMatch) {
    headerMatch.saleAt = rangeMatch;
  }

  const [headerAggRows, periodRows, transactionRows] = await Promise.all([
    SalesHeader.aggregate([
      { $match: headerMatch },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
        },
      },
    ]),
    SalesHeader.aggregate([
      { $match: headerMatch },
      {
        $group: {
          _id: {
            bucket: getBucketExpression('saleAt', period),
          },
          totalSales: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.bucket': 1 } },
    ]),
    SalesHeader.find(headerMatch)
      .sort({ saleAt: -1 })
      .limit(Math.max(1, Number(detailLimit) || 100))
      .select('receiptId saleAt totalAmount paymentMode status customerId')
      .lean(),
  ]);

  const headerSummary = headerAggRows[0] || { totalSales: 0, transactionCount: 0 };
  const userScopedObjectId = toObjectIdIfPossible(userId);

  const salesItemMatch = {
    ...buildScopedMatch(SalesItem, { userId, branchId }),
  };

  const headerJoinMatch = {
    'header.userId': userScopedObjectId,
    'header.status': 'posted',
    'header.deletedAt': null,
    'header.isArchived': { $ne: true },
  };

  if (rangeMatch) {
    headerJoinMatch['header.saleAt'] = rangeMatch;
  }

  const [topSellingRows, itemTotalsRows, transactionTotalsRows] = await Promise.all([
    SalesItem.aggregate([
      { $match: salesItemMatch },
      {
        $lookup: {
          from: 'salesheaders',
          localField: 'salesHeaderId',
          foreignField: '_id',
          as: 'header',
        },
      },
      { $unwind: '$header' },
      { $match: headerJoinMatch },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $group: {
          _id: '$productId',
          unitsSold: { $sum: '$quantity' },
          grossSales: { $sum: '$subtotal' },
          productName: { $first: { $ifNull: [{ $arrayElemAt: ['$product.name', 0] }, 'Unknown Product'] } },
        },
      },
      { $sort: { unitsSold: -1, grossSales: -1 } },
      { $limit: Math.max(1, Number(topLimit) || 10) },
    ]),
    SalesItem.aggregate([
      { $match: salesItemMatch },
      {
        $lookup: {
          from: 'salesheaders',
          localField: 'salesHeaderId',
          foreignField: '_id',
          as: 'header',
        },
      },
      { $unwind: '$header' },
      { $match: headerJoinMatch },
      {
        $group: {
          _id: null,
          salesItemsTotal: { $sum: '$subtotal' },
          itemCount: { $sum: '$quantity' },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          ...buildScopedMatch(Transaction, { userId, branchId }),
          transactionType: 'sale',
          status: 'posted',
          ...(rangeMatch ? { occurredAt: rangeMatch } : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const salesItemsTotal = toNumber(itemTotalsRows[0]?.salesItemsTotal, 0);
  const transactionSalesTotal = toNumber(transactionTotalsRows[0]?.totalSales, 0);
  const salesHeaderTotal = toNumber(headerSummary.totalSales, 0);

  const deltaSalesItems = roundCurrency(salesHeaderTotal - salesItemsTotal);
  const deltaTransactions = roundCurrency(salesHeaderTotal - transactionSalesTotal);

  const summary = {
    totalSales: roundCurrency(salesHeaderTotal),
    transactionCount: Math.max(0, Math.trunc(toNumber(headerSummary.transactionCount, 0))),
    averageTicket: headerSummary.transactionCount
      ? roundCurrency(salesHeaderTotal / toNumber(headerSummary.transactionCount, 1))
      : 0,
    topSellingProducts: topSellingRows.map((row) => ({
      productId: String(row._id || ''),
      productName: row.productName || 'Unknown Product',
      unitsSold: Math.max(0, Math.trunc(toNumber(row.unitsSold, 0))),
      grossSales: roundCurrency(row.grossSales),
    })),
  };

  return {
    reportType: 'sales',
    generatedAt: generatedAt.toISOString(),
    dateRange: formatRangeForResponse({ ...dateRange, period }),
    dataSources: ['sales_header', 'sales_items', 'cashbook'],
    summary,
    breakdown: {
      buckets: periodRows.map((row) => ({
        bucket: row._id.bucket,
        totalSales: roundCurrency(row.totalSales),
        transactionCount: Math.max(0, Math.trunc(toNumber(row.transactionCount, 0))),
      })),
      transactions: transactionRows.map((row) => ({
        receiptId: row.receiptId || null,
        occurredAt: row.saleAt ? new Date(row.saleAt).toISOString() : null,
        paymentMode: row.paymentMode || null,
        totalAmount: roundCurrency(row.totalAmount),
      })),
    },
    reconciliation: {
      checks: [
        {
          label: 'sales_report_vs_sales_items',
          expected: roundCurrency(salesItemsTotal),
          actual: roundCurrency(salesHeaderTotal),
          delta: deltaSalesItems,
          reconciled: isReconciled(deltaSalesItems),
        },
        {
          label: 'sales_report_vs_cashbook_transactions',
          expected: roundCurrency(transactionSalesTotal),
          actual: roundCurrency(salesHeaderTotal),
          delta: deltaTransactions,
          reconciled: isReconciled(deltaTransactions),
        },
      ],
      reconciled: isReconciled(deltaSalesItems) && isReconciled(deltaTransactions),
    },
    timestamps: {
      generatedAt: generatedAt.toISOString(),
      sourceWindowFrom: dateRange.from.toISOString(),
      sourceWindowTo: dateRange.to.toISOString(),
    },
  };
};

module.exports = {
  generateSalesReport,
};
