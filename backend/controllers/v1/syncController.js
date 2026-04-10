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
const { appendChange, getChangesAfterCursor } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest } = require('../../services/v1/httpError');
const {
  buildPayloadHash,
  findRecord,
  ensureNotConflictingReplay,
  writeRecord,
} = require('../../services/v1/idempotencyService');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');

const serializeProduct = (doc) => ({
  productId: String(doc._id),
  name: doc.name,
  sku: doc.sku || null,
  unit: doc.unit || 'pcs',
  price: Number(doc.price || 0),
  quantityOnHand: Number(doc.quantityOnHand || 0),
  reorderLevel: Number(doc.reorderLevel || 0),
  expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString() : null,
  version: Number(doc.version || 1),
  isArchived: Boolean(doc.isArchived),
  updatedAt: doc.updatedAt,
});

const serializeCustomer = (doc) => ({
  customerId: String(doc._id),
  name: doc.name,
  phone: doc.phone || null,
  address: doc.address || null,
  creditLimit: Number(doc.creditLimit || 0),
  isArchived: Boolean(doc.isArchived),
  version: Number(doc.version || 1),
  updatedAt: doc.updatedAt,
});

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

const applyProductOperation = async ({ userId, operationType, payload = {} }) => {
  if (operationType === 'create') {
    const name = normalizeTrimmedString(payload.name);
    const price = parseMoney(payload.price);
    const quantityOnHand = parseNonNegativeInt(payload.quantityOnHand ?? 0);
    const reorderLevel = parseNonNegativeInt(payload.reorderLevel ?? 5);
    if (!name || price === null || quantityOnHand === null || reorderLevel === null) {
      return { status: 'rejected_validation', message: 'Invalid product create payload.' };
    }

    const doc = await Product.create({
      userId,
      name,
      sku: normalizeTrimmedString(payload.sku) || null,
      unit: normalizeTrimmedString(payload.unit) || 'pcs',
      price,
      quantityOnHand,
      reorderLevel,
      expiryDate: payload.expiryDate ? parseIsoDate(payload.expiryDate) : null,
    });

    const serialized = serializeProduct(doc);
    await appendChange({ userId, entityType: 'product', entityId: serialized.productId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'product', entityId: serialized.productId, action: 'sync_create', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.productId, version: serialized.version };
  }

  if (operationType === 'update') {
    const productId = normalizeTrimmedString(payload.productId);
    const expectedVersion = Number(payload.expectedVersion || 0);
    if (!productId || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      return { status: 'rejected_validation', message: 'productId and expectedVersion are required.' };
    }

    const update = {};
    if (payload.name !== undefined) {
      const value = normalizeTrimmedString(payload.name);
      if (!value) {
        return { status: 'rejected_validation', message: 'Invalid product name.' };
      }
      update.name = value;
    }
    if (payload.price !== undefined) {
      const price = parseMoney(payload.price);
      if (price === null) {
        return { status: 'rejected_validation', message: 'Invalid product price.' };
      }
      update.price = price;
    }
    if (payload.quantityOnHand !== undefined) {
      const qty = parseNonNegativeInt(payload.quantityOnHand);
      if (qty === null) {
        return { status: 'rejected_validation', message: 'Invalid quantityOnHand.' };
      }
      update.quantityOnHand = qty;
    }
    if (payload.reorderLevel !== undefined) {
      const level = parseNonNegativeInt(payload.reorderLevel);
      if (level === null) {
        return { status: 'rejected_validation', message: 'Invalid reorderLevel.' };
      }
      update.reorderLevel = level;
    }

    const doc = await Product.findOneAndUpdate(
      { _id: productId, userId, isArchived: false, version: expectedVersion },
      { $set: update, $inc: { version: 1 } },
      { new: true }
    );

    if (!doc) {
      return { status: 'conflict_requires_client_resolution', message: 'Version conflict or product missing.' };
    }

    const serialized = serializeProduct(doc);
    await appendChange({ userId, entityType: 'product', entityId: serialized.productId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'product', entityId: serialized.productId, action: 'sync_update', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.productId, version: serialized.version };
  }

  if (operationType === 'delete') {
    const productId = normalizeTrimmedString(payload.productId);
    if (!productId) {
      return { status: 'rejected_validation', message: 'productId is required.' };
    }

    const doc = await Product.findOneAndUpdate(
      { _id: productId, userId, isArchived: false },
      { $set: { isArchived: true }, $inc: { version: 1 } },
      { new: true }
    );

    if (!doc) {
      return { status: 'rejected_business_rule', message: 'Product not found.' };
    }

    const serialized = serializeProduct(doc);
    await appendChange({ userId, entityType: 'product', entityId: serialized.productId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'product', entityId: serialized.productId, action: 'sync_delete', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.productId, version: serialized.version };
  }

  return { status: 'rejected_validation', message: 'Unsupported product operationType.' };
};

const applyCustomerOperation = async ({ userId, operationType, payload = {} }) => {
  if (operationType === 'create') {
    const name = normalizeTrimmedString(payload.name);
    if (!name) {
      return { status: 'rejected_validation', message: 'name is required.' };
    }

    const creditLimit = payload.creditLimit === undefined ? 0 : parseMoney(payload.creditLimit);
    if (creditLimit === null) {
      return { status: 'rejected_validation', message: 'Invalid creditLimit.' };
    }

    const doc = await Customer.create({
      userId,
      name,
      phone: normalizeTrimmedString(payload.phone) || null,
      address: normalizeTrimmedString(payload.address) || null,
      creditLimit,
    });

    const serialized = serializeCustomer(doc);
    await appendChange({ userId, entityType: 'customer', entityId: serialized.customerId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'customer', entityId: serialized.customerId, action: 'sync_create', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.customerId, version: serialized.version };
  }

  if (operationType === 'update') {
    const customerId = normalizeTrimmedString(payload.customerId);
    const expectedVersion = Number(payload.expectedVersion || 0);
    if (!customerId || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      return { status: 'rejected_validation', message: 'customerId and expectedVersion are required.' };
    }

    const patch = {};
    if (payload.name !== undefined) {
      const value = normalizeTrimmedString(payload.name);
      if (!value) {
        return { status: 'rejected_validation', message: 'Invalid customer name.' };
      }
      patch.name = value;
    }
    if (payload.phone !== undefined) {
      patch.phone = normalizeTrimmedString(payload.phone) || null;
    }
    if (payload.address !== undefined) {
      patch.address = normalizeTrimmedString(payload.address) || null;
    }
    if (payload.creditLimit !== undefined) {
      const limit = parseMoney(payload.creditLimit);
      if (limit === null) {
        return { status: 'rejected_validation', message: 'Invalid creditLimit.' };
      }
      patch.creditLimit = limit;
    }

    const doc = await Customer.findOneAndUpdate(
      { _id: customerId, userId, isArchived: false, version: expectedVersion },
      { $set: patch, $inc: { version: 1 } },
      { new: true }
    );

    if (!doc) {
      return { status: 'conflict_requires_client_resolution', message: 'Version conflict or customer missing.' };
    }

    const serialized = serializeCustomer(doc);
    await appendChange({ userId, entityType: 'customer', entityId: serialized.customerId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'customer', entityId: serialized.customerId, action: 'sync_update', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.customerId, version: serialized.version };
  }

  if (operationType === 'delete') {
    const customerId = normalizeTrimmedString(payload.customerId);
    if (!customerId) {
      return { status: 'rejected_validation', message: 'customerId is required.' };
    }

    const due = await computeDue({ userId, customerId });
    if (due > 0) {
      return { status: 'rejected_business_rule', message: 'Customer has outstanding due.' };
    }

    const doc = await Customer.findOneAndUpdate(
      { _id: customerId, userId, isArchived: false },
      { $set: { isArchived: true }, $inc: { version: 1 } },
      { new: true }
    );

    if (!doc) {
      return { status: 'rejected_business_rule', message: 'Customer not found.' };
    }

    const serialized = serializeCustomer(doc);
    await appendChange({ userId, entityType: 'customer', entityId: serialized.customerId, payload: serialized, version: serialized.version });
    await logAudit({ userId, entityType: 'customer', entityId: serialized.customerId, action: 'sync_delete', metadata: serialized, source: 'sync' });

    return { status: 'applied', entityId: serialized.customerId, version: serialized.version };
  }

  return { status: 'rejected_validation', message: 'Unsupported customer operationType.' };
};

const applyBakiOperation = async ({ userId, operationType, payload = {} }) => {
  if (operationType !== 'create') {
    return { status: 'rejected_validation', message: 'Only create is supported for baki_entry.' };
  }

  const customerId = normalizeTrimmedString(payload.customerId);
  const type = normalizeTrimmedString(payload.type).toLowerCase();
  const amount = parseMoney(payload.amount);

  if (!customerId || !['credit', 'payment'].includes(type) || amount === null || amount <= 0) {
    return { status: 'rejected_validation', message: 'Invalid baki_entry payload.' };
  }

  const customer = await Customer.findOne({ _id: customerId, userId, isArchived: false });
  if (!customer) {
    return { status: 'rejected_business_rule', message: 'Customer not found.' };
  }

  const currentDue = await computeDue({ userId, customerId });
  if (type === 'payment') {
    if (currentDue <= 0) {
      return { status: 'rejected_business_rule', message: 'No outstanding due.' };
    }
    if (amount > currentDue) {
      return { status: 'rejected_business_rule', message: 'Overpayment not allowed.' };
    }
  }

  const runningDue = type === 'credit' ? currentDue + amount : Math.max(0, currentDue - amount);

  const doc = await BakiEntry.create({
    userId,
    customerId,
    type,
    amount,
    runningDue,
    paymentMethod: type === 'payment' ? normalizeTrimmedString(payload.paymentMethod) || 'cash' : null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseIsoDate(payload.occurredAt) || new Date(),
  });

  const entityId = String(doc._id);
  const serialized = {
    ledgerEntryId: entityId,
    type,
    customerId,
    amount,
    runningDue,
    occurredAt: new Date(doc.occurredAt).toISOString(),
  };

  await appendChange({ userId, entityType: 'baki_entry', entityId, payload: serialized, version: 1 });
  await logAudit({ userId, entityType: 'baki_entry', entityId, action: `sync_${type}`, metadata: serialized, source: 'sync' });

  return { status: 'applied', entityId, version: 1 };
};

const applyMovementOperation = async ({ userId, operationType, payload = {} }) => {
  if (operationType !== 'create') {
    return { status: 'rejected_validation', message: 'Only create is supported for inventory_movement.' };
  }

  const productId = normalizeTrimmedString(payload.productId);
  const movementType = normalizeTrimmedString(payload.movementType).toLowerCase();
  const quantity = parsePositiveInt(payload.quantity);

  if (!productId || !['stock_in', 'stock_out', 'adjustment', 'expiry_removal'].includes(movementType) || !quantity) {
    return { status: 'rejected_validation', message: 'Invalid inventory_movement payload.' };
  }

  const product = await Product.findOne({ _id: productId, userId, isArchived: false });
  if (!product) {
    return { status: 'rejected_business_rule', message: 'Product not found.' };
  }

  const before = Number(product.quantityOnHand || 0);
  let delta = quantity;
  if (movementType === 'stock_out' || movementType === 'expiry_removal') {
    delta = -quantity;
  }
  if (movementType === 'adjustment') {
    const target = parseNonNegativeInt(payload.targetQuantity);
    if (target === null) {
      return { status: 'rejected_validation', message: 'Invalid targetQuantity.' };
    }
    delta = target - before;
  }

  const after = before + delta;
  if (after < 0) {
    return { status: 'rejected_business_rule', message: 'Insufficient stock.' };
  }

  product.quantityOnHand = after;
  product.version += 1;
  await product.save();

  const doc = await InventoryMovement.create({
    userId,
    productId,
    movementType,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
    reason: normalizeTrimmedString(payload.reason) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseIsoDate(payload.occurredAt) || new Date(),
  });

  const entityId = String(doc._id);
  const serialized = {
    movementId: entityId,
    productId,
    movementType,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
  };

  await appendChange({ userId, entityType: 'inventory_movement', entityId, payload: serialized, version: 1 });
  await appendChange({ userId, entityType: 'product', entityId: productId, payload: serializeProduct(product), version: Number(product.version || 1) });
  await logAudit({ userId, entityType: 'inventory_movement', entityId, action: 'sync_create', metadata: serialized, source: 'sync' });

  return { status: 'applied', entityId, version: 1 };
};

const applyTransactionOperation = async ({ userId, operationType, payload = {} }) => {
  if (operationType !== 'create') {
    return { status: 'rejected_validation', message: 'Only create is supported for transaction.' };
  }

  const transactionType = normalizeTrimmedString(payload.transactionType).toLowerCase();
  const amount = parseMoney(payload.amount);
  if (!['sale', 'purchase', 'expense', 'income', 'credit_issue', 'credit_payment'].includes(transactionType) || amount === null || amount <= 0) {
    return { status: 'rejected_validation', message: 'Invalid transaction payload.' };
  }

  const customerId = normalizeTrimmedString(payload.customerId) || null;
  if (customerId) {
    const customer = await Customer.findOne({ _id: customerId, userId, isArchived: false });
    if (!customer) {
      return { status: 'rejected_business_rule', message: 'Customer not found.' };
    }
  }

  const doc = await Transaction.create({
    userId,
    transactionType,
    amount,
    currency: normalizeTrimmedString(payload.currency || 'BDT').toUpperCase(),
    customerId,
    referenceType: normalizeTrimmedString(payload.referenceType) || null,
    referenceId: normalizeTrimmedString(payload.referenceId) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseIsoDate(payload.occurredAt) || new Date(),
    status: 'posted',
  });

  const entityId = String(doc._id);
  const serialized = {
    transactionId: entityId,
    transactionType,
    amount,
    occurredAt: new Date(doc.occurredAt).toISOString(),
    status: doc.status,
  };

  await appendChange({ userId, entityType: 'transaction', entityId, payload: serialized, version: 1 });
  await logAudit({ userId, entityType: 'transaction', entityId, action: 'sync_create', metadata: serialized, source: 'sync' });

  return { status: 'applied', entityId, version: 1 };
};

const applyOperation = async ({ userId, operation = {} }) => {
  const entityType = normalizeTrimmedString(operation.entityType).toLowerCase();
  const operationType = normalizeTrimmedString(operation.operationType).toLowerCase();
  const payload = operation.payload || {};

  if (entityType === 'product') {
    return applyProductOperation({ userId, operationType, payload });
  }

  if (entityType === 'customer') {
    return applyCustomerOperation({ userId, operationType, payload });
  }

  if (entityType === 'baki_entry') {
    return applyBakiOperation({ userId, operationType, payload });
  }

  if (entityType === 'inventory_movement') {
    return applyMovementOperation({ userId, operationType, payload });
  }

  if (entityType === 'transaction') {
    return applyTransactionOperation({ userId, operationType, payload });
  }

  return {
    status: 'rejected_validation',
    message: `Unsupported entityType: ${entityType}`,
  };
};

const IDEMPOTENCY_KEY_PATTERN = /^hsb_[A-Za-z0-9-]+_[a-z_]+_[a-z_]+_[A-Za-z0-9-]+$/;

const validateOperationIdempotencyKey = (key) => {
  if (!key) {
    return 'idempotencyKey is required for every sync operation.';
  }

  if (key.length > 128) {
    return 'idempotencyKey must be 128 characters or fewer.';
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return 'idempotencyKey format is invalid.';
  }

  return null;
};

const buildSyncRouteKey = ({ entityType, operationType }) => {
  return `SYNC_PUSH:${entityType}:${operationType}`;
};

const applyOperationWithIdempotency = async ({ userId, operation }) => {
  const entityType = normalizeTrimmedString(operation?.entityType).toLowerCase();
  const operationType = normalizeTrimmedString(operation?.operationType).toLowerCase();
  const payload = operation?.payload || {};
  const key = normalizeTrimmedString(operation?.idempotencyKey);

  const keyValidationError = validateOperationIdempotencyKey(key);
  if (keyValidationError) {
    return {
      status: 'rejected_validation',
      message: keyValidationError,
    };
  }

  const routeKey = buildSyncRouteKey({ entityType, operationType });
  const payloadHash = buildPayloadHash(payload);

  const existing = await findRecord({ userId, key, routeKey });
  if (existing) {
    ensureNotConflictingReplay({ existing, payloadHash });
    const existingResult = existing.responseBody || {};
    return {
      ...existingResult,
      status: existingResult.status === 'applied' ? 'duplicate_applied' : existingResult.status,
    };
  }

  const result = await applyOperation({ userId, operation });

  await writeRecord({
    userId,
    key,
    routeKey,
    payloadHash,
    statusCode: 200,
    responseBody: result,
  });

  return result;
};

const pushSync = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
  if (!operations.length) {
    throw badRequest('operations[] is required and cannot be empty.');
  }

  const results = [];

  for (const op of operations) {
    const operationId = normalizeTrimmedString(op.operationId) || null;
    let result;

    try {
      result = await applyOperationWithIdempotency({ userId, operation: op });
    } catch (error) {
      if (error?.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD') {
        result = {
          status: 'rejected_validation',
          message: 'Idempotency key was reused with a different payload.',
        };
      } else {
        throw error;
      }
    }

    results.push({
      operationId,
      status: result.status,
      serverEntityId: result.entityId || null,
      serverVersion: result.version || null,
      message: result.message || null,
    });
  }

  return success(req, res, {
    batchId: normalizeTrimmedString(req.body?.batchId) || null,
    results,
  });
});

const pullSync = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const cursor = normalizeTrimmedString(req.body?.cursor) || null;
  const entityTypes = Array.isArray(req.body?.entityTypes)
    ? req.body.entityTypes.map((value) => normalizeTrimmedString(value).toLowerCase()).filter(Boolean)
    : [];
  const maxItemsRaw = Number(req.body?.maxItems || 500);
  const maxItems = Number.isInteger(maxItemsRaw) && maxItemsRaw > 0 ? Math.min(maxItemsRaw, 1000) : 500;

  const result = await getChangesAfterCursor({
    userId,
    cursor,
    entityTypes,
    limit: maxItems,
  });

  const changes = (result.items || []).map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    changeType: row.changeType,
    version: Number(row.version || 1),
    updatedAt: row.createdAt,
    payload: row.payload,
  }));

  return success(req, res, {
    changes,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
});

const ackConflicts = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const conflictResolutions = Array.isArray(req.body?.conflicts) ? req.body.conflicts : [];

  await logAudit({
    userId,
    entityType: 'sync_conflict',
    entityId: null,
    action: 'ack',
    metadata: { total: conflictResolutions.length },
    source: 'sync',
  });

  return success(req, res, {
    acknowledged: conflictResolutions.length,
  });
});

module.exports = {
  pushSync,
  pullSync,
  ackConflicts,
};
