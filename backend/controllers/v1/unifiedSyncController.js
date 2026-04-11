const mongoose = require('mongoose');

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const InventoryMovement = require('../../models/InventoryMovement');
const Transaction = require('../../models/Transaction');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parseMoney,
  parseNonNegativeInt,
  parsePositiveInt,
  parseIsoDate,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const {
  buildPayloadHash,
  ensureNotConflictingReplay,
  findRecord,
  writeRecord,
} = require('../../services/v1/idempotencyService');
const { badRequest } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const MAX_CHANGES_PER_BATCH = 300;
const MAX_SERVER_CHANGES = 500;

const normalizeEntity = (value) => normalizeTrimmedString(value).toLowerCase();
const normalizeType = (value) => normalizeTrimmedString(value).toLowerCase();

const parseOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = parseIsoDate(value);
  return parsed || null;
};

const asSyncError = (status, message, conflict = null) => ({
  status,
  message,
  conflict,
});

const isMongoDuplicateKeyError = (error) => Number(error?.code) === 11000;

const nowIso = () => new Date().toISOString();

const toObjectIdString = (value) => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
    return null;
  }

  return normalized;
};

const buildRouteKey = ({ entity, type }) => `SYNC_UNIFIED:${entity}:${type}`;

const findByServerOrClientId = async (Model, { userId, refId }) => {
  const normalizedRef = normalizeTrimmedString(refId);
  if (!normalizedRef) {
    return null;
  }

  const byObjectId = toObjectIdString(normalizedRef);
  if (byObjectId) {
    const byIdDoc = await Model.findOne({ _id: byObjectId, userId });
    if (byIdDoc) {
      return byIdDoc;
    }
  }

  return Model.findOne({ userId, clientRefId: normalizedRef });
};

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

const serializeProduct = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    name: doc.name,
    price: Number(doc.price || 0),
    quantity: Number(doc.quantityOnHand || 0),
    lowStockThreshold: Number(doc.reorderLevel || 0),
    expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeCustomer = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    name: doc.name,
    phone: doc.phone || null,
    address: doc.address || null,
    creditLimit: Number(doc.creditLimit || 0),
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeBakiEntry = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    type: doc.type,
    amount: Number(doc.amount || 0),
    note: doc.note || null,
    paymentMethod: doc.paymentMethod || null,
    runningDue: Number(doc.runningDue || 0),
    customerServerId: String(doc.customerId),
    customerClientRefId: doc.customerClientRefId || null,
    occurredAt: doc.occurredAt ? new Date(doc.occurredAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeMovement = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    movementType: doc.movementType,
    quantityDelta: Number(doc.quantityDelta || 0),
    quantityBefore: Number(doc.quantityBefore || 0),
    quantityAfter: Number(doc.quantityAfter || 0),
    reason: doc.reason || null,
    note: doc.note || null,
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    occurredAt: doc.occurredAt ? new Date(doc.occurredAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeTransaction = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    transactionType: doc.transactionType,
    amount: Number(doc.amount || 0),
    currency: doc.currency || 'BDT',
    status: doc.status,
    note: doc.note || null,
    customerServerId: doc.customerId ? String(doc.customerId) : null,
    customerClientRefId: doc.customerClientRefId || null,
    occurredAt: doc.occurredAt ? new Date(doc.occurredAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.status === 'voided'),
});

const parseRequiredIdempotencyKey = (change) => {
  const idempotencyKey = normalizeTrimmedString(change?.idempotencyKey);
  if (!idempotencyKey) {
    return null;
  }

  if (idempotencyKey.length > 128) {
    return null;
  }

  return idempotencyKey;
};

const buildReferenceCandidates = (...values) => {
  const candidates = [];
  const seen = new Set();

  for (const raw of values) {
    const normalized = normalizeTrimmedString(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    candidates.push(normalized);
  }

  return candidates;
};

const resolveFirstReference = async ({ resolver, userId, candidates }) => {
  for (const value of candidates) {
    const resolved = await resolver({ userId, value });
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const resolveCustomerReferenceFromPayload = async ({ userId, payload = {} }) => {
  const legacyLocalCustomerId = Number(payload.customerId);
  const legacyClientRef = Number.isInteger(legacyLocalCustomerId) && legacyLocalCustomerId > 0
    ? `local:customer:${legacyLocalCustomerId}`
    : null;

  const candidates = buildReferenceCandidates(
    payload.customerServerId,
    payload.customerClientRefId,
    legacyClientRef,
    payload.customerId
  );

  return resolveFirstReference({
    resolver: resolveCustomerReference,
    userId,
    candidates,
  });
};

const resolveProductReferenceFromPayload = async ({ userId, payload = {} }) => {
  const legacyLocalProductId = Number(payload.productId);
  const legacyClientRef = Number.isInteger(legacyLocalProductId) && legacyLocalProductId > 0
    ? `local:product:${legacyLocalProductId}`
    : null;

  const candidates = buildReferenceCandidates(
    payload.productServerId,
    payload.productClientRefId,
    legacyClientRef,
    payload.productId
  );

  return resolveFirstReference({
    resolver: resolveProductReference,
    userId,
    candidates,
  });
};

const resolveCustomerReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(Customer, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolveProductReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(Product, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const applyProductChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(Product, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeProduct(existing);
    await appendChange({
      userId,
      entityType: 'product',
      entityId: serialized.serverId,
      changeType: 'delete',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  const name = normalizeTrimmedString(payload.name);
  const price = parseMoney(payload.price);
  const quantity = parseNonNegativeInt(payload.quantity);
  const lowStockThreshold = parseNonNegativeInt(payload.lowStockThreshold ?? payload.reorderLevel ?? 5);

  if (!name || price === null || quantity === null || lowStockThreshold === null) {
    return asSyncError('rejected_validation', 'Invalid product payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeProduct(existing);
      return asSyncError('conflict_requires_client_resolution', 'Product version conflict.', latest);
    }

    existing.name = name;
    existing.price = price;
    existing.quantityOnHand = quantity;
    existing.reorderLevel = lowStockThreshold;
    existing.expiryDate = parseOptionalDate(payload.expiryDate);
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeProduct(existing);
    await appendChange({
      userId,
      entityType: 'product',
      entityId: serialized.serverId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  const created = await Product.create({
    userId,
    clientRefId: changeId || null,
    name,
    price,
    quantityOnHand: quantity,
    reorderLevel: lowStockThreshold,
    expiryDate: parseOptionalDate(payload.expiryDate),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeProduct(created);
  await appendChange({
    userId,
    entityType: 'product',
    entityId: serialized.serverId,
    changeType: 'upsert',
    payload: serialized,
    version: serialized.version,
  });

  return {
    status: 'applied',
    serverVersion: serialized.version,
    serverId: serialized.serverId,
  };
};

const applyCustomerChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(Customer, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    const due = await computeDue({ userId, customerId: existing._id });
    if (due > 0) {
      return asSyncError('rejected_business_rule', 'Customer has outstanding due and cannot be deleted.');
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeCustomer(existing);
    await appendChange({
      userId,
      entityType: 'customer',
      entityId: serialized.serverId,
      changeType: 'delete',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  const name = normalizeTrimmedString(payload.name);
  const creditLimit = payload.creditLimit === undefined ? 0 : parseMoney(payload.creditLimit);

  if (!name || creditLimit === null) {
    return asSyncError('rejected_validation', 'Invalid customer payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeCustomer(existing);
      return asSyncError('conflict_requires_client_resolution', 'Customer version conflict.', latest);
    }

    existing.name = name;
    existing.phone = normalizeTrimmedString(payload.phone) || null;
    existing.address = normalizeTrimmedString(payload.address) || null;
    existing.creditLimit = creditLimit;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeCustomer(existing);
    await appendChange({
      userId,
      entityType: 'customer',
      entityId: serialized.serverId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  const created = await Customer.create({
    userId,
    clientRefId: changeId || null,
    name,
    phone: normalizeTrimmedString(payload.phone) || null,
    address: normalizeTrimmedString(payload.address) || null,
    creditLimit,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeCustomer(created);
  await appendChange({
    userId,
    entityType: 'customer',
    entityId: serialized.serverId,
    changeType: 'upsert',
    payload: serialized,
    version: serialized.version,
  });

  return {
    status: 'applied',
    serverVersion: serialized.version,
    serverId: serialized.serverId,
  };
};

const applyBakiEntryChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(BakiEntry, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeBakiEntry(existing);
    await appendChange({
      userId,
      entityType: 'baki_entry',
      entityId: serialized.serverId,
      changeType: 'delete',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  if (existing) {
    // Immutable accounting rows are replay-safe: duplicate upserts are treated as already applied.
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const customer = await resolveCustomerReferenceFromPayload({ userId, payload });
  if (!customer) {
    return asSyncError('rejected_business_rule', 'Referenced customer was not found for baki entry.');
  }

  const type = normalizeTrimmedString(payload.type).toLowerCase();
  const amount = parseMoney(payload.amount);
  if (!['credit', 'payment'].includes(type) || amount === null || amount <= 0) {
    return asSyncError('rejected_validation', 'Invalid baki_entry payload.');
  }

  const currentDue = await computeDue({ userId, customerId: customer._id });
  if (type === 'payment') {
    if (currentDue <= 0) {
      return asSyncError('rejected_business_rule', 'No outstanding due for payment entry.');
    }

    if (amount > currentDue) {
      return asSyncError('rejected_business_rule', 'Overpayment is not allowed.');
    }
  }

  const runningDue = type === 'credit' ? currentDue + amount : Math.max(0, currentDue - amount);

  if (!changeId) {
    return asSyncError('rejected_validation', 'baki_entry upsert requires a stable id.');
  }

  const upsertFilter = { userId, clientRefId: changeId };
  const upsertResult = await BakiEntry.updateOne(
    upsertFilter,
    {
      $setOnInsert: {
        userId,
        clientRefId: changeId,
        customerId: customer._id,
        customerClientRefId: customer.clientRefId || null,
        type,
        amount,
        runningDue,
        paymentMethod: type === 'payment' ? normalizeTrimmedString(payload.paymentMethod) || 'cash' : null,
        note: normalizeTrimmedString(payload.note) || null,
        occurredAt: parseOptionalDate(payload.occurredAt) || new Date(),
        serverVersion: 1,
        version: 1,
        lastClientMutationAt: clientMutationAt,
      },
    },
    { upsert: true }
  );

  const created = await BakiEntry.findOne(upsertFilter);
  if (!created) {
    return asSyncError('rejected_business_rule', 'Unable to persist baki entry on server.');
  }

  if (!upsertResult?.upsertedCount) {
    return {
      status: 'applied',
      serverVersion: Number(created.serverVersion || created.version || 1),
      serverId: String(created._id),
    };
  }

  console.info('[SYNC][BAKI][UPSERT]', {
    userId,
    clientRefId: changeId,
    serverId: String(created._id),
    type,
    amount,
  });

  const serialized = serializeBakiEntry(created);
  await appendChange({
    userId,
    entityType: 'baki_entry',
    entityId: serialized.serverId,
    changeType: 'upsert',
    payload: serialized,
    version: serialized.version,
  });

  return {
    status: 'applied',
    serverVersion: serialized.version,
    serverId: serialized.serverId,
  };
};

const normalizeMovementType = (value) => {
  const type = normalizeTrimmedString(value).toLowerCase();
  if (type === 'in' || type === 'stock_in') {
    return 'stock_in';
  }

  if (type === 'out' || type === 'stock_out') {
    return 'stock_out';
  }

  if (type === 'adjust' || type === 'adjustment') {
    return 'adjustment';
  }

  if (type === 'expiry' || type === 'expiry_removal') {
    return 'expiry_removal';
  }

  return '';
};

const applyInventoryMovementChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(InventoryMovement, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    return asSyncError(
      'rejected_business_rule',
      'Inventory movement deletion is not supported to preserve stock ledger integrity.'
    );
  }

  if (existing) {
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const product = await resolveProductReferenceFromPayload({ userId, payload });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for movement.');
  }

  const movementType = normalizeMovementType(payload.movementType);
  if (!movementType) {
    return asSyncError('rejected_validation', 'Invalid movementType for inventory_movement.');
  }

  const quantityBefore = Number(product.quantityOnHand || 0);
  let quantityDelta = Number(payload.quantityDelta);

  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    const quantity = parsePositiveInt(payload.quantity);
    if (!quantity) {
      return asSyncError('rejected_validation', 'quantity or quantityDelta is required for movement.');
    }

    if (movementType === 'stock_out' || movementType === 'expiry_removal') {
      quantityDelta = -quantity;
    } else {
      quantityDelta = quantity;
    }
  }

  if (movementType === 'adjustment') {
    const targetQuantity = parseNonNegativeInt(payload.targetQuantity ?? payload.quantityAfter);
    if (targetQuantity === null) {
      return asSyncError('rejected_validation', 'targetQuantity is required for adjustment movement.');
    }

    quantityDelta = targetQuantity - quantityBefore;
  }

  const quantityAfter = quantityBefore + quantityDelta;
  if (quantityAfter < 0) {
    return asSyncError('rejected_business_rule', 'Insufficient stock for this movement.');
  }

  product.quantityOnHand = quantityAfter;
  product.serverVersion = Number(product.serverVersion || product.version || 1) + 1;
  product.version = Number(product.version || 1) + 1;
  product.lastClientMutationAt = clientMutationAt;
  await product.save();

  const created = await InventoryMovement.create({
    userId,
    clientRefId: changeId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    movementType,
    quantityDelta,
    quantityBefore,
    quantityAfter,
    reason: normalizeTrimmedString(payload.reason) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseOptionalDate(payload.occurredAt) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serializedMovement = serializeMovement(created);
  const serializedProduct = serializeProduct(product);

  await appendChange({
    userId,
    entityType: 'inventory_movement',
    entityId: serializedMovement.serverId,
    changeType: 'upsert',
    payload: serializedMovement,
    version: serializedMovement.version,
  });

  await appendChange({
    userId,
    entityType: 'product',
    entityId: serializedProduct.serverId,
    changeType: 'upsert',
    payload: serializedProduct,
    version: serializedProduct.version,
  });

  return {
    status: 'applied',
    serverVersion: serializedMovement.version,
    serverId: serializedMovement.serverId,
  };
};

const applyTransactionChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(Transaction, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    existing.deletedAt = new Date();
    existing.status = 'voided';
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeTransaction(existing);
    await appendChange({
      userId,
      entityType: 'transaction',
      entityId: serialized.serverId,
      changeType: 'delete',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  if (existing) {
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const transactionType = normalizeTrimmedString(payload.transactionType).toLowerCase();
  const amount = parseMoney(payload.amount);
  if (!['sale', 'purchase', 'expense', 'income', 'credit_issue', 'credit_payment'].includes(transactionType) || amount === null || amount <= 0) {
    return asSyncError('rejected_validation', 'Invalid transaction payload.');
  }

  let customer = null;
  const customerRefCandidates = buildReferenceCandidates(
    payload.customerServerId,
    payload.customerClientRefId,
    payload.customerId
  );
  if (customerRefCandidates.length > 0) {
    customer = await resolveFirstReference({
      resolver: resolveCustomerReference,
      userId,
      candidates: customerRefCandidates,
    });
    if (!customer) {
      return asSyncError('rejected_business_rule', 'Referenced customer was not found for transaction.');
    }
  }

  const created = await Transaction.create({
    userId,
    clientRefId: changeId || null,
    transactionType,
    amount,
    currency: normalizeTrimmedString(payload.currency || 'BDT').toUpperCase(),
    customerId: customer ? customer._id : null,
    customerClientRefId: customer ? customer.clientRefId || null : null,
    referenceType: normalizeTrimmedString(payload.referenceType) || null,
    referenceId: normalizeTrimmedString(payload.referenceId) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseOptionalDate(payload.occurredAt) || new Date(),
    status: 'posted',
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeTransaction(created);
  await appendChange({
    userId,
    entityType: 'transaction',
    entityId: serialized.serverId,
    changeType: 'upsert',
    payload: serialized,
    version: serialized.version,
  });

  return {
    status: 'applied',
    serverVersion: serialized.version,
    serverId: serialized.serverId,
  };
};

const applyChange = async ({ userId, change }) => {
  const entity = normalizeEntity(change?.entity);

  if (entity === 'product') {
    return applyProductChange({ userId, change });
  }

  if (entity === 'customer') {
    return applyCustomerChange({ userId, change });
  }

  if (entity === 'baki_entry' || entity === 'baki' || entity === 'baki_transaction') {
    return applyBakiEntryChange({ userId, change });
  }

  if (entity === 'inventory_movement' || entity === 'stock_movement') {
    return applyInventoryMovementChange({ userId, change });
  }

  if (entity === 'transaction') {
    return applyTransactionChange({ userId, change });
  }

  return asSyncError('rejected_validation', `Unsupported entity: ${entity || 'unknown'}.`);
};

const applyChangeWithIdempotency = async ({ userId, change }) => {
  const entity = normalizeEntity(change?.entity);
  const type = normalizeType(change?.type || 'upsert');
  const idempotencyKey = parseRequiredIdempotencyKey(change);

  if (!idempotencyKey) {
    return asSyncError('rejected_validation', 'idempotencyKey is required and must be <= 128 characters.');
  }

  const routeKey = buildRouteKey({ entity, type });
  const payloadHash = buildPayloadHash(change || {});

  const existing = await findRecord({ userId, key: idempotencyKey, routeKey });
  if (existing) {
    ensureNotConflictingReplay({ existing, payloadHash });
    const replay = existing.responseBody || {};
    return {
      ...replay,
      status: replay.status === 'applied' ? 'duplicate_applied' : replay.status,
    };
  }

  const result = await applyChange({ userId, change });

  await writeRecord({
    userId,
    key: idempotencyKey,
    routeKey,
    payloadHash,
    statusCode: 200,
    responseBody: result,
  });

  return result;
};

const buildServerChanges = async ({ userId, lastSyncAt, limit }) => {
  const sinceDate = lastSyncAt ? parseIsoDate(lastSyncAt) : null;
  const updatedFilter = sinceDate ? { updatedAt: { $gt: sinceDate } } : {};

  const [products, customers, bakiEntries, movements, transactions] = await Promise.all([
    Product.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Customer.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    BakiEntry.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    InventoryMovement.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Transaction.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
  ]);

  const all = [];

  for (const row of products) {
    const serialized = serializeProduct(row);
    all.push({
      entity: 'product',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of customers) {
    const serialized = serializeCustomer(row);
    all.push({
      entity: 'customer',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of bakiEntries) {
    const serialized = serializeBakiEntry(row);
    all.push({
      entity: 'baki_entry',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of movements) {
    const serialized = serializeMovement(row);
    all.push({
      entity: 'inventory_movement',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of transactions) {
    const serialized = serializeTransaction(row);
    all.push({
      entity: 'transaction',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  all.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  return {
    hasMore: all.length > limit,
    items: all.slice(0, limit),
  };
};

const syncUnified = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    throw badRequest('Authenticated user context is required.');
  }

  const clientId = normalizeTrimmedString(req.body?.clientId) || null;
  const lastSyncAt = normalizeTrimmedString(req.body?.lastSyncAt) || null;
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];

  if (changes.length > MAX_CHANGES_PER_BATCH) {
    throw badRequest(`changes length exceeds max batch size of ${MAX_CHANGES_PER_BATCH}.`);
  }

  if (lastSyncAt && !parseIsoDate(lastSyncAt)) {
    throw badRequest('lastSyncAt must be a valid ISO date.');
  }

  const changeEntitySummary = changes.reduce((summary, row) => {
    const entity = normalizeEntity(row?.entity) || 'unknown';
    summary[entity] = (summary[entity] || 0) + 1;
    return summary;
  }, {});

  console.info('[SYNC][REQUEST]', {
    userId,
    clientId,
    lastSyncAt,
    changesCount: changes.length,
    changeEntitySummary,
  });

  const ack = [];

  for (const change of changes) {
    const id = normalizeTrimmedString(change?.id) || null;
    const entity = normalizeEntity(change?.entity);

    try {
      const result = await applyChangeWithIdempotency({ userId, change });
      ack.push({
        id,
        entity,
        status: result.status || 'applied',
        serverVersion: result.serverVersion || null,
        serverId: result.serverId || null,
        conflict: result.conflict || null,
        message: result.message || null,
      });

      if (entity === 'baki_entry' || entity === 'baki' || entity === 'baki_transaction' || result.status !== 'applied') {
        console.info('[SYNC][ACK]', {
          userId,
          entity,
          id,
          status: result.status,
          serverId: result.serverId || null,
          serverVersion: result.serverVersion || null,
          message: result.message || null,
        });
      }
    } catch (error) {
      if (error?.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD') {
        ack.push({
          id,
          entity,
          status: 'rejected_validation',
          serverVersion: null,
          serverId: null,
          conflict: null,
          message: 'Idempotency key was reused with a different payload.',
        });
        continue;
      }

      if (entity === 'product' && isMongoDuplicateKeyError(error)) {
        ack.push({
          id,
          entity,
          status: 'rejected_validation',
          serverVersion: null,
          serverId: null,
          conflict: null,
          message: 'Product SKU must be unique per user when provided.',
        });

        console.warn('[SYNC][ACK][PRODUCT_DUPLICATE_KEY]', {
          userId,
          id,
          code: error?.code,
          message: error?.message || null,
        });
        continue;
      }

      throw error;
    }
  }

  const requestedLimit = Number(req.body?.maxServerChanges || MAX_SERVER_CHANGES);
  const serverLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_SERVER_CHANGES)
    : MAX_SERVER_CHANGES;

  const serverDelta = await buildServerChanges({
    userId,
    lastSyncAt,
    limit: serverLimit,
  });

  const serverTime = nowIso();

  console.info('[SYNC][RESPONSE]', {
    userId,
    clientId,
    ackCount: ack.length,
    serverChangesCount: serverDelta.items.length,
    hasMoreServerChanges: serverDelta.hasMore,
    serverTime,
  });

  return success(req, res, {
    clientId,
    ack,
    serverChanges: serverDelta.items,
    serverTime,
    nextSyncAt: serverTime,
    hasMoreServerChanges: serverDelta.hasMore,
  });
});

module.exports = {
  syncUnified,
};
