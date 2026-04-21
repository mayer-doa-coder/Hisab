const BakiEntry = require('../models/BakiEntry');
const Customer = require('../models/Customer');
const {
  buildDateRangeMatch,
  getBucketExpression,
  buildScopedMatch,
  toNumber,
  roundCurrency,
  isReconciled,
  formatRangeForResponse,
} = require('./reportUtils');

const generateCollectionsReport = async ({
  userId,
  branchId = null,
  period,
  dateRange,
  customerLimit = 50,
} = {}) => {
  const generatedAt = new Date();

  const toDateMatch = buildDateRangeMatch({ from: null, to: dateRange.to });
  const periodDateMatch = buildDateRangeMatch(dateRange);

  const cumulativeMatch = {
    ...buildScopedMatch(BakiEntry, { userId, branchId }),
    occurredAt: toDateMatch,
  };

  const periodMatch = {
    ...buildScopedMatch(BakiEntry, { userId, branchId }),
    occurredAt: periodDateMatch,
  };

  const [
    customerLedgerRows,
    periodFlowRows,
    bucketRows,
    customerBalanceRows,
  ] = await Promise.all([
    BakiEntry.aggregate([
      { $match: cumulativeMatch },
      {
        $group: {
          _id: '$customerId',
          totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          totalPayment: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
          hasOverdueCredit: {
            $max: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', 'credit'] },
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', dateRange.to] },
                    { $in: ['$status', ['open', 'overdue']] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $project: {
          customerId: '$_id',
          customerName: { $ifNull: [{ $arrayElemAt: ['$customer.name', 0] }, 'Unknown Customer'] },
          phone: { $ifNull: [{ $arrayElemAt: ['$customer.phone', 0] }, null] },
          totalCredit: 1,
          totalPayment: 1,
          hasOverdueCredit: 1,
        },
      },
    ]),
    BakiEntry.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: null,
          creditsInPeriod: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          paymentsInPeriod: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
    ]),
    BakiEntry.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: {
            bucket: getBucketExpression('occurredAt', period),
          },
          credits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          payments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
      { $sort: { '_id.bucket': 1 } },
    ]),
    Customer.aggregate([
      {
        $match: {
          ...buildScopedMatch(Customer, { userId, branchId }),
        },
      },
      {
        $group: {
          _id: null,
          customerCurrentBalance: { $sum: '$currentBalance' },
        },
      },
    ]),
  ]);

  const customerRowsWithDue = customerLedgerRows
    .map((row) => {
      const totalCredit = toNumber(row.totalCredit, 0);
      const totalPayment = toNumber(row.totalPayment, 0);
      const bakiDue = Math.max(0, totalCredit - totalPayment);

      return {
        customerId: String(row.customerId),
        customerName: row.customerName || 'Unknown Customer',
        phone: row.phone || null,
        totalCredit: roundCurrency(totalCredit),
        totalPayment: roundCurrency(totalPayment),
        bakiDue: roundCurrency(bakiDue),
        overdue: Boolean(row.hasOverdueCredit) && bakiDue > 0,
      };
    })
    .sort((a, b) => b.bakiDue - a.bakiDue);

  const totalBaki = customerRowsWithDue.reduce((sum, row) => sum + toNumber(row.bakiDue, 0), 0);
  const overdueAmount = customerRowsWithDue
    .filter((row) => row.overdue)
    .reduce((sum, row) => sum + toNumber(row.bakiDue, 0), 0);

  const creditsInPeriod = toNumber(periodFlowRows[0]?.creditsInPeriod, 0);
  const paymentsInPeriod = toNumber(periodFlowRows[0]?.paymentsInPeriod, 0);
  const recoveryRate = creditsInPeriod > 0 ? (paymentsInPeriod / creditsInPeriod) * 100 : 0;

  const totalCreditToDate = customerRowsWithDue.reduce((sum, row) => sum + toNumber(row.totalCredit, 0), 0);
  const totalPaymentToDate = customerRowsWithDue.reduce((sum, row) => sum + toNumber(row.totalPayment, 0), 0);

  const customerBalance = toNumber(customerBalanceRows[0]?.customerCurrentBalance, 0);
  const entriesOutstandingRaw = totalCreditToDate - totalPaymentToDate;
  const deltaToCustomerBalance = roundCurrency(totalBaki - customerBalance);

  return {
    reportType: 'collections',
    generatedAt: generatedAt.toISOString(),
    dateRange: formatRangeForResponse({ ...dateRange, period }),
    dataSources: ['credit_transactions'],
    summary: {
      totalBaki: roundCurrency(totalBaki),
      overdueAmount: roundCurrency(overdueAmount),
      recoveryRate: Number(recoveryRate.toFixed(2)),
      creditsInPeriod: roundCurrency(creditsInPeriod),
      paymentsInPeriod: roundCurrency(paymentsInPeriod),
    },
    breakdown: {
      buckets: bucketRows.map((row) => ({
        bucket: row._id.bucket,
        credits: roundCurrency(row.credits),
        payments: roundCurrency(row.payments),
        net: roundCurrency(toNumber(row.credits, 0) - toNumber(row.payments, 0)),
      })),
      customers: customerRowsWithDue.slice(0, Math.max(1, Number(customerLimit) || 50)),
    },
    reconciliation: {
      checks: [
        {
          label: 'collections_entries_credit_minus_payment_vs_total_baki',
          expected: roundCurrency(entriesOutstandingRaw),
          actual: roundCurrency(totalBaki),
          delta: roundCurrency(entriesOutstandingRaw - totalBaki),
          reconciled: isReconciled(entriesOutstandingRaw - totalBaki),
        },
        {
          label: 'collections_customer_balance_vs_total_baki',
          expected: roundCurrency(customerBalance),
          actual: roundCurrency(totalBaki),
          delta: deltaToCustomerBalance,
          reconciled: isReconciled(deltaToCustomerBalance),
        },
      ],
      reconciled: isReconciled(entriesOutstandingRaw - totalBaki) && isReconciled(deltaToCustomerBalance),
    },
    timestamps: {
      generatedAt: generatedAt.toISOString(),
      sourceWindowFrom: dateRange.from.toISOString(),
      sourceWindowTo: dateRange.to.toISOString(),
    },
  };
};

module.exports = {
  generateCollectionsReport,
};
