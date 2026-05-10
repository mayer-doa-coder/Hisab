const express = require('express');
const {
  listTeamUsers,
  createTeamUser,
  updateTeamUser,
} = require('../../controllers/v1/teamUsersController');
const { requirePermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const router = express.Router();

router.get('/', requirePermission(ACTIONS.TEAM_USER_MANAGE), listTeamUsers);
router.post('/', requirePermission(ACTIONS.TEAM_USER_MANAGE), createTeamUser);
router.patch('/:userId', requirePermission(ACTIONS.TEAM_USER_MANAGE), updateTeamUser);

module.exports = router;
