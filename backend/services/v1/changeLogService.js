const ChangeLog = require('../../models/ChangeLog');

const encodeCursor = ({ createdAt, id }) => {
  const payload = `${new Date(createdAt).toISOString()}|${String(id)}`;
  return Buffer.from(payload).toString('base64url');
};

const decodeCursor = (cursor) => {
  try {
    const raw = Buffer.from(String(cursor || ''), 'base64url').toString('utf8');
    const [iso, id] = raw.split('|');
    const date = new Date(iso);
    if (!id || Number.isNaN(date.getTime())) {
      return null;
    }

    return {
      createdAt: date,
      id,
    };
  } catch {
    return null;
  }
};

const appendChange = async ({ userId, entityType, entityId, changeType = 'upsert', payload = null, version = 1, occurredAt = new Date() }) => {
  if (!userId || !entityType || !entityId) {
    return null;
  }

  return ChangeLog.create({
    userId,
    entityType,
    entityId,
    changeType,
    payload,
    version,
    occurredAt,
  });
};

const getChangesAfterCursor = async ({ userId, cursor = null, entityTypes = [], limit = 500 }) => {
  const parsedCursor = cursor ? decodeCursor(cursor) : null;
  const query = {
    userId,
  };

  if (Array.isArray(entityTypes) && entityTypes.length) {
    query.entityType = { $in: entityTypes };
  }

  if (parsedCursor) {
    query.$or = [
      { createdAt: { $gt: parsedCursor.createdAt } },
      { createdAt: parsedCursor.createdAt, _id: { $gt: parsedCursor.id } },
    ];
  }

  const rows = await ChangeLog.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1] || null;

  return {
    items,
    hasMore,
    nextCursor: last ? encodeCursor({ createdAt: last.createdAt, id: last._id }) : cursor,
  };
};

module.exports = {
  appendChange,
  getChangesAfterCursor,
  encodeCursor,
  decodeCursor,
};
