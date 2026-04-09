const Product = require('../../models/Product');
const InventoryMovement = require('../../models/InventoryMovement');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parsePositiveInt,
  parseIsoDate,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, unprocessable } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, parsePagination } = require('./controllerUtils');

const MOVEMENT_TYPES = new Set(['stock_in', 'stock_out', 'adjustment', 'expiry_removal']);

const serializeMovement = (doc) => ({
  movementId: String(doc._id),
  productId: String(doc.productId),
  movementType: doc.movementType,
  quantityDelta: Number(doc.quantityDelta || 0),
  quantityBefore: Number(doc.quantityBefore || 0),
  quantityAfter: Number(doc.quantityAfter || 0),
  reason: doc.reason || null,
  note: doc.note || null,
  occurredAt: new Date(doc.occurredAt).toISOString(),
  createdAt: new Date(doc.createdAt || doc.occurredAt).toISOString(),
});

const createMovement = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const productId = normalizeTrimmedString(req.body.productId);
  const movementType = normalizeTrimmedString(req.body.movementType).toLowerCase();
  const quantity = parsePositiveInt(req.body.quantity);
  const reason = normalizeTrimmedString(req.body.reason) || null;
  const note = normalizeTrimmedString(req.body.note) || null;
  const occurredAt = parseIsoDate(req.body.occurredAt) || new Date();

  if (!productId) {
    throw badRequest('productId is required.', [{ field: 'productId', reason: 'required' }]);
  }
  if (!MOVEMENT_TYPES.has(movementType)) {
    throw badRequest('movementType is invalid.', [{ field: 'movementType', reason: 'invalid' }]);
  }
  if (!quantity) {
    throw badRequest('quantity must be a positive integer.', [{ field: 'quantity', reason: 'invalid' }]);
  }

  const product = await Product.findOne({ _id: productId, userId, isArchived: false });
  if (!product) {
    throw notFound('Product not found.');
  }

  const before = Number(product.quantityOnHand || 0);
  let delta = quantity;

  if (movementType === 'stock_out' || movementType === 'expiry_removal') {
    delta = -quantity;
  }

  if (movementType === 'adjustment') {
    const target = Number(req.body.targetQuantity);
    if (!Number.isInteger(target) || target < 0) {
      throw badRequest('targetQuantity is required for adjustment and must be non-negative integer.');
    }
    delta = target - before;
  }

  const after = before + delta;

  if (after < 0) {
    throw unprocessable('Movement would result in negative stock.', 'INSUFFICIENT_STOCK');
  }

  product.quantityOnHand = after;
  product.version += 1;
  await product.save();

  const movement = await InventoryMovement.create({
    userId,
    productId: product._id,
    movementType,
    quantityDelta: delta,
    quantityBefore: before,
    quantityAfter: after,
    reason,
    note,
    occurredAt,
  });

  const serialized = serializeMovement(movement);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'inventory_movement',
      entityId: serialized.movementId,
      changeType: 'upsert',
      payload: serialized,
      version: 1,
      occurredAt: movement.updatedAt,
    }),
    appendChange({
      userId,
      entityType: 'product',
      entityId: String(product._id),
      changeType: 'upsert',
      payload: {
        productId: String(product._id),
        quantityOnHand: Number(product.quantityOnHand || 0),
        version: Number(product.version || 1),
      },
      version: Number(product.version || 1),
      occurredAt: product.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'inventory_movement',
      entityId: serialized.movementId,
      action: 'create',
      metadata: { after: serialized },
      occurredAt: movement.updatedAt,
    }),
  ]);

  return success(req, res, serialized, 201);
});

const listMovements = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { page, pageSize, skip, limit } = parsePagination(req, { defaultPageSize: 50 });

  const productId = normalizeTrimmedString(req.query.productId);
  const movementType = normalizeTrimmedString(req.query.movementType).toLowerCase();
  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);

  const query = {
    userId,
  };

  if (productId) {
    query.productId = productId;
  }

  if (movementType && MOVEMENT_TYPES.has(movementType)) {
    query.movementType = movementType;
  }

  if (from || to) {
    query.occurredAt = {};
    if (from) {
      query.occurredAt.$gte = from;
    }
    if (to) {
      query.occurredAt.$lte = to;
    }
  }

  const docs = await InventoryMovement.find(query)
    .sort({ occurredAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await InventoryMovement.countDocuments(query);

  return success(req, res, {
    items: docs.map(serializeMovement),
    page,
    pageSize,
    total,
    hasNext: skip + docs.length < total,
  });
});

module.exports = {
  createMovement,
  listMovements,
};
