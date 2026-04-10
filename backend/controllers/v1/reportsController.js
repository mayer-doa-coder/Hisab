const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const InventoryMovement = require('../../models/InventoryMovement');
const Transaction = require('../../models/Transaction');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString, parseIsoDate } = require('../../utils/validation');
const { badRequest } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const buildOccurredAtMatch = (from, to) => {
  if (!from && !to) {
    return null;
  }

  const occurredAt = {};
  if (from) {
    occurredAt.$gte = from;
  }
  if (to) {
    occurredAt.$lte = to;
  }

  return occurredAt;
};

const getDashboardReport = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const occurredAt = buildOccurredAtMatch(from, to);
  const bakiMatch = { userId };
  const movementMatch = { userId };

  if (occurredAt) {
    bakiMatch.occurredAt = occurredAt;
    movementMatch.occurredAt = occurredAt;
  }

  const [bakiAgg, activeCustomers, lowStockProducts, expiringSoonProducts, stockMovementsToday] = await Promise.all([
    BakiEntry.aggregate([
      { $match: bakiMatch },
      {
        $group: {
          _id: null,
          totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
    ]),
    BakiEntry.distinct('customerId', bakiMatch),
    Product.countDocuments({ userId, isArchived: false, $expr: { $lte: ['$quantityOnHand', '$reorderLevel'] } }),
    Product.countDocuments({ userId, isArchived: false, expiryDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }),
    InventoryMovement.countDocuments({
      ...movementMatch,
      occurredAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    }),
  ]);

  const row = bakiAgg[0] || { totalCredit: 0, totalPayments: 0 };

  return success(req, res, {
    totalCredit: Number(row.totalCredit || 0),
    totalPayments: Number(row.totalPayments || 0),
    netDue: Number((Number(row.totalCredit || 0) - Number(row.totalPayments || 0)).toFixed(2)),
    activeCustomers: Array.isArray(activeCustomers) ? activeCustomers.length : 0,
    lowStockProducts,
    expiringSoonProducts,
    stockMovementsToday,
  });
});

const getSalesSummary = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);
  const groupBy = normalizeTrimmedString(req.query.groupBy || 'day').toLowerCase();

  if (!['day', 'week', 'month'].includes(groupBy)) {
    throw badRequest('groupBy must be day, week, or month.', [{ field: 'groupBy', reason: 'invalid' }]);
  }

  const match = {
    userId,
    transactionType: 'sale',
    status: 'posted',
  };

  const occurredAt = buildOccurredAtMatch(from, to);
  if (occurredAt) {
    match.occurredAt = occurredAt;
  }

  const format = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-%U' : '%Y-%m';

  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          bucket: {
            $dateToString: {
              format,
              date: '$occurredAt',
            },
          },
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.bucket': 1 } },
  ]);

  return success(req, res, {
    groupBy,
    buckets: rows.map((row) => ({
      bucket: row._id.bucket,
      totalAmount: Number(row.totalAmount || 0),
      count: Number(row.count || 0),
    })),
  });
});

const getBakiAging = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const asOf = parseIsoDate(req.query.asOf) || new Date();

  const customers = await Customer.find({ userId, isArchived: false }).lean();
  const buckets = {
    '0_7_days': 0,
    '8_30_days': 0,
    '31_60_days': 0,
    '61_plus_days': 0,
  };

  for (const customer of customers) {
    const entries = await BakiEntry.find({ userId, customerId: customer._id }).sort({ occurredAt: 1 }).lean();
    const totalCredit = entries.filter((e) => e.type === 'credit').reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalPayment = entries.filter((e) => e.type === 'payment').reduce((s, e) => s + Number(e.amount || 0), 0);
    const due = Math.max(0, totalCredit - totalPayment);
    if (due <= 0) {
      continue;
    }

    const oldestCredit = entries.find((e) => e.type === 'credit');
    const ageDays = oldestCredit
      ? Math.floor((asOf.getTime() - new Date(oldestCredit.occurredAt).getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    if (ageDays <= 7) {
      buckets['0_7_days'] += due;
    } else if (ageDays <= 30) {
      buckets['8_30_days'] += due;
    } else if (ageDays <= 60) {
      buckets['31_60_days'] += due;
    } else {
      buckets['61_plus_days'] += due;
    }
  }

  return success(req, res, {
    asOf: asOf.toISOString(),
    ...buckets,
  });
});

const getInventoryHealth = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const now = new Date();
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [totalSkus, lowStockCount, outOfStockCount, expiringWithin7Days, expiredCount] = await Promise.all([
    Product.countDocuments({ userId, isArchived: false }),
    Product.countDocuments({ userId, isArchived: false, $expr: { $lte: ['$quantityOnHand', '$reorderLevel'] } }),
    Product.countDocuments({ userId, isArchived: false, quantityOnHand: 0 }),
    Product.countDocuments({ userId, isArchived: false, expiryDate: { $gte: now, $lte: in7 } }),
    Product.countDocuments({ userId, isArchived: false, expiryDate: { $lt: now } }),
  ]);

  return success(req, res, {
    totalSkus,
    lowStockCount,
    outOfStockCount,
    expiringWithin7Days,
    expiredCount,
  });
});

module.exports = {
  getDashboardReport,
  getSalesSummary,
  getBakiAging,
  getInventoryHealth,
};
