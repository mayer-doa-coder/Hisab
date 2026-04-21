const AnalyticsEvent = require('../models/AnalyticsEvent');

const KNOWN_EVENT_TYPES = new Set([
  'sale_created',
  'product_added',
  'payment_recorded',
  'login',
  'report_viewed',
]);

const normalizeEventType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
};

const normalizeTimestamp = (value) => {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const trackEvent = async ({
  userId,
  shopId = null,
  eventType,
  timestamp = null,
  metadata = null,
  source = 'app',
} = {}) => {
  if (!userId) {
    return null;
  }

  const normalizedEventType = normalizeEventType(eventType);
  if (!normalizedEventType) {
    return null;
  }

  const created = await AnalyticsEvent.create({
    userId,
    shopId: shopId || null,
    eventType: normalizedEventType,
    timestamp: normalizeTimestamp(timestamp),
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    source: String(source || 'app').trim() || 'app',
  });

  return {
    eventId: String(created._id),
    userId: String(created.userId),
    shopId: created.shopId ? String(created.shopId) : null,
    eventType: created.eventType,
    timestamp: created.timestamp,
    metadata: created.metadata || null,
    source: created.source,
    knownEvent: KNOWN_EVENT_TYPES.has(created.eventType),
  };
};

const listEvents = async ({
  userId,
  from = null,
  to = null,
  eventType = null,
  shopId = null,
  limit = 200,
} = {}) => {
  if (!userId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 1000);
  const query = { userId };

  if (shopId) {
    query.shopId = shopId;
  }

  const normalizedEventType = normalizeEventType(eventType);
  if (normalizedEventType) {
    query.eventType = normalizedEventType;
  }

  if (from || to) {
    query.timestamp = {};
    if (from) {
      query.timestamp.$gte = normalizeTimestamp(from);
    }
    if (to) {
      query.timestamp.$lte = normalizeTimestamp(to);
    }
  }

  const rows = await AnalyticsEvent.find(query)
    .sort({ timestamp: -1, _id: -1 })
    .limit(safeLimit)
    .lean();

  return rows.map((row) => ({
    eventId: String(row._id),
    userId: String(row.userId),
    shopId: row.shopId ? String(row.shopId) : null,
    eventType: row.eventType,
    timestamp: row.timestamp,
    metadata: row.metadata || null,
    source: row.source || 'app',
    knownEvent: KNOWN_EVENT_TYPES.has(String(row.eventType || '').trim().toLowerCase()),
  }));
};

module.exports = {
  KNOWN_EVENT_TYPES,
  trackEvent,
  listEvents,
};
