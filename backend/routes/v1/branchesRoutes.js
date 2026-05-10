const express = require('express');
const {
  listBranches,
  createBranch,
  updateBranch,
} = require('../../controllers/v1/branchesController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.BRANCH_MANAGE), listBranches);
router.post('/', requirePermission(ACTIONS.BRANCH_MANAGE), createBranch);
router.patch('/:branchId', requirePermission(ACTIONS.BRANCH_MANAGE), updateBranch);

module.exports = router;
