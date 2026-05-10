import db, {
  getLastSyncAt,
  getPendingSyncItems,
  markPendingSyncItemDone,
  markPendingSyncItemFailed,
  setLastSyncAt,
} from '../../database/db';
import { syncOnline } from '../backend/syncApi';

const MUTATION_ENTITY_TYPES = [
  'product',
  'customer',
  'baki_entry',
  'collection_reminder',
  'payment_promise',
  'baki',
  'baki_transaction',
  'inventory_movement',
  'stock_movement',
  'transaction',
  'sales_header',
  'sales_item',
  'payment',
  'sales_return',
  'supplier',
  'purchase_order',
  'purchase_item',
  'supplier_payable',
  'inventory_batch',
  'cycle_count',
  'alert',
  'expense_entry',
  'cashbook_entry',
  'day_close',
];

const PAYLOAD_TOO_LARGE_ERROR_MARKER = '[PAYLOAD_TOO_LARGE]';
const MAX_OUTBOUND_CHUNK_ITEMS = 15;
const MAX_OUTBOUND_CHUNK_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60 * 1000;
let syncRateLimitedUntilMs = 0;

const summarizePendingByEntity = (rows = []) => {
  const summary = {};
  for (const row of rows) {
    const entity = String(row?.entity_type || '').trim().toLowerCase() || 'unknown';
    summary[entity] = (summary[entity] || 0) + 1;
  }

  return summary;
};

const getLocalSyncDiagnostics = async ({ userId }) => {
  const [customersRow, bakiRow, pendingRows, unsyncedCustomersRow, unsyncedBakiRow, errorRows] = await Promise.all([
    db.getFirstAsync(`SELECT COUNT(*) AS total FROM customers WHERE user_id = ?;`, userId),
    db.getFirstAsync(`SELECT COUNT(*) AS total FROM baki_transactions WHERE user_id = ?;`, userId),
    db.getAllAsync(
      `SELECT entity_type
       FROM pending_sync_queue
       WHERE user_id IS NULL OR user_id = ?;`,
      userId
    ),
    db.getFirstAsync(
      `SELECT COUNT(*) AS total
       FROM customers
       WHERE user_id = ?
         AND deleted_at IS NULL
         AND (server_id IS NULL OR TRIM(server_id) = '');`,
      userId
    ),
    db.getFirstAsync(
      `SELECT COUNT(*) AS total
       FROM baki_transactions
       WHERE user_id = ?
         AND deleted_at IS NULL
         AND (server_id IS NULL OR TRIM(server_id) = '');`,
      userId
    ),
    db.getAllAsync(
      `SELECT id, entity_type, operation, attempts, last_error
       FROM pending_sync_queue
       WHERE (user_id IS NULL OR user_id = ?)
         AND last_error IS NOT NULL
       ORDER BY datetime(updated_at) DESC, id DESC
       LIMIT 5;`,
      userId
    ),
  ]);

  return {
    userId,
    localCounts: {
      customers: Number(customersRow?.total || 0),
      bakiTransactions: Number(bakiRow?.total || 0),
    },
    pendingQueue: {
      total: Array.isArray(pendingRows) ? pendingRows.length : 0,
      byEntity: summarizePendingByEntity(pendingRows),
      recentErrors: Array.isArray(errorRows)
        ? errorRows.map((row) => ({
            id: Number(row.id),
            entity: String(row.entity_type || ''),
            operation: String(row.operation || ''),
            attempts: Number(row.attempts || 0),
            message: row.last_error || null,
          }))
        : [],
    },
    unsyncedLocalRows: {
      customersWithoutServerId: Number(unsyncedCustomersRow?.total || 0),
      bakiWithoutServerId: Number(unsyncedBakiRow?.total || 0),
    },
  };
};

const normalizeOutboundEntity = (value) => {
  const entity = String(value || '').trim().toLowerCase();

  if (entity === 'baki' || entity === 'baki_transaction') {
    return 'baki_entry';
  }

  if (entity === 'stock_movement') {
    return 'inventory_movement';
  }

  if (entity === 'inventory_alert') {
    return 'alert';
  }

  if (entity === 'expense') {
    return 'expense_entry';
  }

  if (entity === 'credit_reminder' || entity === 'reminder') {
    return 'collection_reminder';
  }

  if (entity === 'payment_promises') {
    return 'payment_promise';
  }

  return entity;
};

const toMovementTypeLocal = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'stock_in' || normalized === 'in') {
    return 'in';
  }

  if (normalized === 'stock_out' || normalized === 'out' || normalized === 'expiry_removal') {
    return 'out';
  }

  return 'adjust';
};

const buildOutboundChange = (item) => {
  const payload = item?.payload || {};
  const data = payload?.data || {};
  const operation = String(item?.operation || '').trim().toLowerCase();
  const isDelete = operation === 'delete' || operation === 'remove';
  const effectiveId = String(payload.serverId || payload.clientRefId || payload.id || '').trim();

  if (!effectiveId) {
    return null;
  }

  return {
    entity: normalizeOutboundEntity(item?.entity_type),
    type: isDelete ? 'delete' : 'upsert',
    id: effectiveId,
    data,
    version: Number(payload.version || 1),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    idempotencyKey: String(payload.idempotencyKey || '').trim(),
  };
};

const estimateJsonBytes = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const buildSizedChunk = ({ outboundEntries = [], startIndex = 0 } = {}) => {
  const chunkEntries = [];
  let bytes = 0;
  let cursor = Number(startIndex) || 0;

  while (cursor < outboundEntries.length && chunkEntries.length < MAX_OUTBOUND_CHUNK_ITEMS) {
    const entry = outboundEntries[cursor];
    const changeBytes = estimateJsonBytes(entry?.change);
    const wouldExceed = (bytes + changeBytes) > MAX_OUTBOUND_CHUNK_BYTES;

    if (chunkEntries.length > 0 && wouldExceed) {
      break;
    }

    chunkEntries.push(entry);
    bytes += changeBytes;
    cursor += 1;

    if (wouldExceed) {
      break;
    }
  }

  return {
    chunkEntries,
    nextCursor: cursor,
    chunkBytes: bytes,
  };
};

const findLocalCustomerId = async ({ userId, customerServerId = null, customerClientRefId = null }) => {
  if (customerServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM customers WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(customerServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (customerClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM customers WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(customerClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalProductId = async ({ userId, productServerId = null, productClientRefId = null }) => {
  if (productServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM products WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(productServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (productClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM products WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(productClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalSalesHeaderId = async ({ userId, salesHeaderServerId = null, salesHeaderClientRefId = null }) => {
  if (salesHeaderServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM sales_header WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(salesHeaderServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (salesHeaderClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM sales_header WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(salesHeaderClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalSalesItemId = async ({ userId, salesItemServerId = null, salesItemClientRefId = null }) => {
  if (salesItemServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM sales_items WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(salesItemServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (salesItemClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM sales_items WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(salesItemClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalSupplierId = async ({ userId, supplierServerId = null, supplierClientRefId = null }) => {
  if (supplierServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM suppliers WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(supplierServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (supplierClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM suppliers WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(supplierClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalPurchaseOrderId = async ({ userId, purchaseOrderServerId = null, purchaseOrderClientRefId = null }) => {
  if (purchaseOrderServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM purchase_orders WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(purchaseOrderServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (purchaseOrderClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM purchase_orders WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(purchaseOrderClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const findLocalBakiEntryId = async ({ userId, bakiEntryServerId = null, bakiEntryClientRefId = null }) => {
  if (bakiEntryServerId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM baki_transactions WHERE user_id = ? AND server_id = ? LIMIT 1;`,
      userId,
      String(bakiEntryServerId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  if (bakiEntryClientRefId) {
    const row = await db.getFirstAsync(
      `SELECT id FROM baki_transactions WHERE user_id = ? AND client_ref_id = ? LIMIT 1;`,
      userId,
      String(bakiEntryClientRefId)
    );
    if (row?.id) {
      return Number(row.id);
    }
  }

  return null;
};

const upsertProductFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM products WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM products WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const nextExpiry = data.expiryDate ? String(data.expiryDate) : null;
  const nextQuantity = Number.isFinite(Number(data.quantity)) ? Number(data.quantity) : 0;
  const nextPrice = Number.isFinite(Number(data.price)) ? Number(data.price) : 0;
  const nextThreshold = Number.isFinite(Number(data.lowStockThreshold)) ? Number(data.lowStockThreshold) : 5;
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE products
       SET name = ?, quantity = ?, price = ?, expiry_date = ?, low_stock_threshold = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      String(data.name || ''),
      nextQuantity,
      nextPrice,
      nextExpiry,
      nextThreshold,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO products (
      user_id, name, quantity, price, expiry_date, low_stock_threshold,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    userId,
    String(data.name || ''),
    nextQuantity,
    nextPrice,
    nextExpiry,
    nextThreshold,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt
  );
};

const upsertCustomerFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM customers WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM customers WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();
  const nextCreditLimit = Number.isFinite(Number(data.creditLimit)) && Number(data.creditLimit) >= 0
    ? Number(data.creditLimit)
    : 0;
  const nextCurrentBalance = Number.isFinite(Number(data.currentBalance)) && Number(data.currentBalance) >= 0
    ? Number(data.currentBalance)
    : 0;
  const nextRiskLevel = ['low', 'medium', 'high'].includes(String(data.riskLevel || '').trim().toLowerCase())
    ? String(data.riskLevel).trim().toLowerCase()
    : 'low';
  const nextDueTermsDays = Number.isInteger(Number(data.dueTermsDays)) && Number(data.dueTermsDays) > 0
    ? Math.min(365, Number(data.dueTermsDays))
    : 30;
  const nextLastPaymentDate = data.lastPaymentDate ? String(data.lastPaymentDate) : null;

  if (existing?.id) {
    await db.runAsync(
      `UPDATE customers
       SET name = ?, phone = ?, address = ?,
           credit_limit = ?, current_balance = ?, risk_level = ?, due_terms_days = ?, last_payment_date = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?;`,
      String(data.name || ''),
      data.phone ? String(data.phone) : null,
      data.address ? String(data.address) : null,
      nextCreditLimit,
      nextCurrentBalance,
      nextRiskLevel,
      nextDueTermsDays,
      nextLastPaymentDate,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO customers (
      user_id, name, phone, address, credit_limit, current_balance, risk_level, due_terms_days, last_payment_date,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'));`,
    userId,
    String(data.name || ''),
    data.phone ? String(data.phone) : null,
    data.address ? String(data.address) : null,
    nextCreditLimit,
    nextCurrentBalance,
    nextRiskLevel,
    nextDueTermsDays,
    nextLastPaymentDate,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt
  );
};

const upsertBakiFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM baki_transactions WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localCustomerId = await findLocalCustomerId({
    userId,
    customerServerId: data.customerServerId,
    customerClientRefId: data.customerClientRefId,
  });

  if (!localCustomerId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM baki_transactions WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const amountCents = Math.round(Number(data.amount || 0) * 100);
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();
  const normalizedStatus = ['open', 'paid', 'overdue'].includes(String(data.status || '').trim().toLowerCase())
    ? String(data.status).trim().toLowerCase()
    : (String(data.type || 'credit').trim().toLowerCase() === 'payment' ? 'paid' : 'open');

  if (existing?.id) {
    await db.runAsync(
      `UPDATE baki_transactions
       SET customer_id = ?, type = ?, amount_cents = ?, due_date = ?, status = ?, reference_id = ?, reminder_sent_at = ?, resolved_at = ?, note = ?, payment_method = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localCustomerId,
      String(data.type || 'credit'),
      amountCents,
      data.dueDate ? String(data.dueDate) : null,
      normalizedStatus,
      data.referenceId ? String(data.referenceId) : null,
      data.reminderSentAt ? String(data.reminderSentAt) : null,
      data.resolvedAt ? String(data.resolvedAt) : null,
      data.note ? String(data.note) : null,
      data.paymentMethod ? String(data.paymentMethod) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO baki_transactions (
      user_id, customer_id, type, amount_cents, due_date, status, reference_id, reminder_sent_at, resolved_at, note, payment_method,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localCustomerId,
    String(data.type || 'credit'),
    amountCents,
    data.dueDate ? String(data.dueDate) : null,
    normalizedStatus,
    data.referenceId ? String(data.referenceId) : null,
    data.reminderSentAt ? String(data.reminderSentAt) : null,
    data.resolvedAt ? String(data.resolvedAt) : null,
    data.note ? String(data.note) : null,
    data.paymentMethod ? String(data.paymentMethod) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.occurredAt ? String(data.occurredAt) : null
  );
};

const upsertCollectionReminderFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM collection_reminders WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localCustomerId = await findLocalCustomerId({
    userId,
    customerServerId: data.customerServerId,
    customerClientRefId: data.customerClientRefId,
  });

  if (!localCustomerId) {
    return;
  }

  const localBakiEntryId = await findLocalBakiEntryId({
    userId,
    bakiEntryServerId: data.bakiEntryServerId,
    bakiEntryClientRefId: data.bakiEntryClientRefId,
  });

  const existing = await db.getFirstAsync(
    `SELECT id FROM collection_reminders WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE collection_reminders
       SET customer_id = ?, baki_transaction_id = ?, channel = ?, message = ?, sent_at = ?, status = ?, reference_id = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localCustomerId,
      localBakiEntryId,
      String(data.channel || 'manual').trim().toLowerCase(),
      data.message ? String(data.message) : null,
      data.sentAt ? String(data.sentAt) : nextUpdatedAt,
      String(data.status || 'sent').trim().toLowerCase(),
      data.referenceId ? String(data.referenceId) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
  } else {
    await db.runAsync(
      `INSERT INTO collection_reminders (
        user_id, customer_id, baki_transaction_id, channel, message, sent_at, status, reference_id,
        server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
      userId,
      localCustomerId,
      localBakiEntryId,
      String(data.channel || 'manual').trim().toLowerCase(),
      data.message ? String(data.message) : null,
      data.sentAt ? String(data.sentAt) : nextUpdatedAt,
      String(data.status || 'sent').trim().toLowerCase(),
      data.referenceId ? String(data.referenceId) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      data.sentAt ? String(data.sentAt) : nextUpdatedAt
    );
  }

  if (localBakiEntryId && data.sentAt) {
    await db.runAsync(
      `UPDATE baki_transactions
       SET reminder_sent_at = ?
       WHERE id = ? AND user_id = ?;`,
      String(data.sentAt),
      localBakiEntryId,
      userId
    );
  }
};

const upsertPaymentPromiseFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM payment_promises WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localCustomerId = await findLocalCustomerId({
    userId,
    customerServerId: data.customerServerId,
    customerClientRefId: data.customerClientRefId,
  });

  if (!localCustomerId) {
    return;
  }

  const localFulfilledBakiId = await findLocalBakiEntryId({
    userId,
    bakiEntryServerId: data.fulfilledByEntryServerId,
    bakiEntryClientRefId: data.fulfilledByEntryClientRefId,
  });

  const existing = await db.getFirstAsync(
    `SELECT id FROM payment_promises WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();
  const promisedAmountCents = Math.max(0, Math.round(Number(data.promisedAmount || 0) * 100));

  if (existing?.id) {
    await db.runAsync(
      `UPDATE payment_promises
       SET customer_id = ?, promised_amount_cents = ?, promise_date = ?, status = ?, note = ?, fulfilled_baki_transaction_id = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      localCustomerId,
      promisedAmountCents,
      data.promiseDate ? String(data.promiseDate) : nextUpdatedAt,
      String(data.status || 'pending').trim().toLowerCase(),
      data.note ? String(data.note) : null,
      localFulfilledBakiId,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO payment_promises (
      user_id, customer_id, promised_amount_cents, promise_date, status, note, fulfilled_baki_transaction_id,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    localCustomerId,
    promisedAmountCents,
    data.promiseDate ? String(data.promiseDate) : nextUpdatedAt,
    String(data.status || 'pending').trim().toLowerCase(),
    data.note ? String(data.note) : null,
    localFulfilledBakiId,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.promiseDate ? String(data.promiseDate) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertMovementFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM stock_movements WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM stock_movements WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const quantityDelta = Number(data.quantityDelta || 0);
  const quantityBefore = Number(data.quantityBefore || 0);
  const quantityAfter = Number(data.quantityAfter || 0);
  const stockOutReason = data.stockOutReason ? String(data.stockOutReason).toUpperCase() : null;
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE stock_movements
       SET product_id = ?, movement_type = ?, stock_out_reason = ?, quantity_delta = ?, quantity_before = ?, quantity_after = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localProductId,
      toMovementTypeLocal(data.movementType),
      stockOutReason,
      quantityDelta,
      quantityBefore,
      quantityAfter,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO stock_movements (
      user_id, product_id, movement_type, stock_out_reason, quantity_delta, quantity_before, quantity_after, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localProductId,
    toMovementTypeLocal(data.movementType),
    stockOutReason,
    quantityDelta,
    quantityBefore,
    quantityAfter,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.occurredAt ? String(data.occurredAt) : null
  );
};

const upsertSalesHeaderFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM sales_header WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM sales_header WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const customerId = await findLocalCustomerId({
    userId,
    customerServerId: data.customerServerId,
    customerClientRefId: data.customerClientRefId,
  });

  const totalAmountCents = Math.max(0, Math.round(Number(data.totalAmount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE sales_header
       SET receipt_id = ?, customer_id = ?, timestamp = ?, total_amount_cents = ?, payment_mode = ?, status = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      String(data.receiptId || data.receipt_id || ''),
      customerId,
      data.timestamp ? String(data.timestamp) : nextUpdatedAt,
      totalAmountCents,
      String(data.paymentMode || data.payment_mode || 'CASH').toUpperCase(),
      String(data.status || 'posted').toLowerCase(),
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO sales_header (
      user_id, receipt_id, customer_id, timestamp, total_amount_cents, payment_mode, status, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    String(data.receiptId || data.receipt_id || ''),
    customerId,
    data.timestamp ? String(data.timestamp) : nextUpdatedAt,
    totalAmountCents,
    String(data.paymentMode || data.payment_mode || 'CASH').toUpperCase(),
    String(data.status || 'posted').toLowerCase(),
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.timestamp ? String(data.timestamp) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertSalesItemFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM sales_items WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localSalesHeaderId = await findLocalSalesHeaderId({
    userId,
    salesHeaderServerId: data.salesHeaderServerId,
    salesHeaderClientRefId: data.salesHeaderClientRefId,
  });

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localSalesHeaderId || !localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM sales_items WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const quantity = Math.max(0, Math.trunc(Number(data.quantity || 0)));
  const unitPriceCents = Math.max(0, Math.round(Number(data.unitPrice || 0) * 100));
  const subtotalCents = Math.max(0, Math.round(Number(data.subtotal || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE sales_items
       SET sales_header_id = ?, product_id = ?, quantity = ?, unit_price_cents = ?, subtotal_cents = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localSalesHeaderId,
      localProductId,
      quantity,
      unitPriceCents,
      subtotalCents,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO sales_items (
      user_id, sales_header_id, product_id, quantity, unit_price_cents, subtotal_cents, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localSalesHeaderId,
    localProductId,
    quantity,
    unitPriceCents,
    subtotalCents,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertPaymentFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM payments WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localSalesHeaderId = await findLocalSalesHeaderId({
    userId,
    salesHeaderServerId: data.salesHeaderServerId,
    salesHeaderClientRefId: data.salesHeaderClientRefId,
  });

  if (!localSalesHeaderId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM payments WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const amountCents = Math.max(0, Math.round(Number(data.amount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE payments
       SET sales_header_id = ?, amount_cents = ?, method = ?, status = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localSalesHeaderId,
      amountCents,
      String(data.method || 'CASH').toUpperCase(),
      String(data.status || 'PAID').toUpperCase(),
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO payments (
      user_id, sales_header_id, amount_cents, method, status, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localSalesHeaderId,
    amountCents,
    String(data.method || 'CASH').toUpperCase(),
    String(data.status || 'PAID').toUpperCase(),
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertSalesReturnFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM sales_returns WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localSalesItemId = await findLocalSalesItemId({
    userId,
    salesItemServerId: data.salesItemServerId,
    salesItemClientRefId: data.salesItemClientRefId,
  });

  if (!localSalesItemId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM sales_returns WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const quantity = Math.max(0, Math.trunc(Number(data.quantity || 0)));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE sales_returns
       SET sales_item_id = ?, quantity = ?, reason = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localSalesItemId,
      quantity,
      data.reason ? String(data.reason) : null,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO sales_returns (
      user_id, sales_item_id, quantity, reason, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localSalesItemId,
    quantity,
    data.reason ? String(data.reason) : null,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertSupplierFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM suppliers WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM suppliers WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const dueAmountCents = Math.max(0, Math.round(Number(data.dueAmount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE suppliers
       SET name = ?, phone = ?, address = ?, due_amount_cents = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      String(data.name || ''),
      data.phone ? String(data.phone) : null,
      data.address ? String(data.address) : null,
      dueAmountCents,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO suppliers (
      user_id, name, phone, address, due_amount_cents,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    String(data.name || ''),
    data.phone ? String(data.phone) : null,
    data.address ? String(data.address) : null,
    dueAmountCents,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertPurchaseOrderFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM purchase_orders WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localSupplierId = await findLocalSupplierId({
    userId,
    supplierServerId: data.supplierServerId,
    supplierClientRefId: data.supplierClientRefId,
  });

  if (!localSupplierId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM purchase_orders WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const totalAmountCents = Math.max(0, Math.round(Number(data.totalAmount || 0) * 100));
  const paidAmountCents = Math.max(0, Math.round(Number(data.paidAmount || 0) * 100));
  const dueAmountCents = Math.max(0, Math.round(Number(data.dueAmount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE purchase_orders
       SET supplier_id = ?, purchase_code = ?, purchase_date = ?,
           total_amount_cents = ?, paid_amount_cents = ?, due_amount_cents = ?, status = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      localSupplierId,
      String(data.purchaseCode || ''),
      data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
      totalAmountCents,
      paidAmountCents,
      dueAmountCents,
      String(data.status || 'pending').toLowerCase(),
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO purchase_orders (
      user_id, supplier_id, purchase_code, purchase_date, total_amount_cents, paid_amount_cents, due_amount_cents,
      status, note, server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    localSupplierId,
    String(data.purchaseCode || ''),
    data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
    totalAmountCents,
    paidAmountCents,
    dueAmountCents,
    String(data.status || 'pending').toLowerCase(),
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertPurchaseItemFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM purchase_items WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localPurchaseOrderId = await findLocalPurchaseOrderId({
    userId,
    purchaseOrderServerId: data.purchaseOrderServerId,
    purchaseOrderClientRefId: data.purchaseOrderClientRefId,
  });

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localPurchaseOrderId || !localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM purchase_items WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const orderedQty = Math.max(0, Math.trunc(Number(data.orderedQty || 0)));
  const receivedQty = Math.max(0, Math.trunc(Number(data.receivedQty || 0)));
  const pendingQty = Math.max(0, Math.trunc(Number(data.pendingQty || Math.max(0, orderedQty - receivedQty))));
  const unitCostCents = Math.max(0, Math.round(Number(data.unitCost || 0) * 100));
  const subtotalCents = Math.max(0, Math.round(Number(data.subtotal || orderedQty * Number(data.unitCost || 0)) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE purchase_items
       SET purchase_order_id = ?, product_id = ?, ordered_qty = ?, received_qty = ?, pending_qty = ?,
           unit_cost_cents = ?, subtotal_cents = ?, status = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      localPurchaseOrderId,
      localProductId,
      orderedQty,
      receivedQty,
      pendingQty,
      unitCostCents,
      subtotalCents,
      String(data.status || 'pending').toLowerCase(),
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO purchase_items (
      user_id, purchase_order_id, product_id, ordered_qty, received_qty, pending_qty,
      unit_cost_cents, subtotal_cents, status, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    localPurchaseOrderId,
    localProductId,
    orderedQty,
    receivedQty,
    pendingQty,
    unitCostCents,
    subtotalCents,
    String(data.status || 'pending').toLowerCase(),
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertSupplierPayableFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM supplier_payables WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localSupplierId = await findLocalSupplierId({
    userId,
    supplierServerId: data.supplierServerId,
    supplierClientRefId: data.supplierClientRefId,
  });

  if (!localSupplierId) {
    return;
  }

  const localPurchaseOrderId = await findLocalPurchaseOrderId({
    userId,
    purchaseOrderServerId: data.purchaseOrderServerId,
    purchaseOrderClientRefId: data.purchaseOrderClientRefId,
  });

  const existing = await db.getFirstAsync(
    `SELECT id FROM supplier_payables WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const amountCents = Math.max(0, Math.round(Number(data.amount || 0) * 100));
  const runningDueCents = Math.max(0, Math.round(Number(data.runningDue || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE supplier_payables
       SET supplier_id = ?, purchase_order_id = ?, entry_type = ?, amount_cents = ?, running_due_cents = ?, payment_method = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localSupplierId,
      localPurchaseOrderId,
      String(data.entryType || 'credit').toLowerCase(),
      amountCents,
      runningDueCents,
      data.paymentMethod ? String(data.paymentMethod).toUpperCase() : null,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO supplier_payables (
      user_id, supplier_id, purchase_order_id, entry_type, amount_cents, running_due_cents, payment_method, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localSupplierId,
    localPurchaseOrderId,
    String(data.entryType || 'credit').toLowerCase(),
    amountCents,
    runningDueCents,
    data.paymentMethod ? String(data.paymentMethod).toUpperCase() : null,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.occurredAt ? String(data.occurredAt) : nextUpdatedAt
  );
};

const upsertInventoryBatchFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM inventory_batches WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM inventory_batches WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const quantity = Math.max(0, Math.trunc(Number(data.quantity || 0)));
  const costPriceCents = Math.max(0, Math.round(Number(data.costPrice || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE inventory_batches
       SET product_id = ?, batch_number = ?, quantity = ?, expiry_date = ?, purchase_date = ?, cost_price_cents = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      localProductId,
      data.batchNumber ? String(data.batchNumber) : null,
      quantity,
      data.expiryDate ? String(data.expiryDate) : null,
      data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
      costPriceCents,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO inventory_batches (
      user_id, product_id, batch_number, quantity, expiry_date, purchase_date, cost_price_cents,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    localProductId,
    data.batchNumber ? String(data.batchNumber) : null,
    quantity,
    data.expiryDate ? String(data.expiryDate) : null,
    data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
    costPriceCents,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.purchaseDate ? String(data.purchaseDate) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertCycleCountFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM cycle_counts WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM cycle_counts WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const systemQuantity = Math.max(0, Math.trunc(Number(data.systemQuantity || 0)));
  const physicalQuantity = Math.max(0, Math.trunc(Number(data.physicalQuantity || 0)));
  const variance = Math.trunc(Number(data.variance || (physicalQuantity - systemQuantity)));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE cycle_counts
       SET product_id = ?, system_quantity = ?, physical_quantity = ?, variance = ?, timestamp = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localProductId,
      systemQuantity,
      physicalQuantity,
      variance,
      data.timestamp ? String(data.timestamp) : nextUpdatedAt,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO cycle_counts (
      user_id, product_id, system_quantity, physical_quantity, variance, timestamp, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localProductId,
    systemQuantity,
    physicalQuantity,
    variance,
    data.timestamp ? String(data.timestamp) : nextUpdatedAt,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.timestamp ? String(data.timestamp) : nextUpdatedAt
  );
};

const upsertAlertFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM alerts WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const localProductId = await findLocalProductId({
    userId,
    productServerId: data.productServerId,
    productClientRefId: data.productClientRefId,
  });

  if (!localProductId) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM alerts WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const alertType = String(data.alertType || 'LOW_STOCK').trim().toUpperCase();
  const severity = String(data.severity || 'medium').trim().toLowerCase();
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();
  const active = data.isActive === undefined ? true : Boolean(data.isActive);

  if (existing?.id) {
    await db.runAsync(
      `UPDATE alerts
       SET product_id = ?, alert_key = ?, alert_type = ?, message = ?, severity = ?, is_active = ?, resolved_at = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = ?, updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      localProductId,
      `${alertType}:${localProductId}`,
      alertType,
      String(data.message || ''),
      severity,
      active ? 1 : 0,
      active ? null : nextUpdatedAt,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      active ? null : nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO alerts (
      user_id, product_id, alert_key, alert_type, message, severity, is_active, resolved_at,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    localProductId,
    `${alertType}:${localProductId}`,
    alertType,
    String(data.message || ''),
    severity,
    active ? 1 : 0,
    active ? null : nextUpdatedAt,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    active ? null : nextUpdatedAt,
    nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertExpenseEntryFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM expenses WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM expenses WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const amountCents = Math.max(0, Math.round(Number(data.amount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE expenses
       SET expense_date = ?, category = ?, title = ?, amount_cents = ?, payment_method = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      data.expenseDate ? String(data.expenseDate) : nextUpdatedAt,
      String(data.category || 'GENERAL').trim().toUpperCase(),
      String(data.title || 'Expense'),
      amountCents,
      data.paymentMethod ? String(data.paymentMethod).trim().toUpperCase() : null,
      data.note ? String(data.note) : null,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO expenses (
      user_id, expense_date, category, title, amount_cents, payment_method, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    data.expenseDate ? String(data.expenseDate) : nextUpdatedAt,
    String(data.category || 'GENERAL').trim().toUpperCase(),
    String(data.title || 'Expense'),
    amountCents,
    data.paymentMethod ? String(data.paymentMethod).trim().toUpperCase() : null,
    data.note ? String(data.note) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.expenseDate ? String(data.expenseDate) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertCashbookEntryFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM cashbook_entries WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM cashbook_entries WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const amountCents = Math.max(0, Math.round(Number(data.amount || 0) * 100));
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE cashbook_entries
       SET entry_type = ?, category = ?, amount_cents = ?, payment_method = ?,
           reference_type = ?, reference_local_id = ?, reference_client_ref_id = ?, note = ?, occurred_at = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      String(data.entryType || 'IN').trim().toUpperCase(),
      String(data.category || 'GENERAL').trim().toUpperCase(),
      amountCents,
      data.paymentMethod ? String(data.paymentMethod).trim().toUpperCase() : null,
      data.referenceType ? String(data.referenceType).trim().toLowerCase() : null,
      Number.isInteger(Number(data.referenceLocalId)) ? Number(data.referenceLocalId) : null,
      data.referenceClientRefId ? String(data.referenceClientRefId) : null,
      data.note ? String(data.note) : null,
      data.occurredAt ? String(data.occurredAt) : nextUpdatedAt,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO cashbook_entries (
      user_id, entry_type, category, amount_cents, payment_method,
      reference_type, reference_local_id, reference_client_ref_id, note, occurred_at,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    String(data.entryType || 'IN').trim().toUpperCase(),
    String(data.category || 'GENERAL').trim().toUpperCase(),
    amountCents,
    data.paymentMethod ? String(data.paymentMethod).trim().toUpperCase() : null,
    data.referenceType ? String(data.referenceType).trim().toLowerCase() : null,
    Number.isInteger(Number(data.referenceLocalId)) ? Number(data.referenceLocalId) : null,
    data.referenceClientRefId ? String(data.referenceClientRefId) : null,
    data.note ? String(data.note) : null,
    data.occurredAt ? String(data.occurredAt) : nextUpdatedAt,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.occurredAt ? String(data.occurredAt) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const upsertDayCloseFromServer = async ({ userId, change }) => {
  const data = change?.data || {};
  const serverId = String(change?.serverId || data.serverId || '').trim();
  const clientRefId = String(data.clientRefId || change?.id || '').trim() || null;

  if (change?.type === 'delete') {
    await db.runAsync(
      `DELETE FROM day_closes WHERE user_id = ? AND (server_id = ? OR client_ref_id = ?);`,
      userId,
      serverId || '__none__',
      clientRefId || '__none__'
    );
    return;
  }

  const businessDate = String(data.businessDate || '').trim();
  if (!businessDate) {
    return;
  }

  const existing = await db.getFirstAsync(
    `SELECT id FROM day_closes WHERE user_id = ? AND (business_date = ? OR server_id = ? OR client_ref_id = ?) LIMIT 1;`,
    userId,
    businessDate,
    serverId || '__none__',
    clientRefId || '__none__'
  );

  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE day_closes
       SET business_date = ?, opening_balance_cents = ?, total_in_cents = ?, total_out_cents = ?, closing_balance_cents = ?,
           cash_on_hand_cents = ?, variance_cents = ?, status = ?, note = ?, closed_at = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = COALESCE(?, datetime('now'))
       WHERE id = ? AND user_id = ?;`,
      businessDate,
      Math.round(Number(data.openingBalance || 0) * 100),
      Math.round(Number(data.totalIn || 0) * 100),
      Math.round(Number(data.totalOut || 0) * 100),
      Math.round(Number(data.closingBalance || 0) * 100),
      data.cashOnHand === null || data.cashOnHand === undefined ? null : Math.round(Number(data.cashOnHand || 0) * 100),
      data.variance === null || data.variance === undefined ? null : Math.round(Number(data.variance || 0) * 100),
      String(data.status || 'closed').trim().toLowerCase(),
      data.note ? String(data.note) : null,
      data.closedAt ? String(data.closedAt) : nextUpdatedAt,
      serverId || null,
      clientRefId,
      nextVersion,
      nextUpdatedAt,
      nextUpdatedAt,
      Number(existing.id),
      userId
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO day_closes (
      user_id, business_date, opening_balance_cents, total_in_cents, total_out_cents, closing_balance_cents,
      cash_on_hand_cents, variance_cents, status, note, closed_at,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')));`,
    userId,
    businessDate,
    Math.round(Number(data.openingBalance || 0) * 100),
    Math.round(Number(data.totalIn || 0) * 100),
    Math.round(Number(data.totalOut || 0) * 100),
    Math.round(Number(data.closingBalance || 0) * 100),
    data.cashOnHand === null || data.cashOnHand === undefined ? null : Math.round(Number(data.cashOnHand || 0) * 100),
    data.variance === null || data.variance === undefined ? null : Math.round(Number(data.variance || 0) * 100),
    String(data.status || 'closed').trim().toLowerCase(),
    data.note ? String(data.note) : null,
    data.closedAt ? String(data.closedAt) : nextUpdatedAt,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.closedAt ? String(data.closedAt) : nextUpdatedAt,
    nextUpdatedAt
  );
};

const applyServerChange = async ({ userId, change }) => {
  const entity = String(change?.entity || '').trim().toLowerCase();

  if (entity === 'product') {
    await upsertProductFromServer({ userId, change });
    return;
  }

  if (entity === 'customer') {
    await upsertCustomerFromServer({ userId, change });
    return;
  }

  if (entity === 'baki_entry') {
    await upsertBakiFromServer({ userId, change });
    return;
  }

  if (entity === 'collection_reminder') {
    await upsertCollectionReminderFromServer({ userId, change });
    return;
  }

  if (entity === 'payment_promise') {
    await upsertPaymentPromiseFromServer({ userId, change });
    return;
  }

  if (entity === 'inventory_movement') {
    await upsertMovementFromServer({ userId, change });
    return;
  }

  if (entity === 'sales_header') {
    await upsertSalesHeaderFromServer({ userId, change });
    return;
  }

  if (entity === 'sales_item') {
    await upsertSalesItemFromServer({ userId, change });
    return;
  }

  if (entity === 'payment') {
    await upsertPaymentFromServer({ userId, change });
    return;
  }

  if (entity === 'sales_return') {
    await upsertSalesReturnFromServer({ userId, change });
    return;
  }

  if (entity === 'supplier') {
    await upsertSupplierFromServer({ userId, change });
    return;
  }

  if (entity === 'purchase_order') {
    await upsertPurchaseOrderFromServer({ userId, change });
    return;
  }

  if (entity === 'purchase_item') {
    await upsertPurchaseItemFromServer({ userId, change });
    return;
  }

  if (entity === 'supplier_payable') {
    await upsertSupplierPayableFromServer({ userId, change });
    return;
  }

  if (entity === 'inventory_batch') {
    await upsertInventoryBatchFromServer({ userId, change });
    return;
  }

  if (entity === 'cycle_count') {
    await upsertCycleCountFromServer({ userId, change });
    return;
  }

  if (entity === 'alert') {
    await upsertAlertFromServer({ userId, change });
    return;
  }

  if (entity === 'expense_entry') {
    await upsertExpenseEntryFromServer({ userId, change });
    return;
  }

  if (entity === 'cashbook_entry') {
    await upsertCashbookEntryFromServer({ userId, change });
    return;
  }

  if (entity === 'day_close') {
    await upsertDayCloseFromServer({ userId, change });
  }
};

const applyAckMapping = async ({ userId, item, ack, serverTime }) => {
  const payload = item?.payload || {};
  const localId = Number(payload.localId || 0);
  const clientRefId = String(payload.clientRefId || payload.id || '').trim();
  const serverId = String(ack?.serverId || payload.serverId || '').trim();
  const version = Number(ack?.serverVersion || payload.version || 1);

  if (!Number.isInteger(localId) || localId <= 0) {
    return;
  }

  const updatedAt = serverTime || payload.updatedAt || new Date().toISOString();

  if (item.entity_type === 'product' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE products SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'customer' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE customers SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'baki_entry' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE baki_transactions SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'collection_reminder' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE collection_reminders SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'payment_promise' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE payment_promises SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'inventory_movement' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE stock_movements SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'sales_header' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE sales_header SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'sales_item' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE sales_items SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'payment' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE payments SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'sales_return' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE sales_returns SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'supplier' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE suppliers SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'purchase_order' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE purchase_orders SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'purchase_item' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE purchase_items SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'supplier_payable' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE supplier_payables SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'inventory_batch' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE inventory_batches SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'cycle_count' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE cycle_counts SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'alert' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE alerts SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'expense_entry' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE expenses SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'cashbook_entry' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE cashbook_entries SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }

  if (item.entity_type === 'day_close' && item.operation !== 'delete') {
    await db.runAsync(
      `UPDATE day_closes SET server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ? WHERE id = ? AND user_id = ?;`,
      serverId || null,
      clientRefId || null,
      version,
      updatedAt,
      localId,
      userId
    );
  }
};

export const runDataSync = async ({ userId, accessToken, maxQueueItems = 100 } = {}) => {
  const syncVerboseLogs = (typeof __DEV__ !== 'undefined' && __DEV__)
    || String(process?.env?.EXPO_PUBLIC_SYNC_VERBOSE || '').trim() === '1';
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    console.warn('[SYNC][CLIENT][SKIPPED_INVALID_USER]', { userId });
    return { synced: 0, appliedServerChanges: 0, skipped: true };
  }

  if (!accessToken) {
    const localDiagnostics = await getLocalSyncDiagnostics({ userId: normalizedUserId });
    console.warn('[SYNC][CLIENT][SKIPPED_NO_ACCESS_TOKEN]', localDiagnostics);
    return { synced: 0, appliedServerChanges: 0, skipped: true };
  }

  if (Date.now() < syncRateLimitedUntilMs) {
    return {
      synced: 0,
      appliedServerChanges: 0,
      skipped: true,
      rateLimited: true,
      retryAfterMs: Math.max(0, syncRateLimitedUntilMs - Date.now()),
    };
  }

  const normalizedMaxQueueItems = Number.isInteger(Number(maxQueueItems)) && Number(maxQueueItems) > 0
    ? Number(maxQueueItems)
    : 100;

  const pending = await getPendingSyncItems({
    limit: normalizedMaxQueueItems,
    forCurrentUser: true,
    entityTypes: MUTATION_ENTITY_TYPES,
  });

  const retryablePending = pending.filter((row) => {
    const errorMessage = String(row?.last_error || '');
    return !errorMessage.includes(PAYLOAD_TOO_LARGE_ERROR_MARKER);
  });

  const outbound = retryablePending
    .map((item) => ({ item, change: buildOutboundChange(item) }))
    .filter((entry) => Boolean(entry.change));

  const pendingByEntity = pending.reduce((summary, row) => {
    const entity = normalizeOutboundEntity(row?.entity_type) || 'unknown';
    summary[entity] = (summary[entity] || 0) + 1;
    return summary;
  }, {});

  if (syncVerboseLogs || pending.length > 0 || outbound.length > 0) {
    console.info('[SYNC][CLIENT][REQUEST]', {
      userId: normalizedUserId,
      pendingCount: pending.length,
      retryablePendingCount: retryablePending.length,
      outboundCount: outbound.length,
      pendingByEntity,
    });
  }

  const lastSyncAt = await getLastSyncAt({ userId: normalizedUserId });
  const requestSync = async ({ outgoingChanges = [], syncCursor }) => {
    try {
      return await syncOnline({
        accessToken,
        payload: {
          clientId: `hisab-mobile-${normalizedUserId}`,
          lastSyncAt: syncCursor,
          changes: outgoingChanges,
        },
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 429) {
        const retryAfterMs = Number.isFinite(Number(error?.retryAfterMs))
          ? Math.max(DEFAULT_RATE_LIMIT_BACKOFF_MS, Number(error.retryAfterMs))
          : DEFAULT_RATE_LIMIT_BACKOFF_MS;
        syncRateLimitedUntilMs = Date.now() + retryAfterMs;
        if (syncVerboseLogs) {
          console.warn('[SYNC][CLIENT][RATE_LIMITED]', {
            retryAfterMs,
            retryAt: new Date(syncRateLimitedUntilMs).toISOString(),
          });
        }
      } else if (status !== 413) {
        const localDiagnostics = await getLocalSyncDiagnostics({ userId: normalizedUserId });
        console.error('[SYNC][CLIENT][REQUEST_FAILED]', {
          message: error?.message || 'Unknown sync request error.',
          status: status || null,
          code: error?.code || null,
          isNetworkError: Boolean(error?.isNetworkError),
          localDiagnostics,
        });
      } else if (syncVerboseLogs) {
        console.warn('[SYNC][CLIENT][REQUEST_TOO_LARGE_RETRYING]', {
          status: Number(error?.status || 0),
          code: error?.code || null,
        });
      }
      throw error;
    }
  };

  const processAckRows = async ({ chunkEntries = [], responsePayload = null }) => {
    const ackRows = Array.isArray(responsePayload?.ack) ? responsePayload.ack : [];
    let applied = 0;

    for (let index = 0; index < chunkEntries.length; index += 1) {
      const pendingEntry = chunkEntries[index].item;
      const ack = ackRows[index] || null;

      if (!ack) {
        await markPendingSyncItemFailed({ id: pendingEntry.id, errorMessage: 'Missing ack row from server.' });
        continue;
      }

      const status = String(ack.status || '').trim().toLowerCase();
      if (status === 'applied' || status === 'duplicate_applied') {
        await applyAckMapping({
          userId: normalizedUserId,
          item: pendingEntry,
          ack,
          serverTime: responsePayload?.serverTime || null,
        });
        await markPendingSyncItemDone(pendingEntry.id);
        applied += 1;
        continue;
      }

      if (status === 'rejected_validation' || status === 'rejected_business_rule') {
        await markPendingSyncItemDone(pendingEntry.id);
        continue;
      }

      if (status === 'pending_approval') {
        await markPendingSyncItemDone(pendingEntry.id);
        continue;
      }

      await markPendingSyncItemFailed({ id: pendingEntry.id, errorMessage: ack.message || status || 'Sync conflict.' });
      console.warn('[SYNC][CLIENT][ACK]', {
        queueId: pendingEntry.id,
        entity: normalizeOutboundEntity(pendingEntry.entity_type),
        status,
        message: ack.message || null,
      });
    }

    return {
      applied,
      ackCount: ackRows.length,
    };
  };

  let syncedCount = 0;
  let appliedServerChanges = 0;
  let hasMoreServerChanges = false;
  let syncCursor = lastSyncAt;
  let totalAckCount = 0;

  const applyServerChanges = async (responsePayload) => {
    const serverChanges = Array.isArray(responsePayload?.serverChanges) ? responsePayload.serverChanges : [];
    for (const change of serverChanges) {
      await applyServerChange({ userId: normalizedUserId, change });
    }
    appliedServerChanges += serverChanges.length;
    hasMoreServerChanges = hasMoreServerChanges || Boolean(responsePayload?.hasMoreServerChanges);
    syncCursor = responsePayload?.nextSyncAt || responsePayload?.serverTime || syncCursor || new Date().toISOString();
  };

  if (outbound.length === 0) {
    try {
      const response = await requestSync({
        outgoingChanges: [],
        syncCursor,
      });
      await applyServerChanges(response);
    } catch (error) {
      if (Number(error?.status || 0) === 429) {
        return {
          synced: 0,
          appliedServerChanges: 0,
          skipped: true,
          rateLimited: true,
          retryAfterMs: Math.max(0, syncRateLimitedUntilMs - Date.now()),
        };
      }
      throw error;
    }
  } else {
    let cursor = 0;

    while (cursor < outbound.length) {
      const chunkBuild = buildSizedChunk({
        outboundEntries: outbound,
        startIndex: cursor,
      });
      const chunkEntries = chunkBuild.chunkEntries;
      if (chunkEntries.length === 0) {
        break;
      }

      try {
        const response = await requestSync({
          outgoingChanges: chunkEntries.map((entry) => entry.change),
          syncCursor,
        });

        const ackResult = await processAckRows({
          chunkEntries,
          responsePayload: response,
        });
        syncedCount += ackResult.applied;
        totalAckCount += ackResult.ackCount;

        await applyServerChanges(response);
        cursor = chunkBuild.nextCursor;
        continue;
      } catch (error) {
        if (Number(error?.status || 0) === 429) {
          break;
        }

        if (Number(error?.status || 0) === 413) {
          const tooLargeEntry = chunkEntries[0]?.item;
          if (tooLargeEntry?.id) {
            await markPendingSyncItemFailed({
              id: tooLargeEntry.id,
              errorMessage: `${PAYLOAD_TOO_LARGE_ERROR_MARKER} ${error?.message || 'request entity too large'}`,
            });
            console.warn('[SYNC][CLIENT][SKIPPED_TOO_LARGE_ITEM]', {
              queueId: tooLargeEntry.id,
              entity: normalizeOutboundEntity(tooLargeEntry.entity_type),
            });
          }

          cursor += 1;
          continue;
        }

        throw error;
      }
    }
  }

  const nextSyncAt = syncCursor || new Date().toISOString();
  await setLastSyncAt({ userId: normalizedUserId, lastSyncAt: nextSyncAt });

  if (syncVerboseLogs || syncedCount > 0 || appliedServerChanges > 0 || hasMoreServerChanges) {
    console.info('[SYNC][CLIENT][RESPONSE]', {
      userId: normalizedUserId,
      synced: syncedCount,
      ackCount: totalAckCount,
      serverChanges: appliedServerChanges,
      hasMoreServerChanges,
      nextSyncAt,
    });
  }

  return {
    synced: syncedCount,
    appliedServerChanges,
    hasMoreServerChanges,
    nextSyncAt,
    rateLimited: Date.now() < syncRateLimitedUntilMs,
    retryAfterMs: Math.max(0, syncRateLimitedUntilMs - Date.now()),
  };
};
