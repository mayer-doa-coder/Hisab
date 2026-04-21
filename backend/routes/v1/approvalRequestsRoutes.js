const express = require('express');
const {
  listApprovalRequests,
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
} = require('../../controllers/v1/approvalRequestsController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.APPROVAL_REVIEW), listApprovalRequests);
router.post('/', requirePermission(ACTIONS.APPROVAL_REQUEST_CREATE), createApprovalRequest);
router.post('/:approvalRequestId/approve', requirePermission(ACTIONS.APPROVAL_REVIEW), approveApprovalRequest);
router.post('/:approvalRequestId/reject', requirePermission(ACTIONS.APPROVAL_REVIEW), rejectApprovalRequest);

module.exports = router;
