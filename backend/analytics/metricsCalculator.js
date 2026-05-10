const AnalyticsEvent = require('../models/AnalyticsEvent');
const PilotShop = require('../models/PilotShop');

const FEATURE_EVENT_MAP = Object.freeze({
  sales: ['sale_created'],
  inventory: ['product_added'],
  credit: ['payment_recorded'],
  reports: ['report_viewed'],
});

const startOfUtcDay = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
};

const endOfUtcDay = (value) => {
  const start = startOfUtcDay(value);
  return new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);
};

const parseDateRange = ({ from = null, to = null, fallbackDays = 7 } = {}) => {
  const now = new Date();
  const parsedTo = to ? new Date(to) : now;
  const safeTo = Number.isNaN(parsedTo.getTime()) ? now : parsedTo;

  const parsedFrom = from ? new Date(from) : new Date(safeTo.getTime() - ((fallbackDays - 1) * 24 * 60 * 60 * 1000));
  const safeFrom = Number.isNaN(parsedFrom.getTime()) ? new Date(safeTo.getTime() - ((fallbackDays - 1) * 24 * 60 * 60 * 1000)) : parsedFrom;

  return {
    from: startOfUtcDay(safeFrom),
    to: endOfUtcDay(safeTo),
  };
};

const calculateDayCount = ({ from, to }) => {
  const totalMs = Math.max(0, to.getTime() - from.getTime());
  return Math.max(1, Math.floor(totalMs / (24 * 60 * 60 * 1000)) + 1);
};

const getDailyActiveOperators = async ({ userId, from, to } = {}) => {
  const rows = await AnalyticsEvent.aggregate([
    {
      $match: {
        userId,
        timestamp: { $gte: from, $lte: to },
      },
    },
    {
      $project: {
        day: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$timestamp',
          },
        },
        operatorId: {
          $ifNull: ['$metadata.actorUserId', '$userId'],
        },
      },
    },
    {
      $group: {
        _id: '$day',
        operators: { $addToSet: '$operatorId' },
      },
    },
    {
      $project: {
        _id: 0,
        day: '$_id',
        count: { $size: '$operators' },
      },
    },
    { $sort: { day: 1 } },
  ]);

  return rows.map((row) => ({
    day: row.day,
    count: Number(row.count || 0),
  }));
};

const getSalesTotals = async ({ userId, from, to } = {}) => {
  const rows = await AnalyticsEvent.aggregate([
    {
      $match: {
        userId,
        eventType: 'sale_created',
        timestamp: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: null,
        digitalSales: {
          $sum: {
            $toDouble: {
              $ifNull: ['$metadata.amount', 0],
            },
          },
        },
        estimatedFromEvents: {
          $sum: {
            $toDouble: {
              $ifNull: ['$metadata.estimatedTotalSales', 0],
            },
          },
        },
      },
    },
  ]);

  const row = rows[0] || { digitalSales: 0, estimatedFromEvents: 0 };
  return {
    digitalSales: Number(row.digitalSales || 0),
    estimatedFromEvents: Number(row.estimatedFromEvents || 0),
  };
};

const getEstimatedTotalSales = async ({ userId, from, to } = {}) => {
  const dayCount = calculateDayCount({ from, to });
  const activeShops = await PilotShop.find({
    userId,
    status: { $in: ['active', 'completed'] },
  }).lean();

  const totalDaily = (activeShops || []).reduce((sum, shop) => {
    return sum + Math.max(0, Number(shop.estimatedDailySales || 0));
  }, 0);

  return {
    estimatedFromShops: totalDaily * dayCount,
    activeShops: (activeShops || []).length,
    dayCount,
  };
};

const getFeatureUsage = async ({ userId, from, to } = {}) => {
  const rows = await AnalyticsEvent.aggregate([
    {
      $match: {
        userId,
        timestamp: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
      },
    },
  ]);

  const countsByEvent = new Map(
    rows.map((row) => [String(row._id || '').trim().toLowerCase(), Number(row.count || 0)])
  );

  const result = {};
  for (const [feature, eventTypes] of Object.entries(FEATURE_EVENT_MAP)) {
    result[feature] = eventTypes.reduce((sum, eventType) => sum + (countsByEvent.get(eventType) || 0), 0);
  }

  return result;
};

const getRetentionRate = async ({ userId, from, to } = {}) => {
  const periodDays = calculateDayCount({ from, to });
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - ((periodDays - 1) * 24 * 60 * 60 * 1000));

  const [currentRows, previousRows] = await Promise.all([
    AnalyticsEvent.aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            $ifNull: ['$metadata.actorUserId', '$userId'],
          },
        },
      },
    ]),
    AnalyticsEvent.aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: previousFrom, $lte: previousTo },
        },
      },
      {
        $group: {
          _id: {
            $ifNull: ['$metadata.actorUserId', '$userId'],
          },
        },
      },
    ]),
  ]);

  const current = new Set(currentRows.map((row) => String(row._id || '')));
  const previous = new Set(previousRows.map((row) => String(row._id || '')));

  if (!previous.size) {
    return {
      retainedOperators: 0,
      previousPeriodOperators: 0,
      retentionRate: 0,
      previousPeriod: {
        from: previousFrom,
        to: previousTo,
      },
    };
  }

  let retained = 0;
  for (const operatorId of previous.values()) {
    if (current.has(operatorId)) {
      retained += 1;
    }
  }

  return {
    retainedOperators: retained,
    previousPeriodOperators: previous.size,
    retentionRate: Number(((retained / previous.size) * 100).toFixed(2)),
    previousPeriod: {
      from: previousFrom,
      to: previousTo,
    },
  };
};

const computeMetricsOverview = async ({ userId, from = null, to = null } = {}) => {
  const range = parseDateRange({ from, to, fallbackDays: 14 });

  const [daoSeries, salesTotals, shopSalesBase, featureUsage, retention] = await Promise.all([
    getDailyActiveOperators({ userId, from: range.from, to: range.to }),
    getSalesTotals({ userId, from: range.from, to: range.to }),
    getEstimatedTotalSales({ userId, from: range.from, to: range.to }),
    getFeatureUsage({ userId, from: range.from, to: range.to }),
    getRetentionRate({ userId, from: range.from, to: range.to }),
  ]);

  const daoCurrent = daoSeries.length ? Number(daoSeries[daoSeries.length - 1].count || 0) : 0;
  const daoPrevious = daoSeries.length > 1 ? Number(daoSeries[daoSeries.length - 2].count || 0) : 0;
  const daoGrowthPct = daoPrevious > 0 ? Number((((daoCurrent - daoPrevious) / daoPrevious) * 100).toFixed(2)) : 0;

  const estimatedTotalSales = Math.max(
    Number(shopSalesBase.estimatedFromShops || 0),
    Number(salesTotals.estimatedFromEvents || 0),
    Number(salesTotals.digitalSales || 0)
  );

  const digitalSalesRatio = estimatedTotalSales > 0
    ? Number(((Number(salesTotals.digitalSales || 0) / estimatedTotalSales) * 100).toFixed(2))
    : 0;

  return {
    period: {
      from: range.from,
      to: range.to,
      days: shopSalesBase.dayCount,
    },
    dao: {
      current: daoCurrent,
      previous: daoPrevious,
      growthPct: daoGrowthPct,
      series: daoSeries,
    },
    digitalSalesRatio: {
      ratioPct: digitalSalesRatio,
      digitalSales: Number(salesTotals.digitalSales || 0),
      estimatedTotalSales,
      activePilotShops: shopSalesBase.activeShops,
    },
    featureUsage,
    retention,
  };
};

module.exports = {
  computeMetricsOverview,
};
