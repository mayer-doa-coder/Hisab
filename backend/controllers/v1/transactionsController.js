const Transaction = require('../../models/Transaction');
const Customer = require('../../models/Customer');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parseMoney,
  parseIsoDate,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, unprocessable } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, parsePagination } = require('./controllerUtils');

const TRANSACTION_TYPES = new Set([
  'sale',
  'purchase',
  'expense',
  'income',
  'credit_issue',
  'credit_payment',
]);

const serializeTransaction = (doc) => ({
  transactionId: String(doc._id),
  transactionType: doc.transactionType,
  amount: Number(doc.amount || 0),
  currency: doc.currency || 'BDT',
  customerId: doc.customerId ? String(doc.customerId) : null,
  referenceType: doc.referenceType || null,
  referenceId: doc.referenceId || null,
  note: doc.note || null,
  status: doc.status,
  voidReason: doc.voidReason || null,
  voidedAt: doc.voidedAt ? new Date(doc.voidedAt).toISOString() : null,
  voidRefTransactionId: doc.voidRefTransactionId ? String(doc.voidRefTransactionId) : null,
  occurredAt: new Date(doc.occurredAt).toISOString(),
  createdAt: new Date(doc.createdAt || doc.occurredAt).toISOString(),
});

const createTransaction = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const transactionType = normalizeTrimmedString(req.body.transactionType).toLowerCase();
  const amount = parseMoney(req.body.amount);
  const occurredAt = parseIsoDate(req.body.occurredAt) || new Date();

  if (!TRANSACTION_TYPES.has(transactionType)) {
    throw badRequest('transactionType is invalid.', [{ field: 'transactionType', reason: 'invalid' }]);
  }
  if (amount === null || amount <= 0) {
    throw badRequest('amount must be greater than 0.', [{ field: 'amount', reason: 'invalid' }]);
  }

  const customerId = normalizeTrimmedString(req.body.customerId) || null;
  if (customerId) {
    const customer = await Customer.findOne({ _id: customerId, userId, isArchived: false }).lean();
    if (!customer) {
      throw notFound('Customer not found.');
    }
  }

  const created = await Transaction.create({
    userId,
    transactionType,
    amount,
    currency: normalizeTrimmedString(req.body.currency || 'BDT').toUpperCase(),
    customerId,
    referenceType: normalizeTrimmedString(req.body.referenceType) || null,
    referenceId: normalizeTrimmedString(req.body.referenceId) || null,
    note: normalizeTrimmedString(req.body.note) || null,
    occurredAt,
    status: 'posted',
  });

  const serialized = serializeTransaction(created);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'transaction',
      entityId: serialized.transactionId,
      changeType: 'upsert',
      payload: serialized,
      version: 1,
      occurredAt: created.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'transaction',
      entityId: serialized.transactionId,
      action: 'create',
      metadata: { after: serialized },
      occurredAt: created.updatedAt,
    }),
  ]);

  return success(req, res, serialized, 201);
});

const listTransactions = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { page, pageSize, skip, limit } = parsePagination(req, { defaultPageSize: 50 });

  const type = normalizeTrimmedString(req.query.type).toLowerCase();
  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const query = { userId };

  if (type && TRANSACTION_TYPES.has(type)) {
    query.transactionType = type;
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

  const docs = await Transaction.find(query)
    .sort({ occurredAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Transaction.countDocuments(query);

  return success(req, res, {
    items: docs.map(serializeTransaction),
    page,
    pageSize,
    total,
    hasNext: skip + docs.length < total,
  });
});

const voidTransaction = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const transactionId = normalizeTrimmedString(req.params.transactionId);

  const existing = await Transaction.findOne({ _id: transactionId, userId });
  if (!existing) {
    throw notFound('Transaction not found.');
  }

  if (existing.status === 'voided') {
    throw unprocessable('Transaction is already voided.', 'TRANSACTION_ALREADY_VOIDED');
  }

  const reason = normalizeTrimmedString(req.body.reason) || 'manual_void';
  const voidedAt = parseIsoDate(req.body.voidedAt) || new Date();

  existing.status = 'voided';
  existing.voidReason = reason;
  existing.voidedAt = voidedAt;
  await existing.save();

  const compensating = await Transaction.create({
    userId,
    transactionType: 'void',
    amount: Number(existing.amount || 0),
    currency: existing.currency || 'BDT',
    customerId: existing.customerId || null,
    referenceType: 'void_of',
    referenceId: String(existing._id),
    note: `Compensating entry for ${String(existing._id)}`,
    occurredAt: voidedAt,
    status: 'posted',
    voidRefTransactionId: existing._id,
  });

  const existingSerialized = serializeTransaction(existing);
  const compensatingSerialized = serializeTransaction(compensating);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'transaction',
      entityId: existingSerialized.transactionId,
      changeType: 'upsert',
      payload: existingSerialized,
      version: 1,
      occurredAt: existing.updatedAt,
    }),
    appendChange({
      userId,
      entityType: 'transaction',
      entityId: compensatingSerialized.transactionId,
      changeType: 'upsert',
      payload: compensatingSerialized,
      version: 1,
      occurredAt: compensating.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'transaction',
      entityId: existingSerialized.transactionId,
      action: 'void',
      metadata: {
        reason,
        voidRefTransactionId: compensatingSerialized.transactionId,
      },
      occurredAt: existing.updatedAt,
    }),
  ]);

  return success(req, res, {
    voided: true,
    transaction: existingSerialized,
    compensatingTransaction: compensatingSerialized,
  });
});

module.exports = {
  createTransaction,
  listTransactions,
  voidTransaction,
};
