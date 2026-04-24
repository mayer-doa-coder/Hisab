const mongoose = require('mongoose');

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const BakiEntry = require('../../models/BakiEntry');
const CreditReminder = require('../../models/CreditReminder');
const PaymentPromise = require('../../models/PaymentPromise');
const InventoryMovement = require('../../models/InventoryMovement');
const Transaction = require('../../models/Transaction');
const SalesHeader = require('../../models/SalesHeader');
const SalesItem = require('../../models/SalesItem');
const Payment = require('../../models/Payment');
const SalesReturn = require('../../models/SalesReturn');
const ApprovalRequest = require('../../models/ApprovalRequest');
const Supplier = require('../../models/Supplier');
const PurchaseOrder = require('../../models/PurchaseOrder');
const PurchaseItem = require('../../models/PurchaseItem');
const SupplierPayable = require('../../models/SupplierPayable');
const InventoryBatch = require('../../models/InventoryBatch');
const CycleCount = require('../../models/CycleCount');
const InventoryAlert = require('../../models/InventoryAlert');
const ExpenseEntry = require('../../models/ExpenseEntry');
const CashbookEntry = require('../../models/CashbookEntry');
const DayClose = require('../../models/DayClose');
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
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { ACTIONS } = require('../../security/rbac');

const MAX_CHANGES_PER_BATCH = 300;
const MAX_SERVER_CHANGES = 500;

const normalizeEntity = (value) => {
  const entity = normalizeTrimmedString(value).toLowerCase();

  if (entity === 'credit_reminder' || entity === 'reminder') {
    return 'collection_reminder';
  }

  if (entity === 'payment_promises') {
    return 'payment_promise';
  }

  return entity;
};
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

const resolvePermissionActionForChange = (change) => {
  const entity = normalizeEntity(change?.entity);
  const type = normalizeType(change?.type || 'upsert');
  const payload = change?.data || {};

  if (entity === 'product') {
    return ACTIONS.STOCK_MANAGE;
  }

  if (entity === 'inventory_movement' || entity === 'inventory_batch' || entity === 'cycle_count' || entity === 'alert') {
    return ACTIONS.STOCK_MANAGE;
  }

  if (entity === 'supplier' || entity === 'purchase_order' || entity === 'purchase_item' || entity === 'supplier_payable') {
    return ACTIONS.PURCHASE_MANAGE;
  }

  if (entity === 'expense_entry' || entity === 'cashbook_entry' || entity === 'day_close') {
    return ACTIONS.EXPENSES_MANAGE;
  }

  if (entity === 'transaction') {
    return ACTIONS.TRANSACTIONS_CREATE;
  }

  if (entity === 'sales_header') {
    const status = normalizeTrimmedString(payload.status).toLowerCase();
    if (type === 'delete' || status === 'voided' || status === 'cancelled') {
      return ACTIONS.VOID_SALE_REQUEST;
    }
    return ACTIONS.SALES_CREATE;
  }

  if (entity === 'sales_item' || entity === 'payment' || entity === 'baki_entry' || entity === 'collection_reminder' || entity === 'payment_promise' || entity === 'customer') {
    return ACTIONS.SALES_CREATE;
  }

  if (entity === 'sales_return') {
    return ACTIONS.RETURN_PRODUCT_REQUEST;
  }

  return null;
};

const resolveApprovalRequirementForChange = async ({ userId, change }) => {
  const entity = normalizeEntity(change?.entity);
  const type = normalizeType(change?.type || 'upsert');
  const payload = change?.data || {};

  if (entity === 'sales_header') {
    const status = normalizeTrimmedString(payload.status).toLowerCase();
    if (type === 'delete' || status === 'voided' || status === 'cancelled') {
      return {
        actionType: 'VOID_SALE',
        requestAction: ACTIONS.VOID_SALE_REQUEST,
        approveAction: ACTIONS.VOID_SALE_APPROVE,
        reason: 'Sale void requires approval.',
      };
    }
  }

  if (entity === 'sales_return' && type !== 'delete') {
    return {
      actionType: 'RETURN_PRODUCT',
      requestAction: ACTIONS.RETURN_PRODUCT_REQUEST,
      approveAction: ACTIONS.RETURN_PRODUCT_APPROVE,
      reason: 'Product return requires approval.',
    };
  }

  if (entity === 'sales_item' && type !== 'delete') {
    const productRef = normalizeTrimmedString(payload.productServerId || payload.productClientRefId || payload.productId);
    const product = await resolveProductReference({ userId, value: productRef });
    const productPrice = parseMoney(product?.price);
    const unitPrice = parseMoney(payload.unitPrice ?? payload.unit_price);

    if (product && unitPrice !== null && productPrice !== null && unitPrice < productPrice) {
      return {
        actionType: 'DISCOUNT_OVERRIDE',
        requestAction: ACTIONS.DISCOUNT_OVERRIDE_REQUEST,
        approveAction: ACTIONS.DISCOUNT_OVERRIDE_APPROVE,
        reason: 'Discount override below catalog price requires approval.',
      };
    }
  }

  return null;
};

const createPendingApprovalRequest = async ({
  userId,
  actorUserId,
  branchId,
  actionType,
  reason,
  change,
} = {}) => {
  const idempotencyKey = normalizeTrimmedString(change?.idempotencyKey) || null;

  if (idempotencyKey) {
    const existing = await ApprovalRequest.findOne({
      tenantUserId: userId,
      requestedBy: actorUserId,
      actionType,
      status: 'PENDING',
      'requestPayload.change.idempotencyKey': idempotencyKey,
    });

    if (existing) {
      return existing;
    }
  }

  return ApprovalRequest.create({
    actionType,
    tenantUserId: userId,
    branchId: branchId || null,
    requestedBy: actorUserId,
    status: 'PENDING',
    source: 'sync_change',
    reason,
    requestPayload: {
      change,
    },
  });
};

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
    currentBalance: Number(doc.currentBalance || 0),
    riskLevel: doc.riskLevel || 'low',
    dueTermsDays: Number(doc.dueTermsDays || 30),
    lastPaymentDate: doc.lastPaymentDate ? new Date(doc.lastPaymentDate).toISOString() : null,
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
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    status: doc.status || 'open',
    referenceId: doc.referenceId || null,
    resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : null,
    reminderSentAt: doc.reminderSentAt ? new Date(doc.reminderSentAt).toISOString() : null,
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

const serializeCollectionReminder = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    customerServerId: String(doc.customerId),
    customerClientRefId: doc.customerClientRefId || null,
    bakiEntryServerId: doc.bakiEntryId ? String(doc.bakiEntryId) : null,
    bakiEntryClientRefId: doc.bakiEntryClientRefId || null,
    channel: doc.channel || 'manual',
    message: doc.message || null,
    sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
    status: doc.status || 'sent',
    referenceId: doc.referenceId || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializePaymentPromise = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    customerServerId: String(doc.customerId),
    customerClientRefId: doc.customerClientRefId || null,
    promisedAmount: Number(doc.promisedAmount || 0),
    promiseDate: doc.promiseDate ? new Date(doc.promiseDate).toISOString() : null,
    status: doc.status || 'pending',
    note: doc.note || null,
    fulfilledByEntryServerId: doc.fulfilledByEntryId ? String(doc.fulfilledByEntryId) : null,
    fulfilledByEntryClientRefId: doc.fulfilledByEntryClientRefId || null,
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
    stockOutReason: doc.reason || null,
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

const serializeSalesHeader = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    receiptId: doc.receiptId,
    customerServerId: doc.customerId ? String(doc.customerId) : null,
    customerClientRefId: doc.customerClientRefId || null,
    timestamp: doc.saleAt ? new Date(doc.saleAt).toISOString() : null,
    totalAmount: Number(doc.totalAmount || 0),
    paymentMode: doc.paymentMode || 'CASH',
    status: doc.status || 'posted',
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeSalesItem = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    salesHeaderServerId: String(doc.salesHeaderId),
    salesHeaderClientRefId: doc.salesHeaderClientRefId || null,
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    quantity: Number(doc.quantity || 0),
    unitPrice: Number(doc.unitPrice || 0),
    subtotal: Number(doc.subtotal || 0),
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializePayment = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    salesHeaderServerId: String(doc.salesHeaderId),
    salesHeaderClientRefId: doc.salesHeaderClientRefId || null,
    amount: Number(doc.amount || 0),
    method: doc.method || 'CASH',
    status: doc.status || 'PAID',
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeSalesReturn = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    salesItemServerId: String(doc.salesItemId),
    salesItemClientRefId: doc.salesItemClientRefId || null,
    quantity: Number(doc.quantity || 0),
    reason: doc.reason || null,
    note: doc.note || null,
    returnAt: doc.returnAt ? new Date(doc.returnAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeSupplier = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    name: doc.name,
    phone: doc.phone || null,
    address: doc.address || null,
    dueAmount: Number(doc.dueAmount || 0),
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializePurchaseOrder = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    supplierServerId: String(doc.supplierId),
    supplierClientRefId: doc.supplierClientRefId || null,
    purchaseCode: doc.purchaseCode,
    purchaseDate: doc.purchaseAt ? new Date(doc.purchaseAt).toISOString() : null,
    totalAmount: Number(doc.totalAmount || 0),
    paidAmount: Number(doc.paidAmount || 0),
    dueAmount: Number(doc.dueAmount || 0),
    status: doc.status || 'pending',
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializePurchaseItem = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    purchaseOrderServerId: String(doc.purchaseOrderId),
    purchaseOrderClientRefId: doc.purchaseOrderClientRefId || null,
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    orderedQty: Number(doc.orderedQty || 0),
    receivedQty: Number(doc.receivedQty || 0),
    pendingQty: Number(doc.pendingQty || 0),
    unitCost: Number(doc.unitCost || 0),
    subtotal: Number(doc.subtotal || 0),
    status: doc.status || 'pending',
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeSupplierPayable = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    supplierServerId: String(doc.supplierId),
    supplierClientRefId: doc.supplierClientRefId || null,
    purchaseOrderServerId: doc.purchaseOrderId ? String(doc.purchaseOrderId) : null,
    purchaseOrderClientRefId: doc.purchaseOrderClientRefId || null,
    entryType: doc.entryType,
    amount: Number(doc.amount || 0),
    runningDue: Number(doc.runningDue || 0),
    paymentMethod: doc.paymentMethod || null,
    note: doc.note || null,
    occurredAt: doc.occurredAt ? new Date(doc.occurredAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeInventoryBatch = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    batchNumber: doc.batchNumber || null,
    quantity: Number(doc.quantity || 0),
    expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString() : null,
    purchaseDate: doc.purchaseDate ? new Date(doc.purchaseDate).toISOString() : null,
    costPrice: Number(doc.costPrice || 0),
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeCycleCount = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    systemQuantity: Number(doc.systemQuantity || 0),
    physicalQuantity: Number(doc.physicalQuantity || 0),
    variance: Number(doc.variance || 0),
    timestamp: doc.countedAt ? new Date(doc.countedAt).toISOString() : null,
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeInventoryAlert = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    productServerId: String(doc.productId),
    productClientRefId: doc.productClientRefId || null,
    alertType: doc.alertType,
    message: doc.message,
    severity: doc.severity,
    isActive: Boolean(doc.isActive),
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived || !doc.isActive),
});

const serializeExpenseEntry = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    expenseDate: doc.expenseDate ? new Date(doc.expenseDate).toISOString() : null,
    category: doc.category || 'GENERAL',
    title: doc.title,
    amount: Number(doc.amount || 0),
    paymentMethod: doc.paymentMethod || null,
    note: doc.note || null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeCashbookEntry = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    entryType: doc.entryType,
    category: doc.category || 'GENERAL',
    amount: Number(doc.amount || 0),
    paymentMethod: doc.paymentMethod || null,
    referenceType: doc.referenceType || null,
    referenceLocalId: Number.isInteger(Number(doc.referenceLocalId)) ? Number(doc.referenceLocalId) : null,
    referenceClientRefId: doc.referenceClientRefId || null,
    note: doc.note || null,
    occurredAt: doc.occurredAt ? new Date(doc.occurredAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
});

const serializeDayClose = (doc) => ({
  serverId: String(doc._id),
  id: doc.clientRefId || String(doc._id),
  data: {
    businessDate: doc.businessDate,
    openingBalance: Number(doc.openingBalance || 0),
    totalIn: Number(doc.totalIn || 0),
    totalOut: Number(doc.totalOut || 0),
    closingBalance: Number(doc.closingBalance || 0),
    cashOnHand: doc.cashOnHand === null || doc.cashOnHand === undefined ? null : Number(doc.cashOnHand),
    variance: doc.variance === null || doc.variance === undefined ? null : Number(doc.variance),
    status: doc.status || 'closed',
    note: doc.note || null,
    closedAt: doc.closedAt ? new Date(doc.closedAt).toISOString() : null,
    serverId: String(doc._id),
    clientRefId: doc.clientRefId || null,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  },
  version: Number(doc.serverVersion || doc.version || 1),
  updatedAt: new Date(doc.updatedAt || Date.now()).toISOString(),
  deleted: Boolean(doc.deletedAt || doc.isArchived),
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

const resolveCustomerReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(Customer, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolveBakiEntryReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(BakiEntry, { userId, refId: value });
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

const resolveSalesHeaderReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(SalesHeader, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolveSalesItemReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(SalesItem, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolveSupplierReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(Supplier, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolvePurchaseOrderReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(PurchaseOrder, { userId, refId: value });
  if (!resolved || resolved.deletedAt || resolved.isArchived) {
    return null;
  }

  return resolved;
};

const resolvePurchaseItemReference = async ({ userId, value }) => {
  const resolved = await findByServerOrClientId(PurchaseItem, { userId, refId: value });
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
  const currentBalance = payload.currentBalance === undefined ? null : parseMoney(payload.currentBalance);
  const rawDueTermsDays = payload.dueTermsDays === undefined ? null : parsePositiveInt(payload.dueTermsDays);
  const dueTermsDays = rawDueTermsDays === null ? null : Math.min(365, rawDueTermsDays);
  const riskLevel = normalizeTrimmedString(payload.riskLevel || '').toLowerCase();
  const normalizedRiskLevel = ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : null;
  const lastPaymentDate = payload.lastPaymentDate ? parseOptionalDate(payload.lastPaymentDate) : null;

  if (!name || creditLimit === null || (payload.currentBalance !== undefined && currentBalance === null)) {
    return asSyncError('rejected_validation', 'Invalid customer payload.');
  }

  if (payload.dueTermsDays !== undefined && !dueTermsDays) {
    return asSyncError('rejected_validation', 'Invalid dueTermsDays for customer payload.');
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
    if (currentBalance !== null) {
      existing.currentBalance = currentBalance;
    }
    if (dueTermsDays) {
      existing.dueTermsDays = dueTermsDays;
    }
    if (normalizedRiskLevel) {
      existing.riskLevel = normalizedRiskLevel;
    }
    if (payload.lastPaymentDate !== undefined) {
      existing.lastPaymentDate = lastPaymentDate;
    }
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
    currentBalance: currentBalance === null ? 0 : currentBalance,
    dueTermsDays: dueTermsDays || 30,
    riskLevel: normalizedRiskLevel || 'low',
    lastPaymentDate,
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

  const customerRef = normalizeTrimmedString(payload.customerId || payload.customerServerId || payload.customerClientRefId);
  const customer = await resolveCustomerReference({ userId, value: customerRef });
  if (!customer) {
    return asSyncError('rejected_business_rule', 'Referenced customer was not found for baki entry.');
  }

  const type = normalizeTrimmedString(payload.type).toLowerCase();
  const amount = parseMoney(payload.amount);
  const statusToken = normalizeTrimmedString(payload.status).toLowerCase();
  const normalizedStatus = ['open', 'paid', 'overdue'].includes(statusToken) ? statusToken : null;
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

  const created = await BakiEntry.create({
    userId,
    clientRefId: changeId || null,
    customerId: customer._id,
    customerClientRefId: customer.clientRefId || null,
    type,
    amount,
    runningDue,
    dueDate: parseOptionalDate(payload.dueDate),
    status: normalizedStatus || (type === 'payment' ? 'paid' : 'open'),
    referenceId: normalizeTrimmedString(payload.referenceId) || null,
    resolvedAt: parseOptionalDate(payload.resolvedAt),
    reminderSentAt: parseOptionalDate(payload.reminderSentAt),
    paymentMethod: type === 'payment' ? normalizeTrimmedString(payload.paymentMethod) || 'cash' : null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseOptionalDate(payload.occurredAt) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
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

const applyCollectionReminderChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(CreditReminder, { userId, refId: changeId });

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

    const serialized = serializeCollectionReminder(existing);
    await appendChange({
      userId,
      entityType: 'collection_reminder',
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

  const customerRef = normalizeTrimmedString(payload.customerId || payload.customerServerId || payload.customerClientRefId);
  const customer = await resolveCustomerReference({ userId, value: customerRef });
  if (!customer) {
    return asSyncError('rejected_business_rule', 'Referenced customer was not found for collection_reminder.');
  }

  const bakiRef = normalizeTrimmedString(payload.bakiEntryId || payload.bakiEntryServerId || payload.bakiEntryClientRefId);
  const bakiEntry = bakiRef ? await resolveBakiEntryReference({ userId, value: bakiRef }) : null;

  const channel = normalizeTrimmedString(payload.channel).toLowerCase() || 'manual';
  const status = normalizeTrimmedString(payload.status).toLowerCase() || 'sent';
  const sentAt = parseOptionalDate(payload.sentAt) || new Date();

  if (!['sms', 'whatsapp', 'call', 'manual'].includes(channel)) {
    return asSyncError('rejected_validation', 'Invalid channel for collection_reminder.');
  }

  if (!['queued', 'sent', 'failed'].includes(status)) {
    return asSyncError('rejected_validation', 'Invalid status for collection_reminder.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeCollectionReminder(existing);
      return asSyncError('conflict_requires_client_resolution', 'Collection reminder version conflict.', latest);
    }

    existing.customerId = customer._id;
    existing.customerClientRefId = customer.clientRefId || null;
    existing.bakiEntryId = bakiEntry ? bakiEntry._id : null;
    existing.bakiEntryClientRefId = bakiEntry ? (bakiEntry.clientRefId || null) : null;
    existing.channel = channel;
    existing.message = normalizeTrimmedString(payload.message) || null;
    existing.sentAt = sentAt;
    existing.status = status;
    existing.referenceId = normalizeTrimmedString(payload.referenceId) || null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    if (bakiEntry) {
      await BakiEntry.updateOne(
        { _id: bakiEntry._id, userId },
        {
          $set: {
            reminderSentAt: sentAt,
          },
        }
      );
    }

    const serialized = serializeCollectionReminder(existing);
    await appendChange({
      userId,
      entityType: 'collection_reminder',
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

  const created = await CreditReminder.create({
    userId,
    clientRefId: changeId || null,
    customerId: customer._id,
    customerClientRefId: customer.clientRefId || null,
    bakiEntryId: bakiEntry ? bakiEntry._id : null,
    bakiEntryClientRefId: bakiEntry ? (bakiEntry.clientRefId || null) : null,
    channel,
    message: normalizeTrimmedString(payload.message) || null,
    sentAt,
    status,
    referenceId: normalizeTrimmedString(payload.referenceId) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  if (bakiEntry) {
    await BakiEntry.updateOne(
      { _id: bakiEntry._id, userId },
      {
        $set: {
          reminderSentAt: sentAt,
        },
      }
    );
  }

  const serialized = serializeCollectionReminder(created);
  await appendChange({
    userId,
    entityType: 'collection_reminder',
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

const applyPaymentPromiseChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(PaymentPromise, { userId, refId: changeId });

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

    const serialized = serializePaymentPromise(existing);
    await appendChange({
      userId,
      entityType: 'payment_promise',
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

  const customerRef = normalizeTrimmedString(payload.customerId || payload.customerServerId || payload.customerClientRefId);
  const customer = await resolveCustomerReference({ userId, value: customerRef });
  if (!customer) {
    return asSyncError('rejected_business_rule', 'Referenced customer was not found for payment_promise.');
  }

  const promisedAmount = parseMoney(payload.promisedAmount);
  const promiseDate = parseOptionalDate(payload.promiseDate);
  const status = normalizeTrimmedString(payload.status).toLowerCase() || 'pending';

  if (promisedAmount === null || promisedAmount <= 0 || !promiseDate) {
    return asSyncError('rejected_validation', 'Invalid payment_promise payload.');
  }

  if (!['pending', 'fulfilled', 'broken'].includes(status)) {
    return asSyncError('rejected_validation', 'Invalid status for payment_promise.');
  }

  const fulfilledRef = normalizeTrimmedString(
    payload.fulfilledByEntryId || payload.fulfilledByEntryServerId || payload.fulfilledByEntryClientRefId
  );
  const fulfilledByEntry = fulfilledRef
    ? await resolveBakiEntryReference({ userId, value: fulfilledRef })
    : null;

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializePaymentPromise(existing);
      return asSyncError('conflict_requires_client_resolution', 'Payment promise version conflict.', latest);
    }

    existing.customerId = customer._id;
    existing.customerClientRefId = customer.clientRefId || null;
    existing.promisedAmount = promisedAmount;
    existing.promiseDate = promiseDate;
    existing.status = status;
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.fulfilledByEntryId = fulfilledByEntry ? fulfilledByEntry._id : null;
    existing.fulfilledByEntryClientRefId = fulfilledByEntry ? (fulfilledByEntry.clientRefId || null) : null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializePaymentPromise(existing);
    await appendChange({
      userId,
      entityType: 'payment_promise',
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

  const created = await PaymentPromise.create({
    userId,
    clientRefId: changeId || null,
    customerId: customer._id,
    customerClientRefId: customer.clientRefId || null,
    promisedAmount,
    promiseDate,
    status,
    note: normalizeTrimmedString(payload.note) || null,
    fulfilledByEntryId: fulfilledByEntry ? fulfilledByEntry._id : null,
    fulfilledByEntryClientRefId: fulfilledByEntry ? (fulfilledByEntry.clientRefId || null) : null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializePaymentPromise(created);
  await appendChange({
    userId,
    entityType: 'payment_promise',
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

const normalizePurchaseStatus = (value) => {
  const token = normalizeTrimmedString(value).toLowerCase();
  if (token === 'pending' || token === 'partial' || token === 'received' || token === 'cancelled') {
    return token;
  }

  return 'pending';
};

const normalizeAlertType = (value) => {
  const token = normalizeTrimmedString(value).toUpperCase();
  if (token === 'LOW_STOCK' || token === 'EXPIRY' || token === 'OVERSTOCK' || token === 'DEAD_STOCK') {
    return token;
  }

  return '';
};

const normalizeAlertSeverity = (value) => {
  const token = normalizeTrimmedString(value).toLowerCase();
  if (token === 'low' || token === 'medium' || token === 'high' || token === 'critical') {
    return token;
  }

  return 'low';
};

const normalizeCashbookEntryType = (value) => {
  const token = normalizeTrimmedString(value).toUpperCase();
  if (token === 'IN' || token === 'OUT') {
    return token;
  }

  return 'IN';
};

const normalizeDayCloseStatus = (value) => {
  const token = normalizeTrimmedString(value).toLowerCase();
  if (token === 'open' || token === 'closed') {
    return token;
  }

  return 'closed';
};

const normalizeFinanceCategory = (value, fallback = 'GENERAL') => {
  const token = normalizeTrimmedString(value || fallback).toUpperCase();
  if (!token) {
    return 'GENERAL';
  }

  return token.replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'GENERAL';
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

  const productRef = normalizeTrimmedString(payload.productId || payload.productServerId || payload.productClientRefId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for movement.');
  }

  const movementType = normalizeMovementType(payload.movementType);
  if (!movementType) {
    return asSyncError('rejected_validation', 'Invalid movementType for inventory_movement.');
  }

  const stockOutReason = normalizeTrimmedString(payload.stockOutReason || payload.reason) || null;
  if ((movementType === 'stock_out' || movementType === 'expiry_removal') && !stockOutReason) {
    return asSyncError('rejected_validation', 'stockOutReason is required for stock-out movement.');
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
    reason: stockOutReason,
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
  const customerRef = normalizeTrimmedString(payload.customerId || payload.customerServerId || payload.customerClientRefId);
  if (customerRef) {
    customer = await resolveCustomerReference({ userId, value: customerRef });
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

const applySalesHeaderChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(SalesHeader, { userId, refId: changeId });

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

    const serialized = serializeSalesHeader(existing);
    await appendChange({
      userId,
      entityType: 'sales_header',
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

  const receiptId = normalizeTrimmedString(payload.receiptId || payload.receipt_id);
  const totalAmount = parseMoney(payload.totalAmount ?? payload.total_amount);
  const saleAt = parseOptionalDate(payload.timestamp || payload.saleAt || payload.occurredAt) || new Date();
  const paymentMode = normalizeTrimmedString(payload.paymentMode || payload.payment_mode || 'CASH').toUpperCase();
  const status = normalizeTrimmedString(payload.status || 'posted').toLowerCase();

  if (!receiptId || totalAmount === null) {
    return asSyncError('rejected_validation', 'Invalid sales_header payload.');
  }

  let customer = null;
  const customerRef = normalizeTrimmedString(
    payload.customerServerId || payload.customerClientRefId || payload.customerId
  );
  if (customerRef) {
    customer = await resolveCustomerReference({ userId, value: customerRef });
    if (!customer) {
      return asSyncError('rejected_business_rule', 'Referenced customer was not found for sales_header.');
    }
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeSalesHeader(existing);
      return asSyncError('conflict_requires_client_resolution', 'Sales header version conflict.', latest);
    }

    existing.receiptId = receiptId;
    existing.customerId = customer ? customer._id : null;
    existing.customerClientRefId = customer ? customer.clientRefId || null : null;
    existing.saleAt = saleAt;
    existing.totalAmount = totalAmount;
    existing.paymentMode = paymentMode || 'CASH';
    existing.status = status || 'posted';
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeSalesHeader(existing);
    await appendChange({
      userId,
      entityType: 'sales_header',
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

  const created = await SalesHeader.create({
    userId,
    clientRefId: changeId || null,
    receiptId,
    customerId: customer ? customer._id : null,
    customerClientRefId: customer ? customer.clientRefId || null : null,
    saleAt,
    totalAmount,
    paymentMode: paymentMode || 'CASH',
    status: status || 'posted',
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeSalesHeader(created);
  await appendChange({
    userId,
    entityType: 'sales_header',
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

const applySalesItemChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(SalesItem, { userId, refId: changeId });

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

    const serialized = serializeSalesItem(existing);
    await appendChange({
      userId,
      entityType: 'sales_item',
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

  const salesHeaderRef = normalizeTrimmedString(
    payload.salesHeaderServerId || payload.salesHeaderClientRefId || payload.salesHeaderId
  );
  const salesHeader = await resolveSalesHeaderReference({ userId, value: salesHeaderRef });
  if (!salesHeader) {
    return asSyncError('rejected_business_rule', 'Referenced sales_header was not found for sales_item.');
  }

  const productRef = normalizeTrimmedString(payload.productServerId || payload.productClientRefId || payload.productId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for sales_item.');
  }

  const quantity = parsePositiveInt(payload.quantity);
  const unitPrice = parseMoney(payload.unitPrice ?? payload.unit_price);
  const subtotal = parseMoney(payload.subtotal);
  if (quantity === null || unitPrice === null || subtotal === null) {
    return asSyncError('rejected_validation', 'Invalid sales_item payload.');
  }

  const created = await SalesItem.create({
    userId,
    clientRefId: changeId || null,
    salesHeaderId: salesHeader._id,
    salesHeaderClientRefId: salesHeader.clientRefId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    quantity,
    unitPrice,
    subtotal,
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeSalesItem(created);
  await appendChange({
    userId,
    entityType: 'sales_item',
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

const applyPaymentChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(Payment, { userId, refId: changeId });

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

    const serialized = serializePayment(existing);
    await appendChange({
      userId,
      entityType: 'payment',
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

  const salesHeaderRef = normalizeTrimmedString(
    payload.salesHeaderServerId || payload.salesHeaderClientRefId || payload.salesHeaderId
  );
  const salesHeader = await resolveSalesHeaderReference({ userId, value: salesHeaderRef });
  if (!salesHeader) {
    return asSyncError('rejected_business_rule', 'Referenced sales_header was not found for payment.');
  }

  const amount = parseMoney(payload.amount);
  if (amount === null) {
    return asSyncError('rejected_validation', 'Invalid payment payload.');
  }

  const created = await Payment.create({
    userId,
    clientRefId: changeId || null,
    salesHeaderId: salesHeader._id,
    salesHeaderClientRefId: salesHeader.clientRefId || null,
    amount,
    method: normalizeTrimmedString(payload.method || 'CASH').toUpperCase(),
    status: normalizeTrimmedString(payload.status || 'PAID').toUpperCase(),
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializePayment(created);
  await appendChange({
    userId,
    entityType: 'payment',
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

const applySalesReturnChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(SalesReturn, { userId, refId: changeId });

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

    const serialized = serializeSalesReturn(existing);
    await appendChange({
      userId,
      entityType: 'sales_return',
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

  const salesItemRef = normalizeTrimmedString(payload.salesItemServerId || payload.salesItemClientRefId || payload.salesItemId);
  const salesItem = await resolveSalesItemReference({ userId, value: salesItemRef });
  if (!salesItem) {
    return asSyncError('rejected_business_rule', 'Referenced sales_item was not found for sales_return.');
  }

  const quantity = parsePositiveInt(payload.quantity);
  if (quantity === null) {
    return asSyncError('rejected_validation', 'Invalid sales_return payload.');
  }

  const created = await SalesReturn.create({
    userId,
    clientRefId: changeId || null,
    salesItemId: salesItem._id,
    salesItemClientRefId: salesItem.clientRefId || null,
    quantity,
    reason: normalizeTrimmedString(payload.reason) || null,
    note: normalizeTrimmedString(payload.note) || null,
    returnAt: parseOptionalDate(payload.returnAt || payload.occurredAt) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeSalesReturn(created);
  await appendChange({
    userId,
    entityType: 'sales_return',
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

const applySupplierChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(Supplier, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    if (Number(existing.dueAmount || 0) > 0) {
      return asSyncError('rejected_business_rule', 'Supplier has outstanding due and cannot be deleted.');
    }

    const openOrders = await PurchaseOrder.countDocuments({
      userId,
      supplierId: existing._id,
      status: { $in: ['pending', 'partial'] },
      deletedAt: null,
      isArchived: { $ne: true },
    });
    if (openOrders > 0) {
      return asSyncError('rejected_business_rule', 'Supplier has open purchase orders and cannot be deleted.');
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeSupplier(existing);
    await appendChange({
      userId,
      entityType: 'supplier',
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
  const dueAmount = payload.dueAmount === undefined ? 0 : parseMoney(payload.dueAmount);
  if (!name || dueAmount === null || dueAmount < 0) {
    return asSyncError('rejected_validation', 'Invalid supplier payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeSupplier(existing);
      return asSyncError('conflict_requires_client_resolution', 'Supplier version conflict.', latest);
    }

    existing.name = name;
    existing.phone = normalizeTrimmedString(payload.phone) || null;
    existing.address = normalizeTrimmedString(payload.address) || null;
    existing.dueAmount = dueAmount;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeSupplier(existing);
    await appendChange({
      userId,
      entityType: 'supplier',
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

  const created = await Supplier.create({
    userId,
    clientRefId: changeId || null,
    name,
    phone: normalizeTrimmedString(payload.phone) || null,
    address: normalizeTrimmedString(payload.address) || null,
    dueAmount,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeSupplier(created);
  await appendChange({
    userId,
    entityType: 'supplier',
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

const applyPurchaseOrderChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(PurchaseOrder, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    if (Number(existing.dueAmount || 0) > 0) {
      return asSyncError('rejected_business_rule', 'Purchase order has due amount and cannot be deleted.');
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializePurchaseOrder(existing);
    await appendChange({
      userId,
      entityType: 'purchase_order',
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

  const supplierRef = normalizeTrimmedString(payload.supplierServerId || payload.supplierClientRefId || payload.supplierId);
  const supplier = await resolveSupplierReference({ userId, value: supplierRef });
  if (!supplier) {
    return asSyncError('rejected_business_rule', 'Referenced supplier was not found for purchase_order.');
  }

  const purchaseCode = normalizeTrimmedString(payload.purchaseCode || payload.purchase_code);
  const purchaseAt = parseOptionalDate(payload.purchaseDate || payload.purchaseAt || payload.occurredAt) || new Date();
  const totalAmount = parseMoney(payload.totalAmount);
  const paidAmount = parseMoney(payload.paidAmount);
  const dueAmount = parseMoney(payload.dueAmount);
  const status = normalizePurchaseStatus(payload.status);

  if (!purchaseCode || totalAmount === null || paidAmount === null || dueAmount === null || totalAmount < 0 || paidAmount < 0 || dueAmount < 0) {
    return asSyncError('rejected_validation', 'Invalid purchase_order payload.');
  }

  if (paidAmount > totalAmount) {
    return asSyncError('rejected_validation', 'paidAmount cannot exceed totalAmount.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializePurchaseOrder(existing);
      return asSyncError('conflict_requires_client_resolution', 'Purchase order version conflict.', latest);
    }

    existing.supplierId = supplier._id;
    existing.supplierClientRefId = supplier.clientRefId || null;
    existing.purchaseCode = purchaseCode;
    existing.purchaseAt = purchaseAt;
    existing.totalAmount = totalAmount;
    existing.paidAmount = paidAmount;
    existing.dueAmount = dueAmount;
    existing.status = status;
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializePurchaseOrder(existing);
    await appendChange({
      userId,
      entityType: 'purchase_order',
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

  const created = await PurchaseOrder.create({
    userId,
    clientRefId: changeId || null,
    supplierId: supplier._id,
    supplierClientRefId: supplier.clientRefId || null,
    purchaseCode,
    purchaseAt,
    totalAmount,
    paidAmount,
    dueAmount,
    status,
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializePurchaseOrder(created);
  await appendChange({
    userId,
    entityType: 'purchase_order',
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

const applyPurchaseItemChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(PurchaseItem, { userId, refId: changeId });

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

    const serialized = serializePurchaseItem(existing);
    await appendChange({
      userId,
      entityType: 'purchase_item',
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
    const orderedQty = parsePositiveInt(payload.orderedQty);
    const receivedQty = parseNonNegativeInt(payload.receivedQty ?? 0);
    const pendingQty = parseNonNegativeInt(payload.pendingQty ?? (orderedQty === null || receivedQty === null ? null : orderedQty - receivedQty));
    const unitCost = parseMoney(payload.unitCost);
    const subtotal = parseMoney(payload.subtotal);

    if (orderedQty === null || receivedQty === null || pendingQty === null || unitCost === null || subtotal === null) {
      return asSyncError('rejected_validation', 'Invalid purchase_item payload.');
    }

    if (receivedQty > orderedQty || pendingQty !== orderedQty - receivedQty) {
      return asSyncError('rejected_validation', 'purchase_item quantities are inconsistent.');
    }

    const purchaseOrderRef = normalizeTrimmedString(payload.purchaseOrderServerId || payload.purchaseOrderClientRefId || payload.purchaseOrderId);
    const purchaseOrder = await resolvePurchaseOrderReference({ userId, value: purchaseOrderRef });
    if (!purchaseOrder) {
      return asSyncError('rejected_business_rule', 'Referenced purchase_order was not found for purchase_item.');
    }

    const productRef = normalizeTrimmedString(payload.productServerId || payload.productClientRefId || payload.productId);
    const product = await resolveProductReference({ userId, value: productRef });
    if (!product) {
      return asSyncError('rejected_business_rule', 'Referenced product was not found for purchase_item.');
    }

    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    existing.purchaseOrderId = purchaseOrder._id;
    existing.purchaseOrderClientRefId = purchaseOrder.clientRefId || null;
    existing.productId = product._id;
    existing.productClientRefId = product.clientRefId || null;
    existing.orderedQty = orderedQty;
    existing.receivedQty = receivedQty;
    existing.pendingQty = pendingQty;
    existing.unitCost = unitCost;
    existing.subtotal = subtotal;
    existing.status = normalizePurchaseStatus(payload.status).replace('cancelled', 'pending');
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializePurchaseItem(existing);
    await appendChange({
      userId,
      entityType: 'purchase_item',
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

  const purchaseOrderRef = normalizeTrimmedString(payload.purchaseOrderServerId || payload.purchaseOrderClientRefId || payload.purchaseOrderId);
  const purchaseOrder = await resolvePurchaseOrderReference({ userId, value: purchaseOrderRef });
  if (!purchaseOrder) {
    return asSyncError('rejected_business_rule', 'Referenced purchase_order was not found for purchase_item.');
  }

  const productRef = normalizeTrimmedString(payload.productServerId || payload.productClientRefId || payload.productId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for purchase_item.');
  }

  const orderedQty = parsePositiveInt(payload.orderedQty);
  const receivedQty = parseNonNegativeInt(payload.receivedQty ?? 0);
  const pendingQty = parseNonNegativeInt(payload.pendingQty ?? (orderedQty === null || receivedQty === null ? null : orderedQty - receivedQty));
  const unitCost = parseMoney(payload.unitCost);
  const subtotal = parseMoney(payload.subtotal);
  if (orderedQty === null || receivedQty === null || pendingQty === null || unitCost === null || subtotal === null) {
    return asSyncError('rejected_validation', 'Invalid purchase_item payload.');
  }

  if (receivedQty > orderedQty || pendingQty !== orderedQty - receivedQty) {
    return asSyncError('rejected_validation', 'purchase_item quantities are inconsistent.');
  }

  const created = await PurchaseItem.create({
    userId,
    clientRefId: changeId || null,
    purchaseOrderId: purchaseOrder._id,
    purchaseOrderClientRefId: purchaseOrder.clientRefId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    orderedQty,
    receivedQty,
    pendingQty,
    unitCost,
    subtotal,
    status: normalizePurchaseStatus(payload.status).replace('cancelled', 'pending'),
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializePurchaseItem(created);
  await appendChange({
    userId,
    entityType: 'purchase_item',
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

const applySupplierPayableChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(SupplierPayable, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    return asSyncError(
      'rejected_business_rule',
      'Supplier payable deletion is not supported to preserve accounting integrity.'
    );
  }

  if (existing) {
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const supplierRef = normalizeTrimmedString(payload.supplierServerId || payload.supplierClientRefId || payload.supplierId);
  const supplier = await resolveSupplierReference({ userId, value: supplierRef });
  if (!supplier) {
    return asSyncError('rejected_business_rule', 'Referenced supplier was not found for supplier_payable.');
  }

  let purchaseOrder = null;
  const purchaseOrderRef = normalizeTrimmedString(payload.purchaseOrderServerId || payload.purchaseOrderClientRefId || payload.purchaseOrderId);
  if (purchaseOrderRef) {
    purchaseOrder = await resolvePurchaseOrderReference({ userId, value: purchaseOrderRef });
    if (!purchaseOrder) {
      return asSyncError('rejected_business_rule', 'Referenced purchase_order was not found for supplier_payable.');
    }
  }

  const entryType = normalizeTrimmedString(payload.entryType).toLowerCase();
  const amount = parseMoney(payload.amount);
  const runningDue = parseMoney(payload.runningDue);
  if (!['credit', 'payment'].includes(entryType) || amount === null || amount <= 0 || runningDue === null || runningDue < 0) {
    return asSyncError('rejected_validation', 'Invalid supplier_payable payload.');
  }

  const created = await SupplierPayable.create({
    userId,
    clientRefId: changeId || null,
    supplierId: supplier._id,
    supplierClientRefId: supplier.clientRefId || null,
    purchaseOrderId: purchaseOrder ? purchaseOrder._id : null,
    purchaseOrderClientRefId: purchaseOrder ? purchaseOrder.clientRefId || null : null,
    entryType,
    amount,
    runningDue,
    paymentMethod: normalizeTrimmedString(payload.paymentMethod) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseOptionalDate(payload.occurredAt) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  supplier.dueAmount = runningDue;
  supplier.serverVersion = Number(supplier.serverVersion || supplier.version || 1) + 1;
  supplier.version = Number(supplier.version || 1) + 1;
  supplier.lastClientMutationAt = clientMutationAt;
  await supplier.save();

  const serializedPayable = serializeSupplierPayable(created);
  const serializedSupplier = serializeSupplier(supplier);

  await appendChange({
    userId,
    entityType: 'supplier_payable',
    entityId: serializedPayable.serverId,
    changeType: 'upsert',
    payload: serializedPayable,
    version: serializedPayable.version,
  });

  await appendChange({
    userId,
    entityType: 'supplier',
    entityId: serializedSupplier.serverId,
    changeType: 'upsert',
    payload: serializedSupplier,
    version: serializedSupplier.version,
  });

  return {
    status: 'applied',
    serverVersion: serializedPayable.version,
    serverId: serializedPayable.serverId,
  };
};

const applyInventoryBatchChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(InventoryBatch, { userId, refId: changeId });

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

    const serialized = serializeInventoryBatch(existing);
    await appendChange({
      userId,
      entityType: 'inventory_batch',
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

  const productRef = normalizeTrimmedString(payload.productId || payload.productServerId || payload.productClientRefId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for inventory_batch.');
  }

  const quantity = parseNonNegativeInt(payload.quantity);
  const purchaseDate = parseOptionalDate(payload.purchaseDate || payload.purchase_date) || new Date();
  const costPrice = parseMoney(payload.costPrice ?? payload.cost_price ?? 0);
  const expiryDate = parseOptionalDate(payload.expiryDate || payload.expiry_date);
  const batchNumber = normalizeTrimmedString(payload.batchNumber || payload.batch_number) || null;

  if (quantity === null || costPrice === null || costPrice < 0) {
    return asSyncError('rejected_validation', 'Invalid inventory_batch payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeInventoryBatch(existing);
      return asSyncError('conflict_requires_client_resolution', 'Inventory batch version conflict.', latest);
    }

    existing.productId = product._id;
    existing.productClientRefId = product.clientRefId || null;
    existing.batchNumber = batchNumber;
    existing.quantity = quantity;
    existing.expiryDate = expiryDate;
    existing.purchaseDate = purchaseDate;
    existing.costPrice = costPrice;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeInventoryBatch(existing);
    await appendChange({
      userId,
      entityType: 'inventory_batch',
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

  const created = await InventoryBatch.create({
    userId,
    clientRefId: changeId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    batchNumber,
    quantity,
    expiryDate,
    purchaseDate,
    costPrice,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeInventoryBatch(created);
  await appendChange({
    userId,
    entityType: 'inventory_batch',
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

const applyCycleCountChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(CycleCount, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    return asSyncError(
      'rejected_business_rule',
      'Cycle count deletion is not supported to preserve reconciliation audit history.'
    );
  }

  if (existing) {
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const productRef = normalizeTrimmedString(payload.productId || payload.productServerId || payload.productClientRefId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for cycle_count.');
  }

  const systemQuantity = parseNonNegativeInt(payload.systemQuantity ?? payload.system_quantity);
  const physicalQuantity = parseNonNegativeInt(payload.physicalQuantity ?? payload.physical_quantity);
  const varianceCandidate = Number(payload.variance);
  if (systemQuantity === null || physicalQuantity === null) {
    return asSyncError('rejected_validation', 'Invalid cycle_count payload.');
  }

  const computedVariance = physicalQuantity - systemQuantity;
  if (Number.isFinite(varianceCandidate) && Math.trunc(varianceCandidate) !== computedVariance) {
    return asSyncError('rejected_validation', 'Cycle count variance does not match physical/system quantities.');
  }

  const created = await CycleCount.create({
    userId,
    clientRefId: changeId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    systemQuantity,
    physicalQuantity,
    variance: computedVariance,
    countedAt: parseOptionalDate(payload.timestamp || payload.countedAt) || new Date(),
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeCycleCount(created);
  await appendChange({
    userId,
    entityType: 'cycle_count',
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

const applyInventoryAlertChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(InventoryAlert, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    existing.deletedAt = new Date();
    existing.isArchived = true;
    existing.isActive = false;
    existing.serverVersion = Number(existing.serverVersion || existing.version || 1) + 1;
    existing.version = Number(existing.version || 1) + 1;
    existing.lastClientMutationAt = clientMutationAt;
    await existing.save();

    const serialized = serializeInventoryAlert(existing);
    await appendChange({
      userId,
      entityType: 'alert',
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

  const productRef = normalizeTrimmedString(payload.productId || payload.productServerId || payload.productClientRefId);
  const product = await resolveProductReference({ userId, value: productRef });
  if (!product) {
    return asSyncError('rejected_business_rule', 'Referenced product was not found for alert.');
  }

  const alertType = normalizeAlertType(payload.alertType || payload.alert_type);
  const message = normalizeTrimmedString(payload.message);
  const severity = normalizeAlertSeverity(payload.severity);
  const isActive = payload.isActive === undefined ? true : Boolean(payload.isActive);
  if (!alertType || !message) {
    return asSyncError('rejected_validation', 'Invalid alert payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeInventoryAlert(existing);
      return asSyncError('conflict_requires_client_resolution', 'Inventory alert version conflict.', latest);
    }

    existing.productId = product._id;
    existing.productClientRefId = product.clientRefId || null;
    existing.alertType = alertType;
    existing.message = message;
    existing.severity = severity;
    existing.isActive = isActive;
    existing.deletedAt = isActive ? null : new Date();
    existing.isArchived = !isActive;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeInventoryAlert(existing);
    await appendChange({
      userId,
      entityType: 'alert',
      entityId: serialized.serverId,
      changeType: serialized.deleted ? 'delete' : 'upsert',
      payload: serialized,
      version: serialized.version,
    });

    return {
      status: 'applied',
      serverVersion: serialized.version,
      serverId: serialized.serverId,
    };
  }

  const created = await InventoryAlert.create({
    userId,
    clientRefId: changeId || null,
    productId: product._id,
    productClientRefId: product.clientRefId || null,
    alertType,
    message,
    severity,
    isActive,
    deletedAt: isActive ? null : new Date(),
    isArchived: !isActive,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeInventoryAlert(created);
  await appendChange({
    userId,
    entityType: 'alert',
    entityId: serialized.serverId,
    changeType: serialized.deleted ? 'delete' : 'upsert',
    payload: serialized,
    version: serialized.version,
  });

  return {
    status: 'applied',
    serverVersion: serialized.version,
    serverId: serialized.serverId,
  };
};

const applyExpenseEntryChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const existing = await findByServerOrClientId(ExpenseEntry, { userId, refId: changeId });

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

    const serialized = serializeExpenseEntry(existing);
    await appendChange({
      userId,
      entityType: 'expense_entry',
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

  const expenseDate = parseOptionalDate(payload.expenseDate || payload.expense_date) || new Date();
  const amount = parseMoney(payload.amount);
  const title = normalizeTrimmedString(payload.title);
  if (amount === null || amount <= 0 || !title) {
    return asSyncError('rejected_validation', 'Invalid expense_entry payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeExpenseEntry(existing);
      return asSyncError('conflict_requires_client_resolution', 'Expense entry version conflict.', latest);
    }

    existing.expenseDate = expenseDate;
    existing.category = normalizeFinanceCategory(payload.category, 'GENERAL');
    existing.title = title;
    existing.amount = amount;
    existing.paymentMethod = normalizeTrimmedString(payload.paymentMethod) || null;
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeExpenseEntry(existing);
    await appendChange({
      userId,
      entityType: 'expense_entry',
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

  const created = await ExpenseEntry.create({
    userId,
    clientRefId: changeId || null,
    expenseDate,
    category: normalizeFinanceCategory(payload.category, 'GENERAL'),
    title,
    amount,
    paymentMethod: normalizeTrimmedString(payload.paymentMethod) || null,
    note: normalizeTrimmedString(payload.note) || null,
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeExpenseEntry(created);
  await appendChange({
    userId,
    entityType: 'expense_entry',
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

const applyCashbookEntryChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);

  const existing = await findByServerOrClientId(CashbookEntry, { userId, refId: changeId });

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    return asSyncError(
      'rejected_business_rule',
      'Cashbook entry deletion is not supported to preserve ledger integrity.'
    );
  }

  if (existing) {
    return {
      status: 'applied',
      serverVersion: Number(existing.serverVersion || existing.version || 1),
      serverId: String(existing._id),
    };
  }

  const amount = parseMoney(payload.amount);
  if (amount === null || amount <= 0) {
    return asSyncError('rejected_validation', 'Invalid cashbook_entry payload.');
  }

  const referenceLocalId = payload.referenceLocalId === null || payload.referenceLocalId === undefined
    ? null
    : parsePositiveInt(payload.referenceLocalId);

  if (payload.referenceLocalId !== null && payload.referenceLocalId !== undefined && referenceLocalId === null) {
    return asSyncError('rejected_validation', 'referenceLocalId must be a positive integer when provided.');
  }

  const created = await CashbookEntry.create({
    userId,
    clientRefId: changeId || null,
    entryType: normalizeCashbookEntryType(payload.entryType),
    category: normalizeFinanceCategory(payload.category, 'GENERAL'),
    amount,
    paymentMethod: normalizeTrimmedString(payload.paymentMethod) || null,
    referenceType: normalizeTrimmedString(payload.referenceType) || null,
    referenceLocalId,
    referenceClientRefId: normalizeTrimmedString(payload.referenceClientRefId) || null,
    note: normalizeTrimmedString(payload.note) || null,
    occurredAt: parseOptionalDate(payload.occurredAt || payload.occurred_at) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeCashbookEntry(created);
  await appendChange({
    userId,
    entityType: 'cashbook_entry',
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

const applyDayCloseChange = async ({ userId, change }) => {
  const changeId = normalizeTrimmedString(change?.id);
  const changeType = normalizeType(change?.type);
  const payload = change?.data || {};
  const clientMutationAt = parseOptionalDate(change?.updatedAt);
  const expectedVersion = Number(change?.version || 0);

  const businessDate = normalizeTrimmedString(payload.businessDate || payload.business_date);
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return asSyncError('rejected_validation', 'day_close businessDate must be YYYY-MM-DD.');
  }

  const existingById = await findByServerOrClientId(DayClose, { userId, refId: changeId });
  const existingByDate = await DayClose.findOne({ userId, businessDate, deletedAt: null });
  const existing = existingById || existingByDate;

  if (changeType === 'delete') {
    if (!existing) {
      return { status: 'applied', serverVersion: null, serverId: null };
    }

    return asSyncError(
      'rejected_business_rule',
      'day_close deletion is not supported to preserve close history integrity.'
    );
  }

  const openingBalance = parseMoney(payload.openingBalance ?? payload.opening_balance ?? 0);
  const totalIn = parseMoney(payload.totalIn ?? payload.total_in ?? 0);
  const totalOut = parseMoney(payload.totalOut ?? payload.total_out ?? 0);
  const closingBalance = parseMoney(payload.closingBalance ?? payload.closing_balance ?? 0);
  const cashOnHand = payload.cashOnHand === null || payload.cashOnHand === undefined
    ? null
    : parseMoney(payload.cashOnHand);
  const variance = payload.variance === null || payload.variance === undefined
    ? null
    : parseMoney(payload.variance);

  if (
    openingBalance === null
    || openingBalance < 0
    || totalIn === null
    || totalIn < 0
    || totalOut === null
    || totalOut < 0
    || closingBalance === null
  ) {
    return asSyncError('rejected_validation', 'Invalid day_close amount payload.');
  }

  if ((payload.cashOnHand !== null && payload.cashOnHand !== undefined && cashOnHand === null)
    || (payload.variance !== null && payload.variance !== undefined && variance === null)) {
    return asSyncError('rejected_validation', 'Invalid day_close cashOnHand or variance payload.');
  }

  if (existing) {
    const serverVersion = Number(existing.serverVersion || existing.version || 1);
    if (expectedVersion > 0 && expectedVersion < serverVersion) {
      const latest = serializeDayClose(existing);
      return asSyncError('conflict_requires_client_resolution', 'Day close version conflict.', latest);
    }

    existing.businessDate = businessDate;
    existing.openingBalance = openingBalance;
    existing.totalIn = totalIn;
    existing.totalOut = totalOut;
    existing.closingBalance = closingBalance;
    existing.cashOnHand = cashOnHand;
    existing.variance = variance;
    existing.status = normalizeDayCloseStatus(payload.status);
    existing.note = normalizeTrimmedString(payload.note) || null;
    existing.closedAt = parseOptionalDate(payload.closedAt || payload.closed_at) || existing.closedAt || new Date();
    existing.deletedAt = null;
    existing.isArchived = false;
    existing.lastClientMutationAt = clientMutationAt;
    existing.serverVersion = serverVersion + 1;
    existing.version = Number(existing.version || 1) + 1;
    if (!existing.clientRefId && changeId) {
      existing.clientRefId = changeId;
    }

    await existing.save();

    const serialized = serializeDayClose(existing);
    await appendChange({
      userId,
      entityType: 'day_close',
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

  const created = await DayClose.create({
    userId,
    clientRefId: changeId || null,
    businessDate,
    openingBalance,
    totalIn,
    totalOut,
    closingBalance,
    cashOnHand,
    variance,
    status: normalizeDayCloseStatus(payload.status),
    note: normalizeTrimmedString(payload.note) || null,
    closedAt: parseOptionalDate(payload.closedAt || payload.closed_at) || new Date(),
    serverVersion: 1,
    version: 1,
    lastClientMutationAt: clientMutationAt,
  });

  const serialized = serializeDayClose(created);
  await appendChange({
    userId,
    entityType: 'day_close',
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

  if (entity === 'baki_entry') {
    return applyBakiEntryChange({ userId, change });
  }

  if (entity === 'collection_reminder') {
    return applyCollectionReminderChange({ userId, change });
  }

  if (entity === 'payment_promise') {
    return applyPaymentPromiseChange({ userId, change });
  }

  if (entity === 'inventory_movement') {
    return applyInventoryMovementChange({ userId, change });
  }

  if (entity === 'transaction') {
    return applyTransactionChange({ userId, change });
  }

  if (entity === 'sales_header') {
    return applySalesHeaderChange({ userId, change });
  }

  if (entity === 'sales_item') {
    return applySalesItemChange({ userId, change });
  }

  if (entity === 'payment') {
    return applyPaymentChange({ userId, change });
  }

  if (entity === 'sales_return') {
    return applySalesReturnChange({ userId, change });
  }

  if (entity === 'supplier') {
    return applySupplierChange({ userId, change });
  }

  if (entity === 'purchase_order') {
    return applyPurchaseOrderChange({ userId, change });
  }

  if (entity === 'purchase_item') {
    return applyPurchaseItemChange({ userId, change });
  }

  if (entity === 'supplier_payable') {
    return applySupplierPayableChange({ userId, change });
  }

  if (entity === 'inventory_batch') {
    return applyInventoryBatchChange({ userId, change });
  }

  if (entity === 'cycle_count') {
    return applyCycleCountChange({ userId, change });
  }

  if (entity === 'alert') {
    return applyInventoryAlertChange({ userId, change });
  }

  if (entity === 'expense_entry') {
    return applyExpenseEntryChange({ userId, change });
  }

  if (entity === 'cashbook_entry') {
    return applyCashbookEntryChange({ userId, change });
  }

  if (entity === 'day_close') {
    return applyDayCloseChange({ userId, change });
  }

  return asSyncError('rejected_validation', `Unsupported entity: ${entity || 'unknown'}.`);
};

const applyChangeWithIdempotency = async ({ userId, change, authContext = {} }) => {
  const entity = normalizeEntity(change?.entity);
  const type = normalizeType(change?.type || 'upsert');
  const idempotencyKey = parseRequiredIdempotencyKey(change);

  if (!idempotencyKey) {
    return asSyncError('rejected_validation', 'idempotencyKey is required and must be <= 128 characters.');
  }

  const routeKey = buildRouteKey({ entity, type });
  const payloadHash = buildPayloadHash(change || {});
  const role = authContext?.role;

  const existing = await findRecord({ userId, key: idempotencyKey, routeKey });
  if (existing) {
    ensureNotConflictingReplay({ existing, payloadHash });
    const replay = existing.responseBody || {};
    return {
      ...replay,
      status: replay.status === 'applied' ? 'duplicate_applied' : replay.status,
    };
  }

  const requiredAction = resolvePermissionActionForChange(change);
  if (requiredAction && !checkPermission(role, requiredAction)) {
    return asSyncError('rejected_forbidden', `Missing permission: ${requiredAction}.`);
  }

  const approvalRequirement = await resolveApprovalRequirementForChange({ userId, change });
  if (approvalRequirement && !checkPermission(role, approvalRequirement.approveAction)) {
    const canRequestApproval = checkPermission(role, approvalRequirement.requestAction)
      || checkPermission(role, ACTIONS.APPROVAL_REQUEST_CREATE);

    if (!canRequestApproval) {
      return asSyncError(
        'rejected_forbidden',
        `Missing permission: ${approvalRequirement.requestAction}.`
      );
    }

    const approvalRequest = await createPendingApprovalRequest({
      userId,
      actorUserId: String(authContext?.actor_user_id || authContext?.user_id || userId),
      branchId: authContext?.branch_id || null,
      actionType: approvalRequirement.actionType,
      reason: approvalRequirement.reason,
      change,
    });

    const pendingResult = {
      status: 'pending_approval',
      serverVersion: null,
      serverId: null,
      conflict: null,
      message: approvalRequirement.reason,
      approvalRequestId: String(approvalRequest._id),
    };

    await writeRecord({
      userId,
      key: idempotencyKey,
      routeKey,
      payloadHash,
      statusCode: 200,
      responseBody: pendingResult,
    });

    return pendingResult;
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

  const [
    products,
    customers,
    bakiEntries,
    collectionReminders,
    paymentPromises,
    movements,
    transactions,
    salesHeaders,
    salesItems,
    payments,
    salesReturns,
    suppliers,
    purchaseOrders,
    purchaseItems,
    supplierPayables,
    inventoryBatches,
    cycleCounts,
    alerts,
    expenseEntries,
    cashbookEntries,
    dayCloses,
  ] = await Promise.all([
    Product.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Customer.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    BakiEntry.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    CreditReminder.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    PaymentPromise.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    InventoryMovement.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Transaction.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    SalesHeader.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    SalesItem.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Payment.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    SalesReturn.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    Supplier.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    PurchaseOrder.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    PurchaseItem.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    SupplierPayable.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    InventoryBatch.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    CycleCount.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    InventoryAlert.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    ExpenseEntry.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    CashbookEntry.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
    DayClose.find({ userId, ...updatedFilter }).sort({ updatedAt: 1, _id: 1 }).limit(limit).lean(),
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

  for (const row of collectionReminders) {
    const serialized = serializeCollectionReminder(row);
    all.push({
      entity: 'collection_reminder',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of paymentPromises) {
    const serialized = serializePaymentPromise(row);
    all.push({
      entity: 'payment_promise',
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

  for (const row of salesHeaders) {
    const serialized = serializeSalesHeader(row);
    all.push({
      entity: 'sales_header',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of salesItems) {
    const serialized = serializeSalesItem(row);
    all.push({
      entity: 'sales_item',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of payments) {
    const serialized = serializePayment(row);
    all.push({
      entity: 'payment',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of salesReturns) {
    const serialized = serializeSalesReturn(row);
    all.push({
      entity: 'sales_return',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of suppliers) {
    const serialized = serializeSupplier(row);
    all.push({
      entity: 'supplier',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of purchaseOrders) {
    const serialized = serializePurchaseOrder(row);
    all.push({
      entity: 'purchase_order',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of purchaseItems) {
    const serialized = serializePurchaseItem(row);
    all.push({
      entity: 'purchase_item',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of supplierPayables) {
    const serialized = serializeSupplierPayable(row);
    all.push({
      entity: 'supplier_payable',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of inventoryBatches) {
    const serialized = serializeInventoryBatch(row);
    all.push({
      entity: 'inventory_batch',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of cycleCounts) {
    const serialized = serializeCycleCount(row);
    all.push({
      entity: 'cycle_count',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of alerts) {
    const serialized = serializeInventoryAlert(row);
    all.push({
      entity: 'alert',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of expenseEntries) {
    const serialized = serializeExpenseEntry(row);
    all.push({
      entity: 'expense_entry',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of cashbookEntries) {
    const serialized = serializeCashbookEntry(row);
    all.push({
      entity: 'cashbook_entry',
      type: serialized.deleted ? 'delete' : 'upsert',
      id: serialized.id,
      serverId: serialized.serverId,
      data: serialized.data,
      version: serialized.version,
      updatedAt: serialized.updatedAt,
    });
  }

  for (const row of dayCloses) {
    const serialized = serializeDayClose(row);
    all.push({
      entity: 'day_close',
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

  const ack = [];

  for (const change of changes) {
    const id = normalizeTrimmedString(change?.id) || null;
    const entity = normalizeEntity(change?.entity);

    try {
      const result = await applyChangeWithIdempotency({
        userId,
        change,
        authContext: req.auth || {},
      });
      ack.push({
        id,
        entity,
        status: result.status || 'applied',
        serverVersion: result.serverVersion || null,
        serverId: result.serverId || null,
        conflict: result.conflict || null,
        message: result.message || null,
        approvalRequestId: result.approvalRequestId || null,
      });
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

  return success(req, res, {
    clientId,
    ack,
    serverChanges: serverDelta.items,
    serverTime,
    nextSyncAt: serverTime,
    hasMoreServerChanges: serverDelta.hasMore,
  });
});

const executeApprovedSyncChange = async ({ tenantUserId, change }) => {
  if (!tenantUserId || !change) {
    throw badRequest('tenantUserId and change are required to execute approved sync action.');
  }

  return applyChange({
    userId: String(tenantUserId),
    change,
  });
};

module.exports = {
  syncUnified,
  executeApprovedSyncChange,
};
