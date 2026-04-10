import db, {
  getLastSyncAt,
  getPendingSyncItems,
  markPendingSyncItemDone,
  markPendingSyncItemFailed,
  setLastSyncAt,
} from '../../database/db';
import { syncOnline } from '../backend/syncApi';

const MUTATION_ENTITY_TYPES = ['product', 'customer', 'baki_entry', 'inventory_movement', 'transaction'];

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
    entity: String(item?.entity_type || '').trim().toLowerCase(),
    type: isDelete ? 'delete' : 'upsert',
    id: effectiveId,
    data,
    version: Number(payload.version || 1),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    idempotencyKey: String(payload.idempotencyKey || '').trim(),
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

  if (existing?.id) {
    await db.runAsync(
      `UPDATE customers
       SET name = ?, phone = ?, address = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?;`,
      String(data.name || ''),
      data.phone ? String(data.phone) : null,
      data.address ? String(data.address) : null,
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
      user_id, name, phone, address,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'));`,
    userId,
    String(data.name || ''),
    data.phone ? String(data.phone) : null,
    data.address ? String(data.address) : null,
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

  if (existing?.id) {
    await db.runAsync(
      `UPDATE baki_transactions
       SET customer_id = ?, type = ?, amount_cents = ?, note = ?, payment_method = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localCustomerId,
      String(data.type || 'credit'),
      amountCents,
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
      user_id, customer_id, type, amount_cents, note, payment_method,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localCustomerId,
    String(data.type || 'credit'),
    amountCents,
    data.note ? String(data.note) : null,
    data.paymentMethod ? String(data.paymentMethod) : null,
    serverId || null,
    clientRefId,
    nextVersion,
    nextUpdatedAt,
    data.occurredAt ? String(data.occurredAt) : null
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
  const nextVersion = Number(change?.version || 1);
  const nextUpdatedAt = change?.updatedAt || new Date().toISOString();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE stock_movements
       SET product_id = ?, movement_type = ?, quantity_delta = ?, quantity_before = ?, quantity_after = ?, note = ?,
           server_id = ?, client_ref_id = ?, sync_version = ?, sync_updated_at = ?, deleted_at = NULL
       WHERE id = ? AND user_id = ?;`,
      localProductId,
      toMovementTypeLocal(data.movementType),
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
      user_id, product_id, movement_type, quantity_delta, quantity_before, quantity_after, note,
      server_id, client_ref_id, sync_version, sync_updated_at, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, COALESCE(?, datetime('now')));`,
    userId,
    localProductId,
    toMovementTypeLocal(data.movementType),
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

  if (entity === 'inventory_movement') {
    await upsertMovementFromServer({ userId, change });
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
};

export const runDataSync = async ({ userId, accessToken, maxQueueItems = 100 } = {}) => {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return { synced: 0, appliedServerChanges: 0, skipped: true };
  }

  if (!accessToken) {
    return { synced: 0, appliedServerChanges: 0, skipped: true };
  }

  const pending = await getPendingSyncItems({
    limit: maxQueueItems,
    forCurrentUser: true,
    entityTypes: MUTATION_ENTITY_TYPES,
  });

  const outbound = pending
    .map((item) => ({ item, change: buildOutboundChange(item) }))
    .filter((entry) => Boolean(entry.change));

  const lastSyncAt = await getLastSyncAt({ userId: normalizedUserId });

  const response = await syncOnline({
    accessToken,
    payload: {
      clientId: `hisab-mobile-${normalizedUserId}`,
      lastSyncAt,
      changes: outbound.map((entry) => entry.change),
    },
  });

  const ackRows = Array.isArray(response?.ack) ? response.ack : [];
  let syncedCount = 0;

  for (let index = 0; index < outbound.length; index += 1) {
    const pendingEntry = outbound[index].item;
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
        serverTime: response?.serverTime || null,
      });
      await markPendingSyncItemDone(pendingEntry.id);
      syncedCount += 1;
      continue;
    }

    if (status === 'rejected_validation' || status === 'rejected_business_rule') {
      // Drop permanently invalid operations so they do not block the queue forever.
      await markPendingSyncItemDone(pendingEntry.id);
      continue;
    }

    await markPendingSyncItemFailed({ id: pendingEntry.id, errorMessage: ack.message || status || 'Sync conflict.' });
  }

  const serverChanges = Array.isArray(response?.serverChanges) ? response.serverChanges : [];
  for (const change of serverChanges) {
    await applyServerChange({ userId: normalizedUserId, change });
  }

  const nextSyncAt = response?.nextSyncAt || response?.serverTime || new Date().toISOString();
  await setLastSyncAt({ userId: normalizedUserId, lastSyncAt: nextSyncAt });

  return {
    synced: syncedCount,
    appliedServerChanges: serverChanges.length,
    hasMoreServerChanges: Boolean(response?.hasMoreServerChanges),
    nextSyncAt,
  };
};
