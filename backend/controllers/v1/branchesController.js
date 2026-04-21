const Branch = require('../../models/Branch');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString } = require('../../utils/validation');
const { badRequest, notFound } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const serializeBranch = (doc) => ({
  branchId: String(doc._id),
  name: doc.name,
  location: doc.location || null,
  status: doc.status || 'ACTIVE',
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const listBranches = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const docs = await Branch.find({ ownerUserId }).sort({ createdAt: -1, _id: -1 }).lean();
  return success(req, res, {
    items: docs.map(serializeBranch),
    total: docs.length,
  });
});

const createBranch = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const name = normalizeTrimmedString(req.body?.name);
  if (!name) {
    throw badRequest('Branch name is required.', [{ field: 'name', reason: 'required' }]);
  }

  const created = await Branch.create({
    ownerUserId,
    name,
    location: normalizeTrimmedString(req.body?.location) || null,
    status: normalizeTrimmedString(req.body?.status || 'ACTIVE').toUpperCase(),
  });

  return success(req, res, serializeBranch(created), 201);
});

const updateBranch = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const branchId = normalizeTrimmedString(req.params.branchId);
  const branch = await Branch.findOne({ _id: branchId, ownerUserId });
  if (!branch) {
    throw notFound('Branch not found.');
  }

  const nextName = normalizeTrimmedString(req.body?.name);
  if (req.body?.name !== undefined && !nextName) {
    throw badRequest('Branch name cannot be empty.', [{ field: 'name', reason: 'invalid' }]);
  }

  if (nextName) {
    branch.name = nextName;
  }
  if (req.body?.location !== undefined) {
    branch.location = normalizeTrimmedString(req.body.location) || null;
  }
  if (req.body?.status !== undefined) {
    const status = normalizeTrimmedString(req.body.status).toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      throw badRequest('status must be ACTIVE or INACTIVE.', [{ field: 'status', reason: 'invalid' }]);
    }
    branch.status = status;
  }

  await branch.save();
  return success(req, res, serializeBranch(branch));
});

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
};
