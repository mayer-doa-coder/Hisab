const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parseMoney,
  isValidPhone,
  parseBoolean,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, conflict } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, parsePagination } = require('./controllerUtils');

const serializeCustomer = (doc, extra = {}) => ({
  customerId: String(doc._id),
  name: doc.name,
  phone: doc.phone || null,
  address: doc.address || null,
  creditLimit: Number(doc.creditLimit || 0),
  isArchived: Boolean(doc.isArchived),
  version: Number(doc.version || 1),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  ...extra,
});

const computeTotalDue = async ({ userId, customerId }) => {
  const rows = await BakiEntry.aggregate([
    {
      $match: {
        userId,
        customerId,
      },
    },
    {
      $group: {
        _id: null,
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0],
          },
        },
        totalPayment: {
          $sum: {
            $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0],
          },
        },
      },
    },
  ]);

  const row = rows[0] || { totalCredit: 0, totalPayment: 0 };
  return Math.max(0, Number(row.totalCredit || 0) - Number(row.totalPayment || 0));
};

const parseCreatePayload = (body = {}) => {
  const name = normalizeTrimmedString(body.name);
  if (!name) {
    throw badRequest('name is required.', [{ field: 'name', reason: 'required' }]);
  }

  const phone = normalizeTrimmedString(body.phone);
  if (phone && !isValidPhone(phone)) {
    throw badRequest('phone must be a valid number.', [{ field: 'phone', reason: 'invalid' }]);
  }

  const creditLimit = body.creditLimit === undefined ? 0 : parseMoney(body.creditLimit);
  if (creditLimit === null) {
    throw badRequest('creditLimit must be a non-negative number.', [{ field: 'creditLimit', reason: 'invalid' }]);
  }

  return {
    name,
    phone: phone || null,
    address: normalizeTrimmedString(body.address) || null,
    creditLimit,
  };
};

const parseUpdatePayload = (body = {}) => {
  const payload = {};

  if (body.name !== undefined) {
    const value = normalizeTrimmedString(body.name);
    if (!value) {
      throw badRequest('name cannot be empty.', [{ field: 'name', reason: 'invalid' }]);
    }
    payload.name = value;
  }

  if (body.phone !== undefined) {
    const phone = normalizeTrimmedString(body.phone);
    if (phone && !isValidPhone(phone)) {
      throw badRequest('phone must be a valid number.', [{ field: 'phone', reason: 'invalid' }]);
    }
    payload.phone = phone || null;
  }

  if (body.address !== undefined) {
    payload.address = normalizeTrimmedString(body.address) || null;
  }

  if (body.creditLimit !== undefined) {
    const creditLimit = parseMoney(body.creditLimit);
    if (creditLimit === null) {
      throw badRequest('creditLimit must be a non-negative number.', [{ field: 'creditLimit', reason: 'invalid' }]);
    }
    payload.creditLimit = creditLimit;
  }

  if (!Object.keys(payload).length) {
    throw badRequest('At least one updatable field is required.');
  }

  return payload;
};

const createCustomer = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const payload = parseCreatePayload(req.body);

  const created = await Customer.create({ userId, ...payload });
  const serialized = serializeCustomer(created, { totalDue: 0, riskLevel: 'low' });

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: created.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      action: 'create',
      metadata: { after: serialized },
      occurredAt: created.updatedAt,
    }),
  ]);

  return success(req, res, serialized, 201);
});

const listCustomers = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { page, pageSize, skip, limit } = parsePagination(req);

  const search = normalizeTrimmedString(req.query.search).toLowerCase();
  const hasDue = req.query.hasDue !== undefined ? parseBoolean(req.query.hasDue, false) : null;

  const query = {
    userId,
    isArchived: false,
  };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  if (hasDue === null) {
    const docs = await Customer.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const enriched = await Promise.all(
      docs.map(async (doc) => {
        const totalDue = await computeTotalDue({ userId, customerId: doc._id });
        const riskLevel = totalDue > 5000 ? 'high' : totalDue > 1000 ? 'medium' : 'low';
        return serializeCustomer(doc, { totalDue, riskLevel });
      })
    );

    const total = await Customer.countDocuments(query);

    return success(req, res, {
      items: enriched,
      page,
      pageSize,
      total,
      hasNext: skip + docs.length < total,
    });
  }

  const allDocs = await Customer.find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .lean();

  const enrichedAll = await Promise.all(
    allDocs.map(async (doc) => {
      const totalDue = await computeTotalDue({ userId, customerId: doc._id });
      const riskLevel = totalDue > 5000 ? 'high' : totalDue > 1000 ? 'medium' : 'low';
      return serializeCustomer(doc, { totalDue, riskLevel });
    })
  );

  const filtered = enrichedAll.filter((row) => (hasDue ? row.totalDue > 0 : row.totalDue <= 0));
  const pagedItems = filtered.slice(skip, skip + limit);
  const total = filtered.length;

  return success(req, res, {
    items: pagedItems,
    page,
    pageSize,
    total,
    hasNext: skip + pagedItems.length < total,
  });
});

const getCustomerById = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const doc = await Customer.findOne({ _id: req.params.customerId, userId, isArchived: false }).lean();
  if (!doc) {
    throw notFound('Customer not found.');
  }

  const totalDue = await computeTotalDue({ userId, customerId: doc._id });
  const riskLevel = totalDue > 5000 ? 'high' : totalDue > 1000 ? 'medium' : 'low';

  return success(req, res, serializeCustomer(doc, { totalDue, riskLevel }));
});

const updateCustomer = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    throw badRequest('expectedVersion is required for updates.');
  }

  const updatePayload = parseUpdatePayload(req.body);

  const updated = await Customer.findOneAndUpdate(
    {
      _id: req.params.customerId,
      userId,
      isArchived: false,
      version: expectedVersion,
    },
    {
      $set: updatePayload,
      $inc: { version: 1 },
    },
    {
      new: true,
    }
  );

  if (!updated) {
    throw conflict('Customer version conflict or customer not found.', 'VERSION_CONFLICT');
  }

  const totalDue = await computeTotalDue({ userId, customerId: updated._id });
  const riskLevel = totalDue > 5000 ? 'high' : totalDue > 1000 ? 'medium' : 'low';
  const serialized = serializeCustomer(updated, { totalDue, riskLevel });

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: updated.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      action: 'update',
      metadata: { patch: updatePayload, after: serialized },
      occurredAt: updated.updatedAt,
    }),
  ]);

  return success(req, res, serialized);
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const doc = await Customer.findOne({ _id: req.params.customerId, userId, isArchived: false });
  if (!doc) {
    throw notFound('Customer not found.');
  }

  const due = await computeTotalDue({ userId, customerId: doc._id });
  if (due > 0) {
    throw badRequest('Customer has outstanding due and cannot be deleted.', null, 'CUSTOMER_HAS_OUTSTANDING_DUE');
  }

  doc.isArchived = true;
  doc.version += 1;
  await doc.save();

  const serialized = serializeCustomer(doc, { totalDue: 0, riskLevel: 'low' });

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: doc.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'customer',
      entityId: serialized.customerId,
      action: 'delete',
      metadata: { archived: true },
      occurredAt: doc.updatedAt,
    }),
  ]);

  return success(req, res, { deleted: true, customerId: serialized.customerId });
});

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  computeTotalDue,
};
