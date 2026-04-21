const SalesHeader = require('../models/SalesHeader');
const SalesItem = require('../models/SalesItem');
const ExpenseEntry = require('../models/ExpenseEntry');
const CashbookEntry = require('../models/CashbookEntry');
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

const mergeBuckets = ({ revenueRows = [], expenseRows = [] } = {}) => {
  const map = new Map();

  revenueRows.forEach((row) => {
    const bucket = row?._id?.bucket;
    if (!bucket) {
      return;
    }

    const current = map.get(bucket) || { bucket, revenue: 0, expenses: 0, profit: 0 };
    current.revenue = toNumber(row.totalRevenue, 0);
    current.profit = current.revenue - current.expenses;
    map.set(bucket, current);
  });

  expenseRows.forEach((row) => {
    const bucket = row?._id?.bucket;
    if (!bucket) {
      return;
    }

    const current = map.get(bucket) || { bucket, revenue: 0, expenses: 0, profit: 0 };
    current.expenses = toNumber(row.totalExpenses, 0);
    current.profit = current.revenue - current.expenses;
    map.set(bucket, current);
  });

  return [...map.values()]
    .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
    .map((row) => ({
      bucket: row.bucket,
      revenue: roundCurrency(row.revenue),
      expenses: roundCurrency(row.expenses),
      profit: roundCurrency(row.profit),
    }));
};

const generateFinanceReport = async ({
  userId,
  branchId = null,
  period,
  dateRange,
  categoryLimit = 12,
} = {}) => {
  const generatedAt = new Date();
  const saleDateMatch = buildDateRangeMatch(dateRange);

  const salesMatch = {
    ...buildScopedMatch(SalesHeader, { userId, branchId }),
    status: 'posted',
  };
  if (saleDateMatch) {
    salesMatch.saleAt = saleDateMatch;
  }

  const expenseMatch = {
    ...buildScopedMatch(ExpenseEntry, { userId, branchId }),
  };
  if (saleDateMatch) {
    expenseMatch.expenseDate = saleDateMatch;
  }

  const cashbookMatch = {
    ...buildScopedMatch(CashbookEntry, { userId, branchId }),
  };
  if (saleDateMatch) {
    cashbookMatch.occurredAt = saleDateMatch;
  }

  const [
    salesAggRows,
    expenseAggRows,
    cashbookAggRows,
    revenueBucketRows,
    expenseBucketRows,
    expenseCategoryRows,
  ] = await Promise.all([
    SalesHeader.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          transactionCount: { $sum: 1 },
        },
      },
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseMatch },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    CashbookEntry.aggregate([
      { $match: cashbookMatch },
      {
        $group: {
          _id: null,
          totalIn: { $sum: { $cond: [{ $eq: ['$entryType', 'IN'] }, '$amount', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$entryType', 'OUT'] }, '$amount', 0] } },
        },
      },
    ]),
    SalesHeader.aggregate([
      { $match: salesMatch },
      {
        $group: {
          _id: {
            bucket: getBucketExpression('saleAt', period),
          },
          totalRevenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { '_id.bucket': 1 } },
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseMatch },
      {
        $group: {
          _id: {
            bucket: getBucketExpression('expenseDate', period),
          },
          totalExpenses: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.bucket': 1 } },
    ]),
    ExpenseEntry.aggregate([
      { $match: expenseMatch },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: Math.max(1, Number(categoryLimit) || 12) },
    ]),
  ]);

  const revenue = toNumber(salesAggRows[0]?.totalRevenue, 0);
  const expenses = toNumber(expenseAggRows[0]?.totalExpenses, 0);
  const profit = revenue - expenses;

  const cashbookIn = toNumber(cashbookAggRows[0]?.totalIn, 0);
  const cashbookOut = toNumber(cashbookAggRows[0]?.totalOut, 0);
  const cashbookNet = cashbookIn - cashbookOut;

  const userScopedObjectId = toObjectIdIfPossible(userId);
  const itemMatch = {
    ...buildScopedMatch(SalesItem, { userId, branchId }),
  };

  const headerJoinMatch = {
    'header.userId': userScopedObjectId,
    'header.status': 'posted',
    'header.deletedAt': null,
    'header.isArchived': { $ne: true },
  };
  if (saleDateMatch) {
    headerJoinMatch['header.saleAt'] = saleDateMatch;
  }

  const salesItemsRows = await SalesItem.aggregate([
    { $match: itemMatch },
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
        totalSalesItems: { $sum: '$subtotal' },
      },
    },
  ]);

  const salesItemsTotal = toNumber(salesItemsRows[0]?.totalSalesItems, 0);
  const deltaSalesItems = roundCurrency(revenue - salesItemsTotal);
  const deltaCashbookNet = roundCurrency(cashbookNet - profit);

  return {
    reportType: 'finance',
    generatedAt: generatedAt.toISOString(),
    dateRange: formatRangeForResponse({ ...dateRange, period }),
    dataSources: ['sales_header', 'sales_items', 'expenses', 'cashbook'],
    summary: {
      totalRevenue: roundCurrency(revenue),
      totalExpenses: roundCurrency(expenses),
      netProfit: roundCurrency(profit),
      transactionCount: Math.max(0, Math.trunc(toNumber(salesAggRows[0]?.transactionCount, 0))),
      expenseEntryCount: Math.max(0, Math.trunc(toNumber(expenseAggRows[0]?.count, 0))),
      cashbookIn: roundCurrency(cashbookIn),
      cashbookOut: roundCurrency(cashbookOut),
      cashbookNet: roundCurrency(cashbookNet),
    },
    breakdown: {
      buckets: mergeBuckets({ revenueRows: revenueBucketRows, expenseRows: expenseBucketRows }),
      expensesByCategory: expenseCategoryRows.map((row) => ({
        category: row._id || 'GENERAL',
        totalAmount: roundCurrency(row.totalAmount),
        count: Math.max(0, Math.trunc(toNumber(row.count, 0))),
      })),
    },
    taxSummary: {
      totalSales: roundCurrency(revenue),
      totalExpenses: roundCurrency(expenses),
      netProfit: roundCurrency(profit),
    },
    reconciliation: {
      checks: [
        {
          label: 'finance_revenue_vs_sales_items',
          expected: roundCurrency(salesItemsTotal),
          actual: roundCurrency(revenue),
          delta: deltaSalesItems,
          reconciled: isReconciled(deltaSalesItems),
        },
        {
          label: 'finance_profit_vs_cashbook_net',
          expected: roundCurrency(profit),
          actual: roundCurrency(cashbookNet),
          delta: deltaCashbookNet,
          reconciled: isReconciled(deltaCashbookNet),
        },
      ],
      reconciled: isReconciled(deltaSalesItems) && isReconciled(deltaCashbookNet),
    },
    timestamps: {
      generatedAt: generatedAt.toISOString(),
      sourceWindowFrom: dateRange.from.toISOString(),
      sourceWindowTo: dateRange.to.toISOString(),
    },
  };
};

module.exports = {
  generateFinanceReport,
};
