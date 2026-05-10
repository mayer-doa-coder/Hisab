const bcrypt = require('bcrypt');
const User = require('../../models/User');
const Branch = require('../../models/Branch');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString } = require('../../utils/validation');
const { normalizeEmail, normalizePin } = require('../../utils/normalization');
const { canonicalizeRole, ROLES } = require('../../security/rbac');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const { badRequest, notFound, conflict } = require('../../services/v1/httpError');

const PIN_REGEX = /^\d{4,6}$/;

const serializeUser = (doc) => ({
  id: String(doc._id),
  name: doc.name || null,
  email: doc.email,
  phone: doc.phone || null,
  role: canonicalizeRole(doc.role),
  status: String(doc.status || 'ACTIVE').toUpperCase(),
  branchId: doc.branchId ? String(doc.branchId) : null,
  ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : String(doc._id),
  createdAt: doc.createdAt,
});

const listTeamUsers = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const docs = await User.find({ ownerUserId }).sort({ createdAt: -1, _id: -1 }).lean();
  return success(req, res, {
    items: docs.map(serializeUser),
    total: docs.length,
  });
});

const createTeamUser = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const email = normalizeEmail(req.body?.email);
  const pin = normalizePin(req.body?.pin);
  const role = canonicalizeRole(req.body?.role);
  const name = normalizeTrimmedString(req.body?.name) || null;
  const phone = normalizeTrimmedString(req.body?.phone) || null;
  const status = normalizeTrimmedString(req.body?.status || 'ACTIVE').toUpperCase();
  const branchId = normalizeTrimmedString(req.body?.branchId) || null;

  if (!email) {
    throw badRequest('email is required.', [{ field: 'email', reason: 'required' }]);
  }
  if (!PIN_REGEX.test(pin)) {
    throw badRequest('pin must be 4 to 6 digits.', [{ field: 'pin', reason: 'invalid' }]);
  }
  if (!name) {
    throw badRequest('name is required.', [{ field: 'name', reason: 'required' }]);
  }
  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    throw badRequest('status must be ACTIVE, INACTIVE, or SUSPENDED.', [{ field: 'status', reason: 'invalid' }]);
  }

  const effectiveRole = role || ROLES.CASHIER;
  if (![ROLES.OWNER, ROLES.CASHIER, ROLES.STOCK_MANAGER, ROLES.ACCOUNTANT].includes(effectiveRole)) {
    throw badRequest('Invalid role.', [{ field: 'role', reason: 'invalid' }]);
  }

  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, ownerUserId }).lean();
    if (!branch) {
      throw notFound('Branch not found for this owner.');
    }
  }

  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw conflict('Email already exists.', 'EMAIL_ALREADY_EXISTS');
  }

  const pinHash = await bcrypt.hash(pin, 12);
  const created = await User.create({
    name,
    email,
    phone,
    role: effectiveRole,
    status,
    ownerUserId,
    branchId: branchId || null,
    password: pinHash,
    pinHash,
    pinSetAt: new Date(),
    emailVerifiedAt: new Date(),
    failedPinAttempts: 0,
    pinLockUntil: null,
    failedLoginAttempts: 0,
    lockUntil: null,
    passwordChangedAt: new Date(),
    pinChangedAt: new Date(),
  });

  return success(req, res, serializeUser(created), 201);
});

const updateTeamUser = asyncHandler(async (req, res) => {
  const ownerUserId = getUserIdFromReq(req);
  const userId = normalizeTrimmedString(req.params.userId);
  const user = await User.findOne({ _id: userId, ownerUserId });
  if (!user) {
    throw notFound('Team user not found.');
  }

  if (req.body?.name !== undefined) {
    const name = normalizeTrimmedString(req.body.name);
    if (!name) {
      throw badRequest('name cannot be empty.', [{ field: 'name', reason: 'invalid' }]);
    }
    user.name = name;
  }

  if (req.body?.phone !== undefined) {
    user.phone = normalizeTrimmedString(req.body.phone) || null;
  }

  if (req.body?.role !== undefined) {
    user.role = canonicalizeRole(req.body.role);
  }

  if (req.body?.status !== undefined) {
    const status = normalizeTrimmedString(req.body.status).toUpperCase();
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      throw badRequest('status must be ACTIVE, INACTIVE, or SUSPENDED.', [{ field: 'status', reason: 'invalid' }]);
    }
    user.status = status;
  }

  if (req.body?.branchId !== undefined) {
    const branchId = normalizeTrimmedString(req.body.branchId) || null;
    if (branchId) {
      const branch = await Branch.findOne({ _id: branchId, ownerUserId }).lean();
      if (!branch) {
        throw notFound('Branch not found for this owner.');
      }
    }
    user.branchId = branchId;
  }

  await user.save();
  return success(req, res, serializeUser(user));
});

module.exports = {
  listTeamUsers,
  createTeamUser,
  updateTeamUser,
};
