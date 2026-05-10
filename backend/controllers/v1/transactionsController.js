const Transaction = require('../../models/Transaction');
const Customer = require('../../models/Customer');
const ApprovalRequest = require('../../models/ApprovalRequest');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parseMoney,
  parseIsoDate,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { HttpError, badRequest, notFound, unprocessable } = require('../../services/v1/httpError');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');
const { trackEvent } = require('../../analytics/eventTracker');
const {
  asyncHandler,
  getUserIdFromReq,
  getActorUserIdFromReq,
  getBranchIdFromReq,
  parsePagination,
} = require('./controllerUtils');

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

const buildBranchScope = ({ req, query = {} } = {}) => {
  const scoped = { ...query };
  const branchId = getBranchIdFromReq(req);
  const role = String(req?.auth?.role || '').toUpperCase();
  if (branchId && role !== 'OWNER') {
    scoped.branchId = branchId;
  }
  return scoped;
};

const executeVoidTransactionAction = async ({
  tenantUserId,
  actorUserId,
  branchId = null,
  transactionId,
  reason,
  voidedAt,
} = {}) => {
  const existing = await Transaction.findOne({
    _id: transactionId,
    userId: tenantUserId,
    ...(branchId ? { branchId } : {}),
  });
  if (!existing) {
    throw notFound('Transaction not found.');
  }

  if (existing.status === 'voided') {
    throw unprocessable('Transaction is already voided.', 'TRANSACTION_ALREADY_VOIDED');
  }

  existing.status = 'voided';
  existing.voidReason = reason;
  existing.voidedAt = voidedAt;
  await existing.save();

  const compensating = await Transaction.create({
    userId: tenantUserId,
    branchId: branchId || null,
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
      userId: tenantUserId,
      entityType: 'transaction',
      entityId: existingSerialized.transactionId,
      changeType: 'upsert',
      payload: existingSerialized,
      version: 1,
      occurredAt: existing.updatedAt,
    }),
    appendChange({
      userId: tenantUserId,
      entityType: 'transaction',
      entityId: compensatingSerialized.transactionId,
      changeType: 'upsert',
      payload: compensatingSerialized,
      version: 1,
      occurredAt: compensating.updatedAt,
    }),
    logAudit({
      userId: tenantUserId,
      tenantUserId,
      actorUserId,
      branchId,
      entityType: 'transaction',
      entityId: existingSerialized.transactionId,
      action: 'void',
      metadata: {
        reason,
        voidRefTransactionId: compensatingSerialized.transactionId,
      },
      affectedEntity: {
        entityType: 'transaction',
        entityId: existingSerialized.transactionId,
      },
      occurredAt: existing.updatedAt,
    }),
  ]);

  return {
    voided: true,
    transaction: existingSerialized,
    compensatingTransaction: compensatingSerialized,
  };
};

const createTransaction = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const branchId = getBranchIdFromReq(req);

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
    const customer = await Customer.findOne(buildBranchScope({ req, query: { _id: customerId, userId, isArchived: false } })).lean();
    if (!customer) {
      throw notFound('Customer not found.');
    }
  }

  const created = await Transaction.create({
    userId,
    branchId: branchId || null,
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
    transactionType === 'sale'
      ? trackEvent({
        userId,
        eventType: 'sale_created',
        timestamp: created.updatedAt,
        metadata: {
          amount,
          transactionId: serialized.transactionId,
          customerId: serialized.customerId,
        },
        source: 'transactions_api',
      })
      : Promise.resolve(null),
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
  Object.assign(query, buildBranchScope({ req }));

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
  const actorUserId = getActorUserIdFromReq(req) || userId;
  const branchId = getBranchIdFromReq(req);
  const transactionId = normalizeTrimmedString(req.params.transactionId);
  const reason = normalizeTrimmedString(req.body.reason) || 'manual_void';
  const voidedAt = parseIsoDate(req.body.voidedAt) || new Date();

  const role = req.auth?.role;
  const canApprove = checkPermission(role, ACTIONS.VOID_SALE_APPROVE);
  const canRequest = checkPermission(role, ACTIONS.VOID_SALE_REQUEST)
    || checkPermission(role, ACTIONS.APPROVAL_REQUEST_CREATE);

  if (!canApprove && !canRequest) {
    throw new HttpError({
      statusCode: 403,
      code: 'FORBIDDEN_ACTION',
      message: 'You are not allowed to request or approve sale voids.',
    });
  }

  if (!canApprove) {
    const request = await ApprovalRequest.create({
      actionType: 'VOID_SALE',
      tenantUserId: userId,
      branchId: branchId || null,
      requestedBy: actorUserId,
      status: 'PENDING',
      source: 'transaction_void',
      reason,
      requestPayload: {
        transactionId,
        reason,
        voidedAt: voidedAt.toISOString(),
      },
    });

    await logAudit({
      userId,
      tenantUserId: userId,
      actorUserId,
      branchId,
      entityType: 'approval_request',
      entityId: String(request._id),
      action: 'create',
      metadata: {
        actionType: 'VOID_SALE',
        status: 'PENDING',
        source: 'transaction_void',
      },
      affectedEntity: {
        entityType: 'transaction',
        entityId: transactionId,
      },
    });

    return success(req, res, {
      approvalRequired: true,
      approvalRequestId: String(request._id),
      status: 'PENDING',
      message: 'Void sale request submitted for approval.',
    }, 202);
  }

  const result = await executeVoidTransactionAction({
    tenantUserId: userId,
    actorUserId,
    branchId,
    transactionId,
    reason,
    voidedAt,
  });

  return success(req, res, result);
});

module.exports = {
  createTransaction,
  listTransactions,
  voidTransaction,
  executeVoidTransactionAction,
};
