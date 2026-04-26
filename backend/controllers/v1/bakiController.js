const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const CreditReminder = require('../../models/CreditReminder');
const PaymentPromise = require('../../models/PaymentPromise');
const { success } = require('../../utils/apiResponse');
const { normalizeTrimmedString, parseMoney, parseIsoDate, parsePositiveInt } = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, unprocessable } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const { trackEvent } = require('../../analytics/eventTracker');

const DEFAULT_DUE_TERMS_DAYS = 30;
const PAYMENT_CODE_TTL_HOURS = 24;

const generatePaymentCode = () => String(Math.floor(100000 + Math.random() * 900000));
const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const toIso = (value) => new Date(value).toISOString();

const computeDue = async ({ userId, customerId }) => {
  const rows = await BakiEntry.aggregate([
    {
      $match: {
        userId,
        customerId,
        isArchived: { $ne: true },
        deletedAt: null,
      },
    },
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

const getRiskLevel = (dueAmount) => {
  const due = Number(dueAmount || 0);
  if (due > 10000) {
    return RISK_LEVELS.HIGH;
  }

  if (due > 3000) {
    return RISK_LEVELS.MEDIUM;
  }

  return RISK_LEVELS.LOW;
};

const computeDefaultDueDate = ({ occurredAt, dueTermsDays }) => {
  const base = new Date(occurredAt || Date.now());
  const days = Math.max(1, Number(dueTermsDays || DEFAULT_DUE_TERMS_DAYS));
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const refreshCreditStatuses = async ({ userId, customerId, outstandingDue }) => {
  const now = new Date();

  if (Number(outstandingDue || 0) <= 0) {
    await BakiEntry.updateMany(
      {
        userId,
        customerId,
        type: 'credit',
        status: { $in: ['open', 'overdue'] },
        isArchived: { $ne: true },
        deletedAt: null,
      },
      {
        $set: {
          status: 'paid',
          resolvedAt: now,
        },
      }
    );
    return;
  }

  await BakiEntry.updateMany(
    {
      userId,
      customerId,
      type: 'credit',
      status: 'open',
      dueDate: { $lt: now },
      isArchived: { $ne: true },
      deletedAt: null,
    },
    {
      $set: {
        status: 'overdue',
      },
    }
  );
};

const refreshCustomerCreditProfile = async ({ userId, customerId, setLastPaymentDate = null }) => {
  const due = await computeDue({ userId, customerId });

  await Customer.updateOne(
    { _id: customerId, userId, isArchived: false },
    {
      $set: {
        currentBalance: due,
        riskLevel: getRiskLevel(due),
        ...(setLastPaymentDate ? { lastPaymentDate: setLastPaymentDate } : {}),
      },
    }
  );

  await refreshCreditStatuses({ userId, customerId, outstandingDue: due });
  return due;
};

const serializeEntry = (doc) => ({
  ledgerEntryId: String(doc._id),
  type: doc.type,
  customerId: String(doc.customerId),
  amount: Number(doc.amount || 0),
  runningDue: Number(doc.runningDue || 0),
  dueDate: doc.dueDate ? toIso(doc.dueDate) : null,
  status: doc.status || 'open',
  referenceId: doc.referenceId || null,
  resolvedAt: doc.resolvedAt ? toIso(doc.resolvedAt) : null,
  reminderSentAt: doc.reminderSentAt ? toIso(doc.reminderSentAt) : null,
  paymentMethod: doc.paymentMethod || null,
  note: doc.note || null,
  occurredAt: toIso(doc.occurredAt),
  createdAt: toIso(doc.createdAt || doc.occurredAt),
  paymentCode: doc.paymentCode || null,
  paymentCodeExpiresAt: doc.paymentCodeExpiresAt ? toIso(doc.paymentCodeExpiresAt) : null,
  paymentCodeUsed: Boolean(doc.paymentCodeUsed),
});

const ensureCustomer = async ({ userId, customerId }) => {
  const doc = await Customer.findOne({ _id: customerId, userId, isArchived: false });
  if (!doc) {
    throw notFound('Customer not found.');
  }
  return doc;
};

const createEntry = async ({
  userId,
  customerId,
  type,
  amount,
  note = null,
  paymentMethod = null,
  occurredAt = new Date(),
  dueDate = null,
  dueTermsDays = null,
  referenceId = null,
}) => {
  const customer = await ensureCustomer({ userId, customerId });

  const currentDue = await computeDue({ userId, customerId });

  if (type === 'credit') {
    const creditLimit = Number(customer.creditLimit || 0);
    if (creditLimit > 0 && currentDue + amount > creditLimit) {
      throw unprocessable(
        `Credit limit exceeded. Remaining limit is ৳${Math.max(0, creditLimit - currentDue).toFixed(2)}.`,
        'CREDIT_LIMIT_EXCEEDED'
      );
    }
  }

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

  const normalizedDueTermsDays = dueTermsDays || Number(customer.dueTermsDays || DEFAULT_DUE_TERMS_DAYS);
  const effectiveDueDate = type === 'credit'
    ? parseIsoDate(dueDate) || computeDefaultDueDate({ occurredAt, dueTermsDays: normalizedDueTermsDays })
    : null;
  const status = type === 'payment'
    ? 'paid'
    : (effectiveDueDate && effectiveDueDate.getTime() < Date.now() ? 'overdue' : 'open');

  const paymentCode = type === 'credit' ? generatePaymentCode() : null;
  const paymentCodeExpiresAt = type === 'credit'
    ? new Date(Date.now() + PAYMENT_CODE_TTL_HOURS * 60 * 60 * 1000)
    : null;

  const created = await BakiEntry.create({
    userId,
    customerId,
    type,
    amount,
    runningDue,
    dueDate: effectiveDueDate,
    status,
    referenceId: normalizeTrimmedString(referenceId) || null,
    resolvedAt: type === 'payment' ? occurredAt : null,
    paymentMethod: type === 'payment' ? paymentMethod || 'cash' : null,
    note,
    occurredAt,
    paymentCode,
    paymentCodeExpiresAt,
    paymentCodeUsed: false,
  });

  if (type === 'payment') {
    const pendingPromises = await PaymentPromise.find({
      userId,
      customerId,
      status: 'pending',
    }).sort({ promiseDate: 1, createdAt: 1 });

    let remainingCoverage = amount;
    for (const promise of pendingPromises) {
      if (remainingCoverage < Number(promise.promisedAmount || 0)) {
        break;
      }

      promise.status = 'fulfilled';
      promise.fulfilledByEntryId = created._id;
      await promise.save();
      remainingCoverage -= Number(promise.promisedAmount || 0);
    }
  }

  const currentDueAfter = await refreshCustomerCreditProfile({
    userId,
    customerId,
    setLastPaymentDate: type === 'payment' ? occurredAt : null,
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
      metadata: { after: serialized, previousDue: currentDue, currentDueAfter },
      occurredAt: created.updatedAt,
    }),
  ]);

  return {
    ...serialized,
    currentDueAfter,
  };
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
  const dueDate = req.body.dueDate ? parseIsoDate(req.body.dueDate) : null;
  if (req.body.dueDate && !dueDate) {
    throw badRequest('dueDate must be a valid ISO date.', [{ field: 'dueDate', reason: 'invalid' }]);
  }

  const dueTermsDays = req.body.dueTermsDays === undefined ? null : parsePositiveInt(req.body.dueTermsDays);
  if (req.body.dueTermsDays !== undefined && !dueTermsDays) {
    throw badRequest('dueTermsDays must be a positive integer.', [{ field: 'dueTermsDays', reason: 'invalid' }]);
  }
  const referenceId = normalizeTrimmedString(req.body.referenceId) || null;

  const entry = await createEntry({
    userId,
    customerId,
    type: 'credit',
    amount,
    note,
    occurredAt,
    dueDate,
    dueTermsDays,
    referenceId,
  });

  try {
    await trackEvent({
      userId,
      eventType: 'payment_recorded',
      timestamp: entry.occurredAt,
      metadata: {
        customerId,
        amount,
        paymentMethod,
        ledgerEntryId: entry.ledgerEntryId,
      },
      source: 'baki_api',
    });
  } catch {
    // Analytics should not block payment recording flow.
  }

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
  const referenceId = normalizeTrimmedString(req.body.referenceId) || null;

  const entry = await createEntry({
    userId,
    customerId,
    type: 'payment',
    amount,
    note,
    paymentMethod,
    occurredAt,
    referenceId,
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
  const overdueRows = await BakiEntry.aggregate([
    {
      $match: {
        userId,
        customerId,
        type: 'credit',
        status: 'overdue',
        isArchived: { $ne: true },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        overdueAmount: { $sum: '$amount' },
        oldestDueDate: { $min: '$dueDate' },
      },
    },
  ]);

  const overdueInfo = overdueRows[0] || { overdueAmount: 0, oldestDueDate: null };

  return success(req, res, {
    customer: {
      customerId,
      name: customer?.name || 'Unknown',
      phone: customer?.phone || null,
      creditLimit: Number(customer?.creditLimit || 0),
      currentBalance: Number(customer?.currentBalance || totalDue),
      riskLevel: customer?.riskLevel || getRiskLevel(totalDue),
      dueTermsDays: Number(customer?.dueTermsDays || DEFAULT_DUE_TERMS_DAYS),
      lastPaymentDate: customer?.lastPaymentDate ? toIso(customer.lastPaymentDate) : null,
    },
    entries: entries.map(serializeEntry),
    totalDue,
    overdueAmount: Number(overdueInfo.overdueAmount || 0),
    oldestDueDate: overdueInfo.oldestDueDate ? toIso(overdueInfo.oldestDueDate) : null,
  });
});

const getBakiSummary = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const match = {
    userId,
    isArchived: { $ne: true },
    deletedAt: null,
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

  const [outstandingRow, overdueRow] = await Promise.all([
    Customer.aggregate([
      { $match: { userId, isArchived: false } },
      { $group: { _id: null, totalOutstanding: { $sum: '$currentBalance' } } },
    ]),
    BakiEntry.aggregate([
      {
        $match: {
          userId,
          type: 'credit',
          status: 'overdue',
          isArchived: { $ne: true },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          totalOverdue: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  return success(req, res, {
    totalCredit,
    totalPayments,
    netDueChange,
    collectionRate,
    activeCustomers: Array.isArray(row.activeCustomers) ? row.activeCustomers.length : 0,
    totalOutstanding: Number(outstandingRow?.[0]?.totalOutstanding || 0),
    totalOverdue: Number(overdueRow?.[0]?.totalOverdue || 0),
  });
});

const getCollectionsDashboard = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const [summaryRows, overdueRows, customerRows, promiseRows] = await Promise.all([
    BakiEntry.aggregate([
      {
        $match: {
          userId,
          isArchived: { $ne: true },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          totalPayment: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        },
      },
    ]),
    BakiEntry.find({
      userId,
      type: 'credit',
      status: 'overdue',
      isArchived: { $ne: true },
      deletedAt: null,
    })
      .select({ amount: 1, dueDate: 1 })
      .lean(),
    Customer.find({ userId, isArchived: false })
      .select({ name: 1, phone: 1, currentBalance: 1, riskLevel: 1 })
      .lean(),
    PaymentPromise.find({ userId, status: 'pending' })
      .select({ promisedAmount: 1, promiseDate: 1, customerId: 1 })
      .lean(),
  ]);

  const now = Date.now();
  const agingBuckets = {
    '0_30': 0,
    '31_60': 0,
    '61_90': 0,
    '90_plus': 0,
  };

  for (const row of overdueRows) {
    const dueTime = row?.dueDate ? new Date(row.dueDate).getTime() : now;
    const ageDays = Math.max(0, Math.floor((now - dueTime) / (24 * 60 * 60 * 1000)));
    const amount = Number(row?.amount || 0);
    if (ageDays <= 30) {
      agingBuckets['0_30'] += amount;
    } else if (ageDays <= 60) {
      agingBuckets['31_60'] += amount;
    } else if (ageDays <= 90) {
      agingBuckets['61_90'] += amount;
    } else {
      agingBuckets['90_plus'] += amount;
    }
  }

  const segmentSummary = {
    low: { customers: 0, outstanding: 0 },
    medium: { customers: 0, outstanding: 0 },
    high: { customers: 0, outstanding: 0 },
  };

  for (const row of customerRows) {
    const token = ['low', 'medium', 'high'].includes(String(row?.riskLevel || '').toLowerCase())
      ? String(row.riskLevel).toLowerCase()
      : 'low';
    segmentSummary[token].customers += 1;
    segmentSummary[token].outstanding += Number(row?.currentBalance || 0);
  }

  const summary = summaryRows[0] || { totalCredit: 0, totalPayment: 0 };
  const totalOutstanding = customerRows.reduce((sum, row) => sum + Number(row.currentBalance || 0), 0);
  const totalOverdue = overdueRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalPromised = promiseRows.reduce((sum, row) => sum + Number(row.promisedAmount || 0), 0);

  return success(req, res, {
    totalCredit: Number(summary.totalCredit || 0),
    totalPayment: Number(summary.totalPayment || 0),
    totalOutstanding,
    totalOverdue,
    collectionRate: Number(summary.totalCredit || 0) > 0
      ? Number((((Number(summary.totalPayment || 0) / Number(summary.totalCredit || 1)) * 100)).toFixed(2))
      : 0,
    agingBuckets: {
      '0_30': Number(agingBuckets['0_30'].toFixed(2)),
      '31_60': Number(agingBuckets['31_60'].toFixed(2)),
      '61_90': Number(agingBuckets['61_90'].toFixed(2)),
      '90_plus': Number(agingBuckets['90_plus'].toFixed(2)),
    },
    segmentSummary,
    pendingPromises: {
      count: promiseRows.length,
      totalPromised: Number(totalPromised.toFixed(2)),
    },
    customers: customerRows.map((row) => ({
      customerId: String(row._id),
      name: row.name,
      phone: row.phone || null,
      riskLevel: row.riskLevel || 'low',
      currentBalance: Number(row.currentBalance || 0),
    })),
  });
});

const createReminder = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);
  const channel = normalizeTrimmedString(req.body.channel || 'manual').toLowerCase();
  const sentAt = parseIsoDate(req.body.sentAt) || new Date();

  await ensureCustomer({ userId, customerId });

  if (!['sms', 'whatsapp', 'call', 'manual'].includes(channel)) {
    throw badRequest('channel must be one of sms, whatsapp, call, manual.', [{ field: 'channel', reason: 'invalid' }]);
  }

  const bakiEntryId = normalizeTrimmedString(req.body.bakiEntryId) || null;
  const status = normalizeTrimmedString(req.body.status || 'sent').toLowerCase();
  const normalizedStatus = ['queued', 'sent', 'failed'].includes(status) ? status : 'sent';
  const message = normalizeTrimmedString(req.body.message) || null;
  const referenceId = normalizeTrimmedString(req.body.referenceId) || null;

  const created = await CreditReminder.create({
    userId,
    customerId,
    bakiEntryId,
    channel,
    message,
    sentAt,
    status: normalizedStatus,
    referenceId,
  });

  if (bakiEntryId) {
    await BakiEntry.updateOne(
      { _id: bakiEntryId, userId, customerId },
      {
        $set: {
          reminderSentAt: sentAt,
        },
      }
    );
  }

  return success(req, res, {
    reminderId: String(created._id),
    customerId,
    channel,
    message,
    sentAt: toIso(created.sentAt),
    status: created.status,
    referenceId: created.referenceId || null,
  }, 201);
});

const listReminders = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));

  await ensureCustomer({ userId, customerId });

  const rows = await CreditReminder.find({ userId, customerId })
    .sort({ sentAt: -1, _id: -1 })
    .limit(limit)
    .lean();

  return success(req, res, {
    items: rows.map((row) => ({
      reminderId: String(row._id),
      customerId: String(row.customerId),
      bakiEntryId: row.bakiEntryId ? String(row.bakiEntryId) : null,
      channel: row.channel,
      message: row.message || null,
      sentAt: toIso(row.sentAt),
      status: row.status,
      referenceId: row.referenceId || null,
    })),
  });
});

const createPaymentPromise = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);
  const promisedAmount = parseMoney(req.body.promisedAmount);
  const promiseDate = parseIsoDate(req.body.promiseDate);

  if (promisedAmount === null || promisedAmount <= 0) {
    throw badRequest('promisedAmount must be greater than 0.', [{ field: 'promisedAmount', reason: 'invalid' }]);
  }

  if (!promiseDate) {
    throw badRequest('promiseDate must be a valid ISO date.', [{ field: 'promiseDate', reason: 'invalid' }]);
  }

  await ensureCustomer({ userId, customerId });

  const created = await PaymentPromise.create({
    userId,
    customerId,
    promisedAmount,
    promiseDate,
    note: normalizeTrimmedString(req.body.note) || null,
    status: 'pending',
  });

  return success(req, res, {
    promiseId: String(created._id),
    customerId: String(created.customerId),
    promisedAmount: Number(created.promisedAmount || 0),
    promiseDate: toIso(created.promiseDate),
    status: created.status,
    note: created.note || null,
  }, 201);
});

const listPaymentPromises = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);
  const statusFilter = normalizeTrimmedString(req.query.status).toLowerCase();
  const query = {
    userId,
    customerId,
  };

  if (['pending', 'fulfilled', 'broken'].includes(statusFilter)) {
    query.status = statusFilter;
  }

  await ensureCustomer({ userId, customerId });

  const rows = await PaymentPromise.find(query)
    .sort({ promiseDate: 1, _id: -1 })
    .lean();

  return success(req, res, {
    items: rows.map((row) => ({
      promiseId: String(row._id),
      customerId: String(row.customerId),
      promisedAmount: Number(row.promisedAmount || 0),
      promiseDate: toIso(row.promiseDate),
      status: row.status,
      note: row.note || null,
      fulfilledByEntryId: row.fulfilledByEntryId ? String(row.fulfilledByEntryId) : null,
    })),
  });
});

const updatePaymentPromiseStatus = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const promiseId = normalizeTrimmedString(req.params.promiseId);
  const status = normalizeTrimmedString(req.body.status).toLowerCase();

  if (!['pending', 'fulfilled', 'broken'].includes(status)) {
    throw badRequest('status must be pending, fulfilled, or broken.', [{ field: 'status', reason: 'invalid' }]);
  }

  const updated = await PaymentPromise.findOneAndUpdate(
    { _id: promiseId, userId },
    {
      $set: {
        status,
      },
    },
    { new: true }
  );

  if (!updated) {
    throw notFound('Payment promise not found.');
  }

  return success(req, res, {
    promiseId: String(updated._id),
    customerId: String(updated.customerId),
    promisedAmount: Number(updated.promisedAmount || 0),
    promiseDate: toIso(updated.promiseDate),
    status: updated.status,
    note: updated.note || null,
  });
});

const getCustomerStatement = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);

  await ensureCustomer({ userId, customerId });

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const match = {
    userId,
    customerId,
    isArchived: { $ne: true },
    deletedAt: null,
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

  const [customer, entries, reminders, promises] = await Promise.all([
    Customer.findOne({ _id: customerId, userId, isArchived: false }).lean(),
    BakiEntry.find(match).sort({ occurredAt: 1, _id: 1 }).lean(),
    CreditReminder.find({ userId, customerId }).sort({ sentAt: -1 }).limit(30).lean(),
    PaymentPromise.find({ userId, customerId }).sort({ promiseDate: -1 }).limit(30).lean(),
  ]);

  const summary = entries.reduce((acc, row) => {
    if (row.type === 'credit') {
      acc.totalCredit += Number(row.amount || 0);
    }
    if (row.type === 'payment') {
      acc.totalPayment += Number(row.amount || 0);
    }
    return acc;
  }, { totalCredit: 0, totalPayment: 0 });

  const balance = Math.max(0, Number((summary.totalCredit - summary.totalPayment).toFixed(2)));

  return success(req, res, {
    customer: {
      customerId: String(customer?._id || customerId),
      name: customer?.name || 'Unknown',
      phone: customer?.phone || null,
      address: customer?.address || null,
      creditLimit: Number(customer?.creditLimit || 0),
      currentBalance: Number(customer?.currentBalance || balance),
      riskLevel: customer?.riskLevel || getRiskLevel(balance),
      dueTermsDays: Number(customer?.dueTermsDays || DEFAULT_DUE_TERMS_DAYS),
      lastPaymentDate: customer?.lastPaymentDate ? toIso(customer.lastPaymentDate) : null,
    },
    summary: {
      totalCredit: Number(summary.totalCredit.toFixed(2)),
      totalPayment: Number(summary.totalPayment.toFixed(2)),
      closingBalance: balance,
    },
    entries: entries.map(serializeEntry),
    reminders: reminders.map((row) => ({
      reminderId: String(row._id),
      channel: row.channel,
      message: row.message || null,
      sentAt: toIso(row.sentAt),
      status: row.status,
    })),
    promises: promises.map((row) => ({
      promiseId: String(row._id),
      promisedAmount: Number(row.promisedAmount || 0),
      promiseDate: toIso(row.promiseDate),
      status: row.status,
      note: row.note || null,
    })),
  });
});

const exportCustomerStatementCsv = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const customerId = normalizeTrimmedString(req.params.customerId);
  await ensureCustomer({ userId, customerId });

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);
  const match = {
    userId,
    customerId,
    isArchived: { $ne: true },
    deletedAt: null,
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

  const [customer, entries] = await Promise.all([
    Customer.findOne({ _id: customerId, userId, isArchived: false }).lean(),
    BakiEntry.find(match).sort({ occurredAt: 1, _id: 1 }).lean(),
  ]);

  const header = ['date', 'type', 'amount', 'running_due', 'status', 'due_date', 'payment_method', 'reference_id', 'note'];
  const rows = entries.map((row) => [
    row.occurredAt ? toIso(row.occurredAt) : '',
    row.type || '',
    Number(row.amount || 0).toFixed(2),
    Number(row.runningDue || 0).toFixed(2),
    row.status || '',
    row.dueDate ? toIso(row.dueDate) : '',
    row.paymentMethod || '',
    row.referenceId || '',
    (row.note || '').replace(/\"/g, '\"\"'),
  ]);

  const csvLines = [
    `customer,${(customer?.name || 'Unknown').replace(/\"/g, '\"\"')}`,
    `phone,${(customer?.phone || '').replace(/\"/g, '\"\"')}`,
    header.join(','),
    ...rows.map((cols) => cols.map((col) => `\"${String(col || '')}\"`).join(',')),
  ];

  const csv = csvLines.join('\n');
  const fileToken = `customer-statement-${customerId}-${Date.now()}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"${fileToken}\"`);
  return res.status(200).send(csv);
});

module.exports = {
  addCredit,
  addPayment,
  getCustomerLedger,
  getBakiSummary,
  getCollectionsDashboard,
  createReminder,
  listReminders,
  createPaymentPromise,
  listPaymentPromises,
  updatePaymentPromiseStatus,
  getCustomerStatement,
  exportCustomerStatementCsv,
  computeDue,
};
