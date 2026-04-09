const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString, parseMoney, parseIsoDate } = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, unprocessable } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const toIso = (value) => new Date(value).toISOString();

const computeDue = async ({ userId, customerId }) => {
  const rows = await BakiEntry.aggregate([
    { $match: { userId, customerId } },
    {
      $group: {
        _id: null,
        credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
        payment: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
      },
    },
  ]);

  const row = rows[0] || { credit: 0, payment: 0 };
  return Math.max(0, Number(row.credit || 0) - Number(row.payment || 0));
};

const serializeEntry = (doc) => ({
  ledgerEntryId: String(doc._id),
  type: doc.type,
  customerId: String(doc.customerId),
  amount: Number(doc.amount || 0),
  runningDue: Number(doc.runningDue || 0),
  paymentMethod: doc.paymentMethod || null,
  note: doc.note || null,
  occurredAt: toIso(doc.occurredAt),
  createdAt: toIso(doc.createdAt || doc.occurredAt),
});

const ensureCustomer = async ({ userId, customerId }) => {
  const doc = await Customer.findOne({ _id: customerId, userId, isArchived: false });
  if (!doc) {
    throw notFound('Customer not found.');
  }
  return doc;
};

const createEntry = async ({ userId, customerId, type, amount, note = null, paymentMethod = null, occurredAt = new Date() }) => {
  await ensureCustomer({ userId, customerId });

  const currentDue = await computeDue({ userId, customerId });

  if (type === 'payment') {
    if (currentDue <= 0) {
      throw unprocessable('No outstanding due exists for this customer.', 'NO_OUTSTANDING_DUE');
    }
    if (amount > currentDue) {
      throw unprocessable('Payment cannot exceed outstanding due.', 'OVERPAYMENT_NOT_ALLOWED');
    }
  }

  const runningDue = type === 'credit'
    ? currentDue + amount
    : Math.max(0, currentDue - amount);

  const created = await BakiEntry.create({
    userId,
    customerId,
    type,
    amount,
    runningDue,
    paymentMethod: type === 'payment' ? paymentMethod || 'cash' : null,
    note,
    occurredAt,
  });

  const serialized = serializeEntry(created);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'baki_entry',
      entityId: serialized.ledgerEntryId,
      changeType: 'upsert',
      payload: serialized,
      version: 1,
      occurredAt: created.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'baki_entry',
      entityId: serialized.ledgerEntryId,
      action: type,
      metadata: { after: serialized, previousDue: currentDue },
      occurredAt: created.updatedAt,
    }),
  ]);

  return serialized;
};

const addCredit = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.body.customerId);
  const amount = parseMoney(req.body.amount);

  if (!customerId) {
    throw badRequest('customerId is required.', [{ field: 'customerId', reason: 'required' }]);
  }
  if (amount === null || amount <= 0) {
    throw badRequest('amount must be greater than 0.', [{ field: 'amount', reason: 'invalid' }]);
  }

  const note = normalizeTrimmedString(req.body.note) || null;
  const occurredAt = parseIsoDate(req.body.occurredAt) || new Date();

  const entry = await createEntry({
    userId,
    customerId,
    type: 'credit',
    amount,
    note,
    occurredAt,
  });

  return success(req, res, entry, 201);
});

const addPayment = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.body.customerId);
  const amount = parseMoney(req.body.amount);

  if (!customerId) {
    throw badRequest('customerId is required.', [{ field: 'customerId', reason: 'required' }]);
  }
  if (amount === null || amount <= 0) {
    throw badRequest('amount must be greater than 0.', [{ field: 'amount', reason: 'invalid' }]);
  }

  const note = normalizeTrimmedString(req.body.note) || null;
  const paymentMethod = normalizeTrimmedString(req.body.paymentMethod) || 'cash';
  const occurredAt = parseIsoDate(req.body.occurredAt) || new Date();

  const entry = await createEntry({
    userId,
    customerId,
    type: 'payment',
    amount,
    note,
    paymentMethod,
    occurredAt,
  });

  return success(req, res, entry, 201);
});

const getCustomerLedger = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);

  await ensureCustomer({ userId, customerId });

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const match = {
    userId,
    customerId,
  };

  if (from || to) {
    match.occurredAt = {};
    if (from) {
      match.occurredAt.$gte = from;
    }
    if (to) {
      match.occurredAt.$lte = to;
    }
  }

  const entries = await BakiEntry.find(match).sort({ occurredAt: 1, _id: 1 }).lean();
  const customer = await Customer.findOne({ _id: customerId, userId, isArchived: false }).lean();
  const totalDue = await computeDue({ userId, customerId });

  return success(req, res, {
    customer: {
      customerId,
      name: customer?.name || 'Unknown',
    },
    entries: entries.map(serializeEntry),
    totalDue,
  });
});

const getBakiSummary = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const match = {
    userId,
  };

  if (from || to) {
    match.occurredAt = {};
    if (from) {
      match.occurredAt.$gte = from;
    }
    if (to) {
      match.occurredAt.$lte = to;
    }
  }

  const rows = await BakiEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
        totalPayments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        activeCustomers: { $addToSet: '$customerId' },
      },
    },
  ]);

  const row = rows[0] || { totalCredit: 0, totalPayments: 0, activeCustomers: [] };
  const totalCredit = Number(row.totalCredit || 0);
  const totalPayments = Number(row.totalPayments || 0);
  const netDueChange = Number((totalCredit - totalPayments).toFixed(2));
  const collectionRate = totalCredit > 0 ? Number(((totalPayments / totalCredit) * 100).toFixed(2)) : 0;

  return success(req, res, {
    totalCredit,
    totalPayments,
    netDueChange,
    collectionRate,
    activeCustomers: Array.isArray(row.activeCustomers) ? row.activeCustomers.length : 0,
  });
});

module.exports = {
  addCredit,
  addPayment,
  getCustomerLedger,
  getBakiSummary,
  computeDue,
};
