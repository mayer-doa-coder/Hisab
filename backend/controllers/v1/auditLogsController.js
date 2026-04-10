const AuditLog = require('../../models/AuditLog');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString, parseIsoDate } = require('../../utils/validation');
const { notFound } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, parsePagination } = require('./controllerUtils');

const serializeAudit = (doc) => ({
  auditId: String(doc._id),
  entityType: doc.entityType,
  entityId: doc.entityId || null,
  action: doc.action,
  metadata: doc.metadata || null,
  actorUserId: String(doc.userId),
  source: doc.source || 'api',
  occurredAt: new Date(doc.occurredAt).toISOString(),
  createdAt: new Date(doc.createdAt || doc.occurredAt).toISOString(),
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { page, pageSize, skip, limit } = parsePagination(req, { defaultPageSize: 100, maxPageSize: 200 });

  const entityType = normalizeTrimmedString(req.query.entityType);
  const action = normalizeTrimmedString(req.query.action);
  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const query = { userId };

  if (entityType) {
    query.entityType = entityType;
  }
  if (action) {
    query.action = action;
  }
  if (from || to) {
    query.occurredAt = {};
    if (from) {
      query.occurredAt.$gte = from;
    }
    if (to) {
      query.occurredAt.$lte = to;
    }
  }

  const docs = await AuditLog.find(query)
    .sort({ occurredAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await AuditLog.countDocuments(query);

  return success(req, res, {
    items: docs.map(serializeAudit),
    page,
    pageSize,
    total,
    hasNext: skip + docs.length < total,
  });
});

const getAuditLogById = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const doc = await AuditLog.findOne({ _id: req.params.auditId, userId }).lean();
  if (!doc) {
    throw notFound('Audit event not found.');
  }

  return success(req, res, serializeAudit(doc));
});

module.exports = {
  listAuditLogs,
  getAuditLogById,
};
