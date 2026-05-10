const Feedback = require('../models/Feedback');

const createFeedback = async ({
  shopId,
  userId,
  message,
  category,
  rating = null,
  timestamp = null,
} = {}) => {
  const payload = {
    shopId,
    userId,
    message: String(message || '').trim(),
    category: String(category || '').trim().toLowerCase(),
    rating: rating === null || rating === undefined ? null : Number(rating),
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  };

  const created = await Feedback.create(payload);

  return {
    feedbackId: String(created._id),
    shopId: String(created.shopId),
    userId: String(created.userId),
    message: created.message,
    category: created.category,
    rating: created.rating,
    timestamp: created.timestamp,
  };
};

const listFeedback = async ({
  userId,
  shopId = null,
  category = null,
  limit = 100,
} = {}) => {
  const query = { userId };

  if (shopId) {
    query.shopId = shopId;
  }

  if (category) {
    query.category = String(category).trim().toLowerCase();
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = await Feedback.find(query)
    .sort({ timestamp: -1, _id: -1 })
    .limit(safeLimit)
    .lean();

  return rows.map((row) => ({
    feedbackId: String(row._id),
    shopId: String(row.shopId),
    userId: String(row.userId),
    message: row.message,
    category: row.category,
    rating: row.rating ?? null,
    timestamp: row.timestamp,
  }));
};

const summarizeFeedback = async ({ userId, shopId = null } = {}) => {
  const query = { userId };
  if (shopId) {
    query.shopId = shopId;
  }

  const rows = await Feedback.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        averageRating: { $avg: '$rating' },
      },
    },
  ]);

  const summary = {
    bug: 0,
    feature: 0,
    ux: 0,
    averageRating: 0,
    total: 0,
  };

  let ratingTotal = 0;
  let ratingBuckets = 0;

  for (const row of rows) {
    const category = String(row._id || '').trim().toLowerCase();
    const count = Number(row.count || 0);
    if (summary[category] !== undefined) {
      summary[category] = count;
    }

    summary.total += count;

    const avgRating = Number(row.averageRating || 0);
    if (Number.isFinite(avgRating) && avgRating > 0) {
      ratingTotal += avgRating * count;
      ratingBuckets += count;
    }
  }

  summary.averageRating = ratingBuckets > 0
    ? Number((ratingTotal / ratingBuckets).toFixed(2))
    : 0;

  return summary;
};

module.exports = {
  createFeedback,
  listFeedback,
  summarizeFeedback,
};
