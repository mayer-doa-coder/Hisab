const ApprovalRequest = require('../../models/ApprovalRequest');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString, parseIsoDate } = require('../../utils/validation');
const { badRequest, notFound, unprocessable, HttpError } = require('../../services/v1/httpError');
const { logAudit } = require('../../services/v1/auditService');
const {
  asyncHandler,
  getUserIdFromReq,
  getActorUserIdFromReq,
  getBranchIdFromReq,
} = require('./controllerUtils');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');
const { executeApprovedSyncChange } = require('./unifiedSyncController');
const { executeVoidTransactionAction } = require('./transactionsController');

const serializeApprovalRequest = (doc) => ({
  approvalRequestId: String(doc._id),
  actionType: doc.actionType,
  tenantUserId: String(doc.tenantUserId),
  branchId: doc.branchId ? String(doc.branchId) : null,
  requestedBy: String(doc.requestedBy),
  approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
  status: doc.status,
  source: doc.source || 'manual',
  reason: doc.reason || null,
  requestPayload: doc.requestPayload || null,
  decisionNote: doc.decisionNote || null,
  resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : null,
  executedAt: doc.executedAt ? new Date(doc.executedAt).toISOString() : null,
  executionResult: doc.executionResult || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const listApprovalRequests = asyncHandler(async (req, res) => {
  const tenantUserId = getUserIdFromReq(req);
  const branchId = getBranchIdFromReq(req);
  const role = String(req.auth?.role || '').toUpperCase();
  const status = normalizeTrimmedString(req.query?.status).toUpperCase();
  const actionType = normalizeTrimmedString(req.query?.actionType).toUpperCase();

  const query = { tenantUserId };
  if (branchId && role !== 'OWNER') {
    query.branchId = branchId;
  }
  if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    query.status = status;
  }
  if (actionType && ['VOID_SALE', 'RETURN_PRODUCT', 'DISCOUNT_OVERRIDE'].includes(actionType)) {
    query.actionType = actionType;
  }

  const docs = await ApprovalRequest.find(query).sort({ createdAt: -1, _id: -1 }).lean();
  return success(req, res, {
    items: docs.map(serializeApprovalRequest),
    total: docs.length,
  });
});

const createApprovalRequest = asyncHandler(async (req, res) => {
  const tenantUserId = getUserIdFromReq(req);
  const requestedBy = getActorUserIdFromReq(req) || tenantUserId;
  const branchId = getBranchIdFromReq(req);
  const actionType = normalizeTrimmedString(req.body?.actionType).toUpperCase();
  const reason = normalizeTrimmedString(req.body?.reason) || null;

  if (!['VOID_SALE', 'RETURN_PRODUCT', 'DISCOUNT_OVERRIDE'].includes(actionType)) {
    throw badRequest('actionType is invalid.', [{ field: 'actionType', reason: 'invalid' }]);
  }

  const created = await ApprovalRequest.create({
    actionType,
    tenantUserId,
    branchId: branchId || null,
    requestedBy,
    status: 'PENDING',
    source: normalizeTrimmedString(req.body?.source || 'manual') || 'manual',
    reason,
    requestPayload: req.body?.requestPayload || null,
  });

  await logAudit({
    userId: tenantUserId,
    tenantUserId,
    actorUserId: requestedBy,
    branchId,
    entityType: 'approval_request',
    entityId: String(created._id),
    action: 'create',
    metadata: {
      actionType,
      source: created.source,
    },
    affectedEntity: {
      entityType: 'approval_request',
      entityId: String(created._id),
    },
  });

  return success(req, res, serializeApprovalRequest(created), 201);
});

const executeApprovalRequest = async ({ approvalRequest, approverUserId, branchId = null } = {}) => {
  if (approvalRequest.source === 'transaction_void') {
    const payload = approvalRequest.requestPayload || {};
    return executeVoidTransactionAction({
      tenantUserId: String(approvalRequest.tenantUserId),
      actorUserId: approverUserId,
      branchId,
      transactionId: normalizeTrimmedString(payload.transactionId),
      reason: normalizeTrimmedString(payload.reason) || 'manual_void',
      voidedAt: parseIsoDate(payload.voidedAt) || new Date(),
    });
  }

  if (approvalRequest.source === 'sync_change') {
    const change = approvalRequest.requestPayload?.change || null;
    if (!change) {
      throw badRequest('sync approval request does not include change payload.');
    }

    return executeApprovedSyncChange({
      tenantUserId: String(approvalRequest.tenantUserId),
      change,
    });
  }

  return { status: 'no_execution', message: 'No executable source configured for this request.' };
};

const approveApprovalRequest = asyncHandler(async (req, res) => {
  const tenantUserId = getUserIdFromReq(req);
  const approverUserId = getActorUserIdFromReq(req) || tenantUserId;
  const branchId = getBranchIdFromReq(req);

  if (!checkPermission(req.auth?.role, ACTIONS.APPROVAL_REVIEW)) {
    throw new HttpError({
      statusCode: 403,
      code: 'FORBIDDEN_ACTION',
      message: 'You do not have permission to approve requests.',
    });
  }

  const requestId = normalizeTrimmedString(req.params.approvalRequestId);
  const role = String(req.auth?.role || '').toUpperCase();
  const approvalRequest = await ApprovalRequest.findOne({
    _id: requestId,
    tenantUserId,
    ...(branchId && role !== 'OWNER' ? { branchId } : {}),
  });
  if (!approvalRequest) {
    throw notFound('Approval request not found.');
  }

  if (approvalRequest.status !== 'PENDING') {
    throw unprocessable('Approval request is already resolved.', 'APPROVAL_ALREADY_RESOLVED');
  }

  const executionResult = await executeApprovalRequest({
    approvalRequest,
    approverUserId,
    branchId,
  });

  approvalRequest.status = 'APPROVED';
  approvalRequest.approvedBy = approverUserId;
  approvalRequest.decisionNote = normalizeTrimmedString(req.body?.decisionNote) || null;
  approvalRequest.resolvedAt = new Date();
  approvalRequest.executedAt = new Date();
  approvalRequest.executionResult = executionResult;
  await approvalRequest.save();

  await logAudit({
    userId: tenantUserId,
    tenantUserId,
    actorUserId: approverUserId,
    branchId,
    entityType: 'approval_request',
    entityId: String(approvalRequest._id),
    action: 'approve',
    metadata: {
      actionType: approvalRequest.actionType,
      source: approvalRequest.source,
    },
    affectedEntity: {
      entityType: 'approval_request',
      entityId: String(approvalRequest._id),
    },
  });

  return success(req, res, serializeApprovalRequest(approvalRequest));
});

const rejectApprovalRequest = asyncHandler(async (req, res) => {
  const tenantUserId = getUserIdFromReq(req);
  const approverUserId = getActorUserIdFromReq(req) || tenantUserId;
  const branchId = getBranchIdFromReq(req);

  if (!checkPermission(req.auth?.role, ACTIONS.APPROVAL_REVIEW)) {
    throw new HttpError({
      statusCode: 403,
      code: 'FORBIDDEN_ACTION',
      message: 'You do not have permission to reject requests.',
    });
  }

  const requestId = normalizeTrimmedString(req.params.approvalRequestId);
  const role = String(req.auth?.role || '').toUpperCase();
  const approvalRequest = await ApprovalRequest.findOne({
    _id: requestId,
    tenantUserId,
    ...(branchId && role !== 'OWNER' ? { branchId } : {}),
  });
  if (!approvalRequest) {
    throw notFound('Approval request not found.');
  }

  if (approvalRequest.status !== 'PENDING') {
    throw unprocessable('Approval request is already resolved.', 'APPROVAL_ALREADY_RESOLVED');
  }

  approvalRequest.status = 'REJECTED';
  approvalRequest.approvedBy = approverUserId;
  approvalRequest.decisionNote = normalizeTrimmedString(req.body?.decisionNote) || null;
  approvalRequest.resolvedAt = new Date();
  approvalRequest.executedAt = null;
  approvalRequest.executionResult = {
    status: 'rejected',
    reason: approvalRequest.decisionNote || null,
  };
  await approvalRequest.save();

  await logAudit({
    userId: tenantUserId,
    tenantUserId,
    actorUserId: approverUserId,
    branchId,
    entityType: 'approval_request',
    entityId: String(approvalRequest._id),
    action: 'reject',
    metadata: {
      actionType: approvalRequest.actionType,
      source: approvalRequest.source,
    },
    affectedEntity: {
      entityType: 'approval_request',
      entityId: String(approvalRequest._id),
    },
  });

  return success(req, res, serializeApprovalRequest(approvalRequest));
});

module.exports = {
  listApprovalRequests,
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
};
