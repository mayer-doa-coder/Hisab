const { success, error: sendError } = require('../../utils/apiResponse');
const { badRequest } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const {
  writeMonitoringSnapshot,
  loadMonitoringSnapshot,
} = require('../../services/trustMonitoringArtifactService');
const { normalizeRole } = require('../../utils/normalization');
const PRIVILEGED_ROLES = new Set(['owner', 'admin', 'manager', 'auditor']);

const canReadSnapshot = (req, snapshot) => {
  const userId = String(getUserIdFromReq(req) || '').trim();
  const userRole = normalizeRole(req.user?.role || req.auth?.role);

  if (PRIVILEGED_ROLES.has(userRole)) {
    return true;
  }

  const snapshotUserId = String(snapshot?.metadata?.user_id || '').trim();
  if (!snapshotUserId || !userId) {
    return false;
  }

  return snapshotUserId === userId;
};

const postTrustMonitoringSnapshot = asyncHandler(async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : null;
  if (!payload) {
    throw badRequest('Monitoring snapshot payload is required.', [{ field: 'body', reason: 'required' }]);
  }

  const snapshot = payload.snapshot && typeof payload.snapshot === 'object'
    ? payload.snapshot
    : payload;

  const source = String(payload.source || 'phase8_runtime').trim() || 'phase8_runtime';

  const result = writeMonitoringSnapshot({
    snapshot: {
      ...snapshot,
      metadata: {
        ...(snapshot?.metadata || {}),
        user_id: getUserIdFromReq(req),
        app_version: payload.app_version || snapshot?.metadata?.app_version || null,
        rollout_stage: payload.rollout_stage || snapshot?.metadata?.rollout_stage || null,
        rollout_percentage: payload.rollout_percentage ?? snapshot?.metadata?.rollout_percentage ?? null,
      },
    },
    source,
  });

  return success(req, res, {
    output_path: result.output_path,
    generated_at: result.snapshot.generated_at,
    ingested_at: result.snapshot.ingested_at,
    request_count: result.snapshot.request_count,
    fallback_rate: result.snapshot.fallback_rate,
    error_rate: result.snapshot.error_rate,
    prediction_drift_psi: result.snapshot.prediction_drift_psi,
  }, 201);
});

const getTrustMonitoringSnapshot = asyncHandler(async (req, res) => {
  const snapshot = loadMonitoringSnapshot();
  if (!snapshot) {
    throw badRequest('No trust monitoring snapshot found.', [{ field: 'snapshot', reason: 'missing' }]);
  }

  if (!canReadSnapshot(req, snapshot)) {
    return sendError(req, res, {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You do not have access to this monitoring snapshot.',
    });
  }

  return success(req, res, snapshot);
});

module.exports = {
  postTrustMonitoringSnapshot,
  getTrustMonitoringSnapshot,
};