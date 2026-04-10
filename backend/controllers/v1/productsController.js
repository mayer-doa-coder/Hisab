const Product = require('../../models/Product');
const { success } = require('../../utils/apiResponse');
const {
  normalizeTrimmedString,
  parseBoolean,
  parseMoney,
  parseNonNegativeInt,
  parseIsoDate,
} = require('../../utils/validation');
const { appendChange } = require('../../services/v1/changeLogService');
const { logAudit } = require('../../services/v1/auditService');
const { badRequest, notFound, conflict } = require('../../services/v1/httpError');
const { asyncHandler, getUserIdFromReq, parsePagination } = require('./controllerUtils');

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
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const parseCreatePayload = (body = {}) => {
  const name = normalizeTrimmedString(body.name);
  if (!name) {
    throw badRequest('name is required.', [{ field: 'name', reason: 'required' }]);
  }

  const price = parseMoney(body.price);
  if (price === null) {
    throw badRequest('price must be a non-negative number.', [{ field: 'price', reason: 'invalid' }]);
  }

  const quantityOnHand = parseNonNegativeInt(body.quantityOnHand ?? 0);
  if (quantityOnHand === null) {
    throw badRequest('quantityOnHand must be a non-negative integer.', [{ field: 'quantityOnHand', reason: 'invalid' }]);
  }

  const reorderLevel = parseNonNegativeInt(body.reorderLevel ?? 5);
  if (reorderLevel === null) {
    throw badRequest('reorderLevel must be a non-negative integer.', [{ field: 'reorderLevel', reason: 'invalid' }]);
  }

  const expiryDate = body.expiryDate ? parseIsoDate(body.expiryDate) : null;
  if (body.expiryDate && !expiryDate) {
    throw badRequest('expiryDate must be a valid ISO date.', [{ field: 'expiryDate', reason: 'invalid' }]);
  }

  return {
    name,
    sku: normalizeTrimmedString(body.sku) || null,
    unit: normalizeTrimmedString(body.unit) || 'pcs',
    price,
    quantityOnHand,
    reorderLevel,
    expiryDate,
  };
};

const parseUpdatePayload = (body = {}) => {
  const payload = {};

  if (body.name !== undefined) {
    const name = normalizeTrimmedString(body.name);
    if (!name) {
      throw badRequest('name cannot be empty.', [{ field: 'name', reason: 'invalid' }]);
    }
    payload.name = name;
  }

  if (body.sku !== undefined) {
    payload.sku = normalizeTrimmedString(body.sku) || null;
  }

  if (body.unit !== undefined) {
    payload.unit = normalizeTrimmedString(body.unit) || 'pcs';
  }

  if (body.price !== undefined) {
    const price = parseMoney(body.price);
    if (price === null) {
      throw badRequest('price must be a non-negative number.', [{ field: 'price', reason: 'invalid' }]);
    }
    payload.price = price;
  }

  if (body.quantityOnHand !== undefined) {
    const quantity = parseNonNegativeInt(body.quantityOnHand);
    if (quantity === null) {
      throw badRequest('quantityOnHand must be a non-negative integer.', [{ field: 'quantityOnHand', reason: 'invalid' }]);
    }
    payload.quantityOnHand = quantity;
  }

  if (body.reorderLevel !== undefined) {
    const reorderLevel = parseNonNegativeInt(body.reorderLevel);
    if (reorderLevel === null) {
      throw badRequest('reorderLevel must be a non-negative integer.', [{ field: 'reorderLevel', reason: 'invalid' }]);
    }
    payload.reorderLevel = reorderLevel;
  }

  if (body.expiryDate !== undefined) {
    if (body.expiryDate === null || body.expiryDate === '') {
      payload.expiryDate = null;
    } else {
      const expiryDate = parseIsoDate(body.expiryDate);
      if (!expiryDate) {
        throw badRequest('expiryDate must be a valid ISO date.', [{ field: 'expiryDate', reason: 'invalid' }]);
      }
      payload.expiryDate = expiryDate;
    }
  }

  if (!Object.keys(payload).length) {
    throw badRequest('At least one updatable field is required.');
  }

  return payload;
};

const createProduct = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const payload = parseCreatePayload(req.body);

  const created = await Product.create({
    userId,
    ...payload,
  }).catch((err) => {
    if (err?.code === 11000) {
      throw conflict('sku already exists for this user.', 'PRODUCT_SKU_ALREADY_EXISTS');
    }
    throw err;
  });

  const serialized = serializeProduct(created);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: created.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      action: 'create',
      metadata: { after: serialized },
      occurredAt: created.updatedAt,
    }),
  ]);

  return success(req, res, serialized, 201);
});

const listProducts = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const { page, pageSize, skip, limit } = parsePagination(req);

  const search = normalizeTrimmedString(req.query.search).toLowerCase();
  const lowStockOnly = parseBoolean(req.query.lowStockOnly, false);
  const expiringWithinDays = parseNonNegativeInt(req.query.expiringWithinDays);

  const query = {
    userId,
    isArchived: false,
  };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
    ];
  }

  if (lowStockOnly) {
    query.$expr = { $lte: ['$quantityOnHand', '$reorderLevel'] };
  }

  if (expiringWithinDays !== null) {
    const now = new Date();
    const max = new Date(now.getTime() + expiringWithinDays * 24 * 60 * 60 * 1000);
    query.expiryDate = {
      $gte: now,
      $lte: max,
    };
  }

  const docs = await Product.find(query).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).lean();

  const total = await Product.countDocuments(query);

  return success(req, res, {
    items: docs.map(serializeProduct),
    page,
    pageSize,
    total,
    hasNext: skip + docs.length < total,
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const product = await Product.findOne({ _id: req.params.productId, userId, isArchived: false }).lean();

  if (!product) {
    throw notFound('Product not found.');
  }

  return success(req, res, serializeProduct(product));
});

const updateProduct = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    throw badRequest('expectedVersion is required for updates.');
  }

  const updatePayload = parseUpdatePayload(req.body);

  const updated = await Product.findOneAndUpdate(
    {
      _id: req.params.productId,
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
  ).catch((err) => {
    if (err?.code === 11000) {
      throw conflict('sku already exists for this user.', 'PRODUCT_SKU_ALREADY_EXISTS');
    }
    throw err;
  });

  if (!updated) {
    throw conflict('Product version conflict or product not found.', 'VERSION_CONFLICT');
  }

  const serialized = serializeProduct(updated);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: updated.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      action: 'update',
      metadata: { patch: updatePayload, after: serialized },
      occurredAt: updated.updatedAt,
    }),
  ]);

  return success(req, res, serialized);
});

const deleteProduct = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req);

  const updated = await Product.findOneAndUpdate(
    {
      _id: req.params.productId,
      userId,
      isArchived: false,
    },
    {
      $set: { isArchived: true },
      $inc: { version: 1 },
    },
    {
      new: true,
    }
  );

  if (!updated) {
    throw notFound('Product not found.');
  }

  const serialized = serializeProduct(updated);

  await Promise.allSettled([
    appendChange({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      changeType: 'upsert',
      payload: serialized,
      version: serialized.version,
      occurredAt: updated.updatedAt,
    }),
    logAudit({
      userId,
      entityType: 'product',
      entityId: serialized.productId,
      action: 'delete',
      metadata: { archived: true },
      occurredAt: updated.updatedAt,
    }),
  ]);

  return success(req, res, { deleted: true, productId: serialized.productId });
});

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
