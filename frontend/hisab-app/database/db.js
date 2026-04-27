import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('hisab.db');

db.execSync('PRAGMA foreign_keys = ON;');

const ensureColumn = async (tableName, columnName, alterSql) => {
	const tableInfo = await db.getAllAsync(`PRAGMA table_info(${tableName});`);
	const existingColumns = new Set(tableInfo.map((column) => column.name));

	if (!existingColumns.has(columnName)) {
		await db.execAsync(alterSql);
	}
};

const normalizeExpiryDate = (expiryDate) => {
	if (expiryDate === null || expiryDate === undefined || expiryDate === '') {
		return null;
	}

	if (typeof expiryDate !== 'string') {
		return null;
	}

	const trimmed = expiryDate.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed.toISOString();
};

const toUtcStartOfDay = (dateInput) => {
	const date = new Date(dateInput);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const MOVEMENT_TYPES = new Set(['in', 'out', 'adjust']);
const BAKI_TRANSACTION_TYPES = new Set(['credit', 'payment']);
const CREDIT_REMINDER_CHANNELS = new Set(['sms', 'whatsapp', 'call', 'manual']);
const PAYMENT_PROMISE_STATUSES = new Set(['pending', 'fulfilled', 'broken']);
const STOCK_OUT_REASONS = new Set(['SALE', 'DAMAGE', 'EXPIRY', 'ADJUSTMENT']);
const MANUAL_STOCK_OUT_REASONS = new Set(['DAMAGE', 'EXPIRY', 'ADJUSTMENT']);
const PAYMENT_METHODS = new Set(['CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK', 'MIXED', 'OTHER']);
const PAYMENT_STATUSES = new Set(['PAID', 'PENDING', 'FAILED', 'REFUNDED']);
const PURCHASE_STATUSES = new Set(['pending', 'partial', 'received', 'cancelled']);
const SUPPLIER_PAYABLE_TYPES = new Set(['credit', 'payment']);
const INVENTORY_ALERT_TYPES = new Set(['LOW_STOCK', 'EXPIRY', 'OVERSTOCK', 'DEAD_STOCK']);
const INVENTORY_ALERT_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const CASHBOOK_ENTRY_TYPES = new Set(['IN', 'OUT']);
const DAY_CLOSE_STATUSES = new Set(['open', 'closed']);
const PILOT_SHOP_STATUSES = new Set(['planned', 'active', 'paused', 'completed']);
const FEEDBACK_CATEGORIES = new Set(['bug', 'feature', 'ux']);
const FEEDBACK_STATUSES = new Set(['new', 'reviewed', 'resolved']);

const DEFAULT_EXPIRY_ALERT_DAYS = 7;
const DEFAULT_DEAD_STOCK_DAYS = 60;
const OVERSTOCK_COVERAGE_DAYS = 45;

const AUTH_DEFAULT_SESSION_HOURS = 24;
const AUTH_REMEMBER_SESSION_DAYS = 30;
const LOCAL_AUDIT_RETENTION_DAYS = 45;

const normalizeAuthEmail = (email) => String(email || '').trim().toLowerCase();

const hashString = (input) => {
	let hash = 2166136261;
	const text = String(input || '');

	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = (hash * 16777619) >>> 0;
	}

	return hash.toString(16).padStart(8, '0');
};


const generateSessionToken = ({ userId, email }) => {
	const seed = `${Date.now()}:${Math.random()}:${String(userId || '')}:${String(email || '')}`;
	return `sess_${hashString(seed)}_${hashString(`${seed}:${Math.random()}`)}`;
};

const generateLocalDeviceId = () => {
	const seed = `${Date.now()}:${Math.random()}:${Math.random()}`;
	return `dev_${hashString(seed)}_${hashString(`${seed}:device`)}`;
};

const generatePaymentCode = () => {
	return String(Math.floor(100000 + Math.random() * 900000));
};

const PAYMENT_CODE_TTL_HOURS = 24;

const getSessionExpiryIso = (rememberMe = false) => {
	const now = Date.now();
	const ttlMs = rememberMe
		? AUTH_REMEMBER_SESSION_DAYS * 24 * 60 * 60 * 1000
		: AUTH_DEFAULT_SESSION_HOURS * 60 * 60 * 1000;

	return new Date(now + ttlMs).toISOString();
};

const sanitizeAuthUser = (row) => {
	if (!row) {
		return null;
	}

	return {
		id: Number(row.id),
		email: String(row.email || ''),
		name: String(row.name || '').trim() || null,
		profile_image_uri: String(row.profile_image_uri || '').trim() || null,
		created_at: row.created_at || null,
		updated_at: row.updated_at || null,
		last_login_at: row.last_login_at || null,
	};
};

const cleanupExpiredSessions = async () => {
	await db.runAsync(
		`DELETE FROM auth_sessions
		 WHERE (
			datetime(expires_at) <= datetime('now')
			OR (
				refresh_expires_at IS NOT NULL
				AND datetime(refresh_expires_at) <= datetime('now')
			)
		 )
			OR revoked_at IS NOT NULL;`
	);
};

const cleanupOldAuditLogs = async () => {
	await db.runAsync(
		`DELETE FROM audit_logs
		 WHERE datetime(created_at) < datetime('now', ?);`,
		`-${LOCAL_AUDIT_RETENTION_DAYS} days`
	);
};

const createSessionForUser = async ({
	userId,
	email,
	rememberMe = false,
	serverTokens = null,
	authMode = 'offline',
	syncPending = false,
}) => {
	const normalizedUserId = Number(userId);
	if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
		throw new Error('Invalid user for session creation.');
	}

	const token = generateSessionToken({ userId: normalizedUserId, email });
	const expiresAtIso = getSessionExpiryIso(rememberMe);
	const accessToken = serverTokens?.accessToken ? String(serverTokens.accessToken) : null;
	const refreshToken = serverTokens?.refreshToken ? String(serverTokens.refreshToken) : null;
	const accessExpiresAt = serverTokens?.accessTokenExpiresAt ? String(serverTokens.accessTokenExpiresAt) : null;
	const refreshExpiresAt = serverTokens?.refreshTokenExpiresAt ? String(serverTokens.refreshTokenExpiresAt) : null;
	const normalizedMode = authMode === 'online' || authMode === 'hybrid' ? authMode : 'offline';
	const status = accessToken ? 'ok' : 'local-only';
	const checkedAt = accessToken ? new Date().toISOString() : null;

	await db.runAsync(
		`INSERT INTO auth_sessions (
			user_id,
			token,
			remember_me,
			expires_at,
			access_token,
			refresh_token,
			access_expires_at,
			refresh_expires_at,
			auth_mode,
			last_server_check_at,
			last_server_status,
			server_sync_pending
		)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		normalizedUserId,
		token,
		rememberMe ? 1 : 0,
		expiresAtIso,
		accessToken,
		refreshToken,
		accessExpiresAt,
		refreshExpiresAt,
		normalizedMode,
		checkedAt,
		status,
		syncPending ? 1 : 0
	);

	return {
		token,
		expires_at: expiresAtIso,
		remember_me: Boolean(rememberMe),
		access_token: accessToken,
		refresh_token: refreshToken,
		access_expires_at: accessExpiresAt,
		refresh_expires_at: refreshExpiresAt,
		auth_mode: normalizedMode,
		last_server_check_at: checkedAt,
		last_server_status: status,
		server_sync_pending: Boolean(syncPending),
	};
};

const sanitizeAuthSession = (row) => {
	if (!row) {
		return null;
	}

	return {
		token: String(row.token || ''),
		expires_at: row.expires_at || null,
		remember_me: Boolean(Number(row.remember_me || 0)),
		access_token: row.access_token ? String(row.access_token) : null,
		refresh_token: row.refresh_token ? String(row.refresh_token) : null,
		access_expires_at: row.access_expires_at || null,
		refresh_expires_at: row.refresh_expires_at || null,
		auth_mode: row.auth_mode || 'offline',
		last_server_check_at: row.last_server_check_at || null,
		last_server_status: row.last_server_status || null,
		server_sync_pending: Boolean(Number(row.server_sync_pending || 0)),
	};
};

const getActiveScopedUserId = async () => {
	const row = await db.getFirstAsync(
		`SELECT u.id AS user_id
		 FROM auth_sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.revoked_at IS NULL
			AND datetime(s.expires_at) > datetime('now')
		 ORDER BY datetime(s.created_at) DESC, s.id DESC
		 LIMIT 1;`
	);

	const userId = Number(row?.user_id || 0);
	if (!Number.isInteger(userId) || userId <= 0) {
		throw new Error('Authenticated user session is required.');
	}

	return userId;
};

const getFallbackUserId = async () => {
	const row = await db.getFirstAsync(
		`SELECT id AS user_id
		 FROM users
		 ORDER BY id ASC
		 LIMIT 1;`
	);

	const userId = Number(row?.user_id || 0);
	return Number.isInteger(userId) && userId > 0 ? userId : null;
};

const logAudit = async ({
	userId,
	entityType,
	entityId = null,
	action,
	metadata = null,
	notes = null,
} = {}) => {
	const normalizedUserId = Number(userId);
	if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
		return;
	}

	const normalizedEntityType = String(entityType || '').trim();
	const normalizedAction = String(action || '').trim();
	if (!normalizedEntityType || !normalizedAction) {
		return;
	}

	let metadataJson = null;
	if (metadata !== null && metadata !== undefined) {
		try {
			metadataJson = JSON.stringify(metadata);
		} catch {
			metadataJson = null;
		}
	}

	try {
		await db.runAsync(
			`INSERT INTO audit_logs (user_id, entity_type, entity_id, action, metadata_json, notes)
			 VALUES (?, ?, ?, ?, ?, ?);`,
			normalizedUserId,
			normalizedEntityType,
			entityId === null || entityId === undefined ? null : Number(entityId),
			normalizedAction,
			metadataJson,
			notes ? String(notes) : null
		);
	} catch {
		// audit should never block primary transaction flow
	}
};

const toMoneyCents = (value) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return null;
	}

	const cents = Math.round((numeric + Number.EPSILON) * 100);
	if (!Number.isInteger(cents)) {
		return null;
	}

	return cents;
};

const fromMoneyCents = (value) => {
	const cents = Number(value);
	if (!Number.isFinite(cents)) {
		return 0;
	}

	return Math.round(cents) / 100;
};

const normalizeMovementType = (value) => {
	const token = String(value || '').trim().toLowerCase();
	return MOVEMENT_TYPES.has(token) ? token : '';
};

const normalizeStockOutReason = (value, fallback = null) => {
	const token = String(value || fallback || '').trim().toUpperCase();
	return STOCK_OUT_REASONS.has(token) ? token : null;
};

const normalizePaymentMethod = (value, fallback = 'CASH') => {
	const token = String(value || fallback || 'CASH').trim().toUpperCase();
	return PAYMENT_METHODS.has(token) ? token : 'OTHER';
};

const normalizePaymentStatus = (value, fallback = 'PAID') => {
	const token = String(value || fallback || 'PAID').trim().toUpperCase();
	return PAYMENT_STATUSES.has(token) ? token : 'PENDING';
};

const normalizePurchaseStatus = (value, fallback = 'pending') => {
	const token = String(value || fallback || 'pending').trim().toLowerCase();
	return PURCHASE_STATUSES.has(token) ? token : 'pending';
};

const normalizeSupplierPayableType = (value, fallback = 'credit') => {
	const token = String(value || fallback || 'credit').trim().toLowerCase();
	return SUPPLIER_PAYABLE_TYPES.has(token) ? token : 'credit';
};

const normalizeAlertType = (value, fallback = 'LOW_STOCK') => {
	const token = String(value || fallback || 'LOW_STOCK').trim().toUpperCase();
	return INVENTORY_ALERT_TYPES.has(token) ? token : 'LOW_STOCK';
};

const normalizeAlertSeverity = (value, fallback = 'low') => {
	const token = String(value || fallback || 'low').trim().toLowerCase();
	return INVENTORY_ALERT_SEVERITIES.has(token) ? token : 'low';
};

const normalizeCashbookEntryType = (value, fallback = 'IN') => {
	const token = String(value || fallback || 'IN').trim().toUpperCase();
	return CASHBOOK_ENTRY_TYPES.has(token) ? token : 'IN';
};

const normalizeDayCloseStatus = (value, fallback = 'closed') => {
	const token = String(value || fallback || 'closed').trim().toLowerCase();
	return DAY_CLOSE_STATUSES.has(token) ? token : 'closed';
};

const normalizeFinanceCategory = (value, fallback = 'GENERAL') => {
	const normalized = String(value || fallback || 'GENERAL').trim().toUpperCase();
	if (!normalized) {
		return 'GENERAL';
	}

	return normalized.replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'GENERAL';
};

const normalizeBusinessDate = (value = null) => {
	if (!value) {
		return new Date().toISOString().slice(0, 10);
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed.toISOString().slice(0, 10);
};

const buildReceiptDateToken = (dateValue = null) => {
	const date = dateValue ? new Date(dateValue) : new Date();
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString().slice(0, 10).replace(/-/g, '');
	}

	return date.toISOString().slice(0, 10).replace(/-/g, '');
};

const buildLocalClientRefId = ({ entityType, localId }) => `local:${String(entityType || '').trim()}:${String(localId || '').trim()}`;

const buildEntitySyncIdempotencyKey = ({ entityType, operation, localId, updatedAt }) => {
	const safeEntity = String(entityType || '').trim().toLowerCase() || 'entity';
	const safeOperation = String(operation || '').trim().toLowerCase() || 'upsert';
	const safeLocalId = String(localId || '').trim() || 'na';
	const safeUpdatedAt = String(updatedAt || '').trim() || new Date().toISOString();
	return `hsb_${safeEntity}_${safeOperation}_${safeLocalId}_${hashString(`${safeLocalId}:${safeUpdatedAt}`)}`;
};

const enqueueEntitySyncChange = async ({
	entityType,
	operation,
	localId,
	clientRefId,
	serverId = null,
	version = 1,
	updatedAt,
	data,
}) => {
	const normalizedEntityType = String(entityType || '').trim().toLowerCase();
	const normalizedOperation = String(operation || '').trim().toLowerCase();
	if (!normalizedEntityType || !normalizedOperation) {
		return;
	}

	const effectiveUpdatedAt = updatedAt || new Date().toISOString();
	const effectiveClientRefId = String(clientRefId || '').trim() || buildLocalClientRefId({
		entityType: normalizedEntityType,
		localId,
	});
	const idempotencyKey = buildEntitySyncIdempotencyKey({
		entityType: normalizedEntityType,
		operation: normalizedOperation,
		localId,
		updatedAt: effectiveUpdatedAt,
	});

	await enqueuePendingSyncItem({
		entityType: normalizedEntityType,
		operation: normalizedOperation,
		payload: {
			localId: Number(localId),
			id: effectiveClientRefId,
			clientRefId: effectiveClientRefId,
			serverId: serverId ? String(serverId) : null,
			version: Number.isInteger(Number(version)) ? Number(version) : 1,
			updatedAt: effectiveUpdatedAt,
			idempotencyKey,
			data: data || {},
		},
	});
};

const insertCashbookEntryTx = async ({
	userId,
	entryType,
	amountCents,
	paymentMethod = null,
	category = 'GENERAL',
	referenceType = null,
	referenceLocalId = null,
	referenceClientRefId = null,
	note = null,
	occurredAt = null,
	syncUpdatedAt = null,
} = {}) => {
	const normalizedEntryType = normalizeCashbookEntryType(entryType, 'IN');
	const normalizedAmountCents = Number(amountCents);
	const effectiveOccurredAt = occurredAt || syncUpdatedAt || new Date().toISOString();
	const effectiveSyncUpdatedAt = syncUpdatedAt || effectiveOccurredAt;

	if (!Number.isInteger(normalizedAmountCents) || normalizedAmountCents <= 0) {
		throw new Error('Cashbook amount must be a positive integer cents value.');
	}

	const insert = await db.runAsync(
		`INSERT INTO cashbook_entries (
			user_id,
			entry_type,
			category,
			amount_cents,
			payment_method,
			reference_type,
			reference_local_id,
			reference_client_ref_id,
			note,
			occurred_at,
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?);`,
		userId,
		normalizedEntryType,
		normalizeFinanceCategory(category, 'GENERAL'),
		normalizedAmountCents,
		paymentMethod ? normalizePaymentMethod(paymentMethod, 'OTHER') : null,
		referenceType ? String(referenceType).trim().toLowerCase() : null,
		Number.isInteger(Number(referenceLocalId)) ? Number(referenceLocalId) : null,
		referenceClientRefId ? String(referenceClientRefId).trim() : null,
		note ? String(note).trim() : null,
		effectiveOccurredAt,
		null,
		effectiveSyncUpdatedAt,
		effectiveOccurredAt,
		effectiveOccurredAt
	);

	const localId = Number(insert.lastInsertRowId);
	const clientRefId = buildLocalClientRefId({ entityType: 'cashbook_entry', localId });

	await db.runAsync(`UPDATE cashbook_entries SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

	await enqueueEntitySyncChange({
		entityType: 'cashbook_entry',
		operation: 'upsert',
		localId,
		clientRefId,
		version: 1,
		updatedAt: effectiveSyncUpdatedAt,
		data: {
			entryType: normalizedEntryType,
			category: normalizeFinanceCategory(category, 'GENERAL'),
			amount: fromMoneyCents(normalizedAmountCents),
			paymentMethod: paymentMethod ? normalizePaymentMethod(paymentMethod, 'OTHER') : null,
			referenceType: referenceType ? String(referenceType).trim().toLowerCase() : null,
			referenceLocalId: Number.isInteger(Number(referenceLocalId)) ? Number(referenceLocalId) : null,
			referenceClientRefId: referenceClientRefId ? String(referenceClientRefId).trim() : null,
			note: note ? String(note).trim() : null,
			occurredAt: effectiveOccurredAt,
			deletedAt: null,
		},
	});

	return {
		id: localId,
		client_ref_id: clientRefId,
		entry_type: normalizedEntryType,
		amount_cents: normalizedAmountCents,
		occurred_at: effectiveOccurredAt,
	};
};

const getBusinessDayFinanceSnapshotTx = async ({ userId, businessDate }) => {
	const row = await db.getFirstAsync(
		`WITH day_tx AS (
			SELECT
				COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount_cents ELSE 0 END), 0) AS total_in_cents,
				COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount_cents ELSE 0 END), 0) AS total_out_cents
			FROM cashbook_entries
			WHERE user_id = ?
				AND deleted_at IS NULL
				AND DATE(occurred_at) = DATE(?)
		),
		opening AS (
			SELECT
				COALESCE(SUM(
					CASE
						WHEN entry_type = 'IN' THEN amount_cents
						WHEN entry_type = 'OUT' THEN -amount_cents
						ELSE 0
					END
				), 0) AS opening_balance_cents
			FROM cashbook_entries
			WHERE user_id = ?
				AND deleted_at IS NULL
				AND DATE(occurred_at) < DATE(?)
		)
		SELECT
			opening.opening_balance_cents,
			day_tx.total_in_cents,
			day_tx.total_out_cents,
			opening.opening_balance_cents + day_tx.total_in_cents - day_tx.total_out_cents AS closing_balance_cents
		FROM opening, day_tx;`,
		userId,
		businessDate,
		userId,
		businessDate
	);

	return {
		opening_balance_cents: Number(row?.opening_balance_cents || 0),
		total_in_cents: Number(row?.total_in_cents || 0),
		total_out_cents: Number(row?.total_out_cents || 0),
		closing_balance_cents: Number(row?.closing_balance_cents || 0),
	};
};

const buildInventoryBatchNumber = ({ productId, prefix = 'BATCH' } = {}) => {
	const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
	return `${String(prefix || 'BATCH').toUpperCase()}-${String(productId || 'NA')}-${stamp}-${hashString(Math.random())}`;
};

const loadOpenBatchesForProductTx = async ({ userId, productId }) => {
	return db.getAllAsync(
		`SELECT
			id,
			quantity,
			batch_number,
			expiry_date,
			purchase_date,
			cost_price_cents,
			server_id,
			client_ref_id,
			sync_version
		 FROM inventory_batches
		 WHERE user_id = ?
			AND product_id = ?
			AND deleted_at IS NULL
			AND quantity > 0
		 ORDER BY
			CASE
				WHEN expiry_date IS NULL OR trim(expiry_date) = '' THEN 1
				ELSE 0
			END ASC,
			datetime(expiry_date) ASC,
			datetime(purchase_date) ASC,
			id ASC;`,
		userId,
		productId
	);
};

const consumeInventoryBatchesTx = async ({
	userId,
	productId,
	quantity,
	syncUpdatedAt,
	sourceEventType = null,
	sourceEventId = null,
	sourceEventClientRefId = null,
} = {}) => {
	const requestedQty = Number(quantity);
	if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
		return [];
	}

	const rows = await loadOpenBatchesForProductTx({ userId, productId });
	let remaining = requestedQty;
	const allocations = [];

	for (const row of rows) {
		if (remaining <= 0) {
			break;
		}

		const available = Number(row.quantity || 0);
		if (available <= 0) {
			continue;
		}

		const consumed = Math.min(available, remaining);
		remaining -= consumed;
		allocations.push({
			...row,
			available,
			consumed,
			nextQuantity: available - consumed,
		});
	}

	if (remaining > 0) {
		throw new Error('Insufficient batch stock for FEFO allocation. Please reconcile inventory batches first.');
	}

	for (const allocation of allocations) {
		const nextVersion = Number(allocation.sync_version || 0) + 1;
		const batchClientRefId = String(allocation.client_ref_id || '').trim()
			|| buildLocalClientRefId({ entityType: 'inventory_batch', localId: Number(allocation.id) });

		await db.runAsync(
			`UPDATE inventory_batches
			 SET quantity = ?,
				 client_ref_id = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 updated_at = ?
			 WHERE id = ?
				AND user_id = ?;`,
			allocation.nextQuantity,
			batchClientRefId,
			nextVersion,
			syncUpdatedAt,
			syncUpdatedAt,
			Number(allocation.id),
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'inventory_batch',
			operation: 'upsert',
			localId: Number(allocation.id),
			clientRefId: batchClientRefId,
			serverId: allocation.server_id || null,
			version: nextVersion,
			updatedAt: syncUpdatedAt,
			data: {
				productId,
				batchNumber: allocation.batch_number || null,
				quantity: allocation.nextQuantity,
				expiryDate: allocation.expiry_date || null,
				purchaseDate: allocation.purchase_date || null,
				costPrice: fromMoneyCents(Number(allocation.cost_price_cents || 0)),
				sourceEventType: sourceEventType ? String(sourceEventType).toLowerCase() : null,
				sourceEventId: Number.isInteger(Number(sourceEventId)) ? Number(sourceEventId) : null,
				sourceEventClientRefId: sourceEventClientRefId ? String(sourceEventClientRefId) : null,
				deletedAt: null,
			},
		});
	}

	return allocations.map((allocation) => ({
		batch_id: Number(allocation.id),
		batch_number: allocation.batch_number || null,
		expiry_date: allocation.expiry_date || null,
		consumed_qty: Number(allocation.consumed || 0),
		remaining_qty: Number(allocation.nextQuantity || 0),
	}));
};

const createInventoryBatchTx = async ({
	userId,
	productId,
	quantity,
	batchNumber = null,
	expiryDate = null,
	purchaseDate = null,
	costPriceCents = 0,
	syncUpdatedAt,
	sourceEventType = null,
	sourceEventId = null,
	sourceEventClientRefId = null,
} = {}) => {
	const normalizedQuantity = Number(quantity);
	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
		throw new Error('Batch quantity must be a positive integer.');
	}

	const normalizedCostPriceCents = Number(costPriceCents);
	if (!Number.isInteger(normalizedCostPriceCents) || normalizedCostPriceCents < 0) {
		throw new Error('Batch cost price is invalid.');
	}

	const normalizedPurchaseDate = purchaseDate
		? new Date(purchaseDate)
		: new Date(syncUpdatedAt || Date.now());
	if (Number.isNaN(normalizedPurchaseDate.getTime())) {
		throw new Error('Batch purchase date is invalid.');
	}

	const normalizedExpiryDate = normalizeExpiryDate(expiryDate);
	const normalizedBatchNumber = String(batchNumber || '').trim()
		|| buildInventoryBatchNumber({ productId, prefix: sourceEventType === 'cycle_count' ? 'CYCLE' : 'BATCH' });

	const insertResult = await db.runAsync(
		`INSERT INTO inventory_batches (
			user_id,
			product_id,
			batch_number,
			quantity,
			expiry_date,
			purchase_date,
			cost_price_cents,
			server_id,
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, NULL, ?, ?);`,
		userId,
		productId,
		normalizedBatchNumber,
		normalizedQuantity,
		normalizedExpiryDate,
		normalizedPurchaseDate.toISOString(),
		normalizedCostPriceCents,
		syncUpdatedAt,
		syncUpdatedAt,
		syncUpdatedAt
	);

	const batchId = Number(insertResult.lastInsertRowId);
	const batchClientRefId = buildLocalClientRefId({ entityType: 'inventory_batch', localId: batchId });

	await db.runAsync(
		`UPDATE inventory_batches
		 SET client_ref_id = ?
		 WHERE id = ?
			AND user_id = ?;`,
		batchClientRefId,
		batchId,
		userId
	);

	await enqueueEntitySyncChange({
		entityType: 'inventory_batch',
		operation: 'upsert',
		localId: batchId,
		clientRefId: batchClientRefId,
		version: 1,
		updatedAt: syncUpdatedAt,
		data: {
			productId,
			batchNumber: normalizedBatchNumber,
			quantity: normalizedQuantity,
			expiryDate: normalizedExpiryDate,
			purchaseDate: normalizedPurchaseDate.toISOString(),
			costPrice: fromMoneyCents(normalizedCostPriceCents),
			sourceEventType: sourceEventType ? String(sourceEventType).toLowerCase() : null,
			sourceEventId: Number.isInteger(Number(sourceEventId)) ? Number(sourceEventId) : null,
			sourceEventClientRefId: sourceEventClientRefId ? String(sourceEventClientRefId) : null,
			deletedAt: null,
		},
	});

	return {
		id: batchId,
		client_ref_id: batchClientRefId,
		batch_number: normalizedBatchNumber,
		quantity: normalizedQuantity,
		expiry_date: normalizedExpiryDate,
		purchase_date: normalizedPurchaseDate.toISOString(),
		cost_price_cents: normalizedCostPriceCents,
	};
};

const validateInventoryBatchConsistencyTx = async ({ userId, productId = null } = {}) => {
	const whereProduct = Number.isInteger(Number(productId)) && Number(productId) > 0
		? 'AND p.id = ?'
		: '';

	const rows = await db.getAllAsync(
		`SELECT
			p.id AS product_id,
			p.quantity AS product_quantity,
			COALESCE(SUM(CASE WHEN b.deleted_at IS NULL THEN b.quantity ELSE 0 END), 0) AS batch_quantity
		 FROM products p
		 LEFT JOIN inventory_batches b
			on b.product_id = p.id
			AND b.user_id = p.user_id
		 WHERE p.user_id = ? ${whereProduct}
		 GROUP BY p.id;`,
		...(whereProduct ? [userId, Number(productId)] : [userId])
	);

	const mismatches = (rows || [])
		.map((row) => ({
			product_id: Number(row.product_id),
			product_quantity: Number(row.product_quantity || 0),
			batch_quantity: Number(row.batch_quantity || 0),
		}))
		.filter((row) => row.product_quantity !== row.batch_quantity);

	return {
		is_consistent: mismatches.length === 0,
		mismatches,
	};
};

const upsertInventoryAlertTx = async ({
	userId,
	productId,
	alertType,
	message,
	severity,
	syncUpdatedAt,
} = {}) => {
	const normalizedType = normalizeAlertType(alertType);
	const normalizedSeverity = normalizeAlertSeverity(severity, 'medium');
	const normalizedMessage = String(message || '').trim();
	if (!normalizedMessage) {
		return null;
	}

	const alertKey = `${normalizedType}:${Number(productId)}`;
	const existing = await db.getFirstAsync(
		`SELECT id, client_ref_id, server_id, sync_version
		 FROM alerts
		 WHERE user_id = ?
			AND alert_key = ?
		 LIMIT 1;`,
		userId,
		alertKey
	);

	if (existing?.id) {
		const nextVersion = Number(existing.sync_version || 0) + 1;
		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'alert', localId: Number(existing.id) });

		await db.runAsync(
			`UPDATE alerts
			 SET product_id = ?,
				 alert_type = ?,
				 message = ?,
				 severity = ?,
				 is_active = 1,
				 resolved_at = NULL,
				 deleted_at = NULL,
				 client_ref_id = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 updated_at = ?
			 WHERE id = ?
				AND user_id = ?;`,
			Number(productId),
			normalizedType,
			normalizedMessage,
			normalizedSeverity,
			clientRefId,
			nextVersion,
			syncUpdatedAt,
			syncUpdatedAt,
			Number(existing.id),
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'alert',
			operation: 'upsert',
			localId: Number(existing.id),
			clientRefId,
			serverId: existing.server_id || null,
			version: nextVersion,
			updatedAt: syncUpdatedAt,
			data: {
				productId: Number(productId),
				alertType: normalizedType,
				message: normalizedMessage,
				severity: normalizedSeverity,
				isActive: true,
				deletedAt: null,
			},
		});

		return Number(existing.id);
	}

	const insertResult = await db.runAsync(
		`INSERT INTO alerts (
			user_id,
			product_id,
			alert_key,
			alert_type,
			message,
			severity,
			is_active,
			resolved_at,
			server_id,
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, 1, ?, NULL, ?, ?);`,
		userId,
		Number(productId),
		alertKey,
		normalizedType,
		normalizedMessage,
		normalizedSeverity,
		syncUpdatedAt,
		syncUpdatedAt,
		syncUpdatedAt
	);

	const alertId = Number(insertResult.lastInsertRowId);
	const clientRefId = buildLocalClientRefId({ entityType: 'alert', localId: alertId });
 await db.runAsync(`UPDATE alerts SET client_ref_id = ? WHERE id = ? AND user_id = ?;`, clientRefId, alertId, userId);

	await enqueueEntitySyncChange({
		entityType: 'alert',
		operation: 'upsert',
		localId: alertId,
		clientRefId,
		version: 1,
		updatedAt: syncUpdatedAt,
		data: {
			productId: Number(productId),
			alertType: normalizedType,
			message: normalizedMessage,
			severity: normalizedSeverity,
			isActive: true,
			deletedAt: null,
		},
	});

	return alertId;
};

const resolveInventoryAlertTx = async ({ userId, alertKey, syncUpdatedAt } = {}) => {
	const existing = await db.getFirstAsync(
		`SELECT id, client_ref_id, server_id, sync_version, product_id, alert_type, message, severity
		 FROM alerts
		 WHERE user_id = ?
			AND alert_key = ?
			AND is_active = 1
		 LIMIT 1;`,
		userId,
		String(alertKey || '')
	);

	if (!existing?.id) {
		return;
	}

	const nextVersion = Number(existing.sync_version || 0) + 1;
	const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'alert', localId: Number(existing.id) });

	await db.runAsync(
		`UPDATE alerts
		 SET is_active = 0,
			 resolved_at = ?,
			 deleted_at = ?,
			 client_ref_id = ?,
			 sync_version = ?,
			 sync_updated_at = ?,
			 updated_at = ?
		 WHERE id = ?
			AND user_id = ?;`,
		syncUpdatedAt,
		syncUpdatedAt,
		clientRefId,
		nextVersion,
		syncUpdatedAt,
		syncUpdatedAt,
		Number(existing.id),
		userId
	);

	await enqueueEntitySyncChange({
		entityType: 'alert',
		operation: 'delete',
		localId: Number(existing.id),
		clientRefId,
		serverId: existing.server_id || null,
		version: nextVersion,
		updatedAt: syncUpdatedAt,
		data: {
			productId: Number(existing.product_id),
			alertType: normalizeAlertType(existing.alert_type),
			message: existing.message ? String(existing.message) : null,
			severity: normalizeAlertSeverity(existing.severity, 'low'),
			isActive: false,
			deletedAt: syncUpdatedAt,
		},
	});
};

const refreshInventoryAlertsTx = async ({
	userId,
	syncUpdatedAt,
	expiryAlertDays = DEFAULT_EXPIRY_ALERT_DAYS,
	deadStockDays = DEFAULT_DEAD_STOCK_DAYS,
} = {}) => {
	const normalizedExpiryDays = Number.isInteger(Number(expiryAlertDays)) && Number(expiryAlertDays) >= 0
		? Number(expiryAlertDays)
		: DEFAULT_EXPIRY_ALERT_DAYS;
	const normalizedDeadDays = Number.isInteger(Number(deadStockDays)) && Number(deadStockDays) > 0
		? Number(deadStockDays)
		: DEFAULT_DEAD_STOCK_DAYS;

	const products = await db.getAllAsync(
		`SELECT id, name, quantity, low_stock_threshold
		 FROM products
		 WHERE user_id = ?
			AND deleted_at IS NULL;`,
		userId
	);

	const salesRows = await db.getAllAsync(
		`SELECT
			si.product_id,
			MAX(sh.timestamp) AS last_sale_at,
			COALESCE(SUM(
				CASE
					WHEN datetime(sh.timestamp) >= datetime('now', '-30 days') THEN si.quantity
					ELSE 0
				END
			), 0) AS units_30d
		 FROM sales_items si
		 JOIN sales_header sh ON sh.id = si.sales_header_id
		 WHERE sh.user_id = ?
			AND sh.deleted_at IS NULL
			AND sh.status = 'posted'
		 GROUP BY si.product_id;`,
		userId
	);

	const batchRows = await db.getAllAsync(
		`SELECT
			product_id,
			COALESCE(SUM(quantity), 0) AS batch_qty,
			COALESCE(SUM(CASE
				WHEN expiry_date IS NOT NULL
					AND datetime(expiry_date) <= datetime('now', ?)
				THEN quantity
				ELSE 0
			END), 0) AS expiring_qty,
			MIN(CASE
				WHEN expiry_date IS NOT NULL AND quantity > 0 THEN expiry_date
				ELSE NULL
			END) AS nearest_expiry_date
		 FROM inventory_batches
		 WHERE user_id = ?
			AND deleted_at IS NULL
		 GROUP BY product_id;`,
		`+${normalizedExpiryDays} days`,
		userId
	);

	const saleByProductId = new Map((salesRows || []).map((row) => [Number(row.product_id), row]));
	const batchByProductId = new Map((batchRows || []).map((row) => [Number(row.product_id), row]));
	const activeKeys = new Set();

	for (const product of products || []) {
		const productId = Number(product.id);
		const quantity = Number(product.quantity || 0);
		const threshold = Math.max(0, Number(product.low_stock_threshold || 0));
		const batchInfo = batchByProductId.get(productId);
		const saleInfo = saleByProductId.get(productId);
		const units30d = Math.max(0, Number(saleInfo?.units_30d || 0));
		const avgDaily = units30d / 30;
		const demandCapacity = Math.max(
			threshold * 4,
			Math.ceil(avgDaily * OVERSTOCK_COVERAGE_DAYS)
		);

		let deadStockFlag = 0;
		if (quantity > 0) {
			const lastSaleAtRaw = saleInfo?.last_sale_at ? new Date(saleInfo.last_sale_at) : null;
			const hasLastSale = lastSaleAtRaw instanceof Date && !Number.isNaN(lastSaleAtRaw.getTime());
			if (!hasLastSale) {
				deadStockFlag = 1;
			} else {
				const ageMs = Date.now() - lastSaleAtRaw.getTime();
				deadStockFlag = ageMs >= normalizedDeadDays * 24 * 60 * 60 * 1000 ? 1 : 0;
			}
		}

		await db.runAsync(
			`UPDATE products
			 SET dead_stock_flag = ?
			 WHERE id = ?
				AND user_id = ?;`,
			deadStockFlag,
			productId,
			userId
		);

		if (quantity <= threshold) {
			const key = `LOW_STOCK:${productId}`;
			activeKeys.add(key);
			await upsertInventoryAlertTx({
				userId,
				productId,
				alertType: 'LOW_STOCK',
				message: `${String(product.name || 'Product')} is low stock (${quantity} <= ${threshold}).`,
				severity: quantity === 0 ? 'critical' : 'high',
				syncUpdatedAt,
			});
		}

		if (Number(batchInfo?.expiring_qty || 0) > 0) {
			const key = `EXPIRY:${productId}`;
			activeKeys.add(key);
			await upsertInventoryAlertTx({
				userId,
				productId,
				alertType: 'EXPIRY',
				message: `${String(product.name || 'Product')} has ${Number(batchInfo.expiring_qty || 0)} unit(s) expiring within ${normalizedExpiryDays} days.`,
				severity: 'high',
				syncUpdatedAt,
			});
		}

		if (quantity > 0 && deadStockFlag === 1) {
			const key = `DEAD_STOCK:${productId}`;
			activeKeys.add(key);
			await upsertInventoryAlertTx({
				userId,
				productId,
				alertType: 'DEAD_STOCK',
				message: `${String(product.name || 'Product')} has stock with no sales activity for ${normalizedDeadDays}+ days.`,
				severity: 'medium',
				syncUpdatedAt,
			});
		}

		if (quantity > demandCapacity && demandCapacity > 0) {
			const key = `OVERSTOCK:${productId}`;
			activeKeys.add(key);
			await upsertInventoryAlertTx({
				userId,
				productId,
				alertType: 'OVERSTOCK',
				message: `${String(product.name || 'Product')} appears overstocked (${quantity} > capacity ${demandCapacity}).`,
				severity: 'medium',
				syncUpdatedAt,
			});
		}
	}

	const existingActive = await db.getAllAsync(
		`SELECT alert_key
		 FROM alerts
		 WHERE user_id = ?
			AND is_active = 1;`,
		userId
	);

	for (const row of existingActive || []) {
		const alertKey = String(row.alert_key || '').trim();
		if (alertKey && !activeKeys.has(alertKey)) {
			await resolveInventoryAlertTx({ userId, alertKey, syncUpdatedAt });
		}
	}
};

const migrateLegacyUsersTable = async () => {
	const tableInfo = await db.getAllAsync(`PRAGMA table_info(users);`);
	const columnNames = new Set((tableInfo || []).map((column) => String(column?.name || '')));
	const hasLegacyCredentialColumns = columnNames.has('password_hash') || columnNames.has('password_salt');

	if (!hasLegacyCredentialColumns) {
		return;
	}

	await db.execAsync('PRAGMA foreign_keys = OFF;');

	try {
		await db.execAsync('BEGIN TRANSACTION;');
		await db.execAsync(`DROP TABLE IF EXISTS users_migrated;`);
		await db.execAsync(`CREATE TABLE users_migrated (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			name TEXT,
			profile_image_uri TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_login_at DATETIME
		);`);

		await db.execAsync(`INSERT INTO users_migrated (id, email, name, profile_image_uri, created_at, updated_at, last_login_at)
			SELECT id, email, NULL, NULL, COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP), last_login_at
			FROM users;`);

		await db.execAsync(`DROP TABLE users;`);
		await db.execAsync(`ALTER TABLE users_migrated RENAME TO users;`);
		await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
		await db.execAsync('COMMIT;');
	} catch (error) {
		await db.execAsync('ROLLBACK;');
		throw error;
	} finally {
		await db.execAsync('PRAGMA foreign_keys = ON;');
	}
};

export const createTables = async () => {
	await db.execAsync(`CREATE TABLE IF NOT EXISTS products (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
		low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
		price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS customers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		phone TEXT,
		address TEXT,
		credit_limit REAL NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
		current_balance REAL NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
		risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
		due_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (due_terms_days > 0),
		last_payment_date DATETIME,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL UNIQUE,
		name TEXT,
		profile_image_uri TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		last_login_at DATETIME
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS auth_sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		token TEXT NOT NULL UNIQUE,
		remember_me INTEGER NOT NULL DEFAULT 0 CHECK (remember_me IN (0, 1)),
		expires_at DATETIME NOT NULL,
		access_token TEXT,
		refresh_token TEXT,
		access_expires_at DATETIME,
		refresh_expires_at DATETIME,
		auth_mode TEXT NOT NULL DEFAULT 'offline' CHECK (auth_mode IN ('offline', 'online', 'hybrid')),
		last_server_check_at DATETIME,
		last_server_status TEXT,
		server_sync_pending INTEGER NOT NULL DEFAULT 0 CHECK (server_sync_pending IN (0, 1)),
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		revoked_at DATETIME,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS auth_device_profile (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		device_id TEXT NOT NULL,
		preferred_email TEXT,
		pin_enabled INTEGER NOT NULL DEFAULT 0 CHECK (pin_enabled IN (0, 1)),
		low_stock_notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (low_stock_notifications_enabled IN (0, 1)),
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS pending_sync_queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		entity_type TEXT NOT NULL,
		operation TEXT NOT NULL,
		payload_json TEXT,
		attempts INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS baki_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		customer_id INTEGER NOT NULL,
		amount REAL NOT NULL CHECK (amount > 0),
		paid_amount REAL NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
		status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
		note TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
		CHECK (paid_amount <= amount)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS baki_transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		customer_id INTEGER NOT NULL,
		type TEXT NOT NULL CHECK (type IN ('credit', 'payment')),
		amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
		due_date DATETIME,
		status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'overdue')),
		reference_id TEXT,
		reminder_sent_at DATETIME,
		resolved_at DATETIME,
		note TEXT,
		payment_method TEXT,
		legacy_entry_id INTEGER,
		legacy_kind TEXT CHECK (legacy_kind IN ('credit', 'payment')),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS collection_reminders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		customer_id INTEGER NOT NULL,
		baki_transaction_id INTEGER,
		channel TEXT NOT NULL DEFAULT 'manual' CHECK (channel IN ('sms', 'whatsapp', 'call', 'manual')),
		message TEXT,
		sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'failed')),
		reference_id TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
		FOREIGN KEY (baki_transaction_id) REFERENCES baki_transactions(id) ON DELETE SET NULL
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS payment_promises (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		customer_id INTEGER NOT NULL,
		promised_amount_cents INTEGER NOT NULL CHECK (promised_amount_cents > 0),
		promise_date DATETIME NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'broken')),
		note TEXT,
		fulfilled_baki_transaction_id INTEGER,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
		FOREIGN KEY (fulfilled_baki_transaction_id) REFERENCES baki_transactions(id) ON DELETE SET NULL
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_movements (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust')),
		stock_out_reason TEXT CHECK (stock_out_reason IN ('SALE', 'DAMAGE', 'EXPIRY', 'ADJUSTMENT')),
		quantity_delta INTEGER NOT NULL,
		quantity_before INTEGER NOT NULL,
		quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
		source_event_type TEXT,
		source_event_id INTEGER,
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS sales_header (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		receipt_id TEXT NOT NULL UNIQUE,
		customer_id INTEGER,
		timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
		payment_mode TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'posted',
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
		CHECK (status IN ('posted', 'voided', 'refunded'))
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS sales_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		sales_header_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		quantity INTEGER NOT NULL CHECK (quantity > 0),
		unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
		subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (sales_header_id) REFERENCES sales_header(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS payments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		sales_header_id INTEGER NOT NULL,
		amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
		method TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'PAID',
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (sales_header_id) REFERENCES sales_header(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS sales_returns (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		sales_item_id INTEGER NOT NULL,
		quantity INTEGER NOT NULL CHECK (quantity > 0),
		reason TEXT,
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (sales_item_id) REFERENCES sales_items(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS suppliers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		phone TEXT,
		address TEXT,
		due_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (due_amount_cents >= 0),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS purchase_orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		supplier_id INTEGER NOT NULL,
		purchase_code TEXT NOT NULL,
		purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		total_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
		paid_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
		due_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (due_amount_cents >= 0),
		status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'received', 'cancelled')),
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
		CHECK (paid_amount_cents <= total_amount_cents)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS purchase_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		purchase_order_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		ordered_qty INTEGER NOT NULL CHECK (ordered_qty > 0),
		received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
		pending_qty INTEGER NOT NULL CHECK (pending_qty >= 0),
		unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
		subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
		status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'received')),
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
		CHECK (received_qty <= ordered_qty),
		CHECK (pending_qty = ordered_qty - received_qty)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS supplier_payables (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		supplier_id INTEGER NOT NULL,
		purchase_order_id INTEGER,
		entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'payment')),
		amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
		running_due_cents INTEGER NOT NULL DEFAULT 0 CHECK (running_due_cents >= 0),
		payment_method TEXT,
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
		FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS inventory_batches (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		batch_number TEXT,
		quantity INTEGER NOT NULL CHECK (quantity >= 0),
		expiry_date DATETIME,
		purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		cost_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS cycle_counts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		system_quantity INTEGER NOT NULL CHECK (system_quantity >= 0),
		physical_quantity INTEGER NOT NULL CHECK (physical_quantity >= 0),
		variance INTEGER NOT NULL,
		timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS alerts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		alert_key TEXT NOT NULL,
		alert_type TEXT NOT NULL CHECK (alert_type IN ('LOW_STOCK', 'EXPIRY', 'OVERSTOCK', 'DEAD_STOCK')),
		message TEXT NOT NULL,
		severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
		is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
		resolved_at DATETIME,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
		UNIQUE (user_id, alert_key)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS expenses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		expense_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		category TEXT NOT NULL DEFAULT 'GENERAL',
		title TEXT NOT NULL,
		amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
		payment_method TEXT,
		note TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS cashbook_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		entry_type TEXT NOT NULL CHECK (entry_type IN ('IN', 'OUT')),
		category TEXT NOT NULL DEFAULT 'GENERAL',
		amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
		payment_method TEXT,
		reference_type TEXT,
		reference_local_id INTEGER,
		reference_client_ref_id TEXT,
		note TEXT,
		occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS day_closes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		business_date TEXT NOT NULL,
		opening_balance_cents INTEGER NOT NULL DEFAULT 0,
		total_in_cents INTEGER NOT NULL DEFAULT 0,
		total_out_cents INTEGER NOT NULL DEFAULT 0,
		closing_balance_cents INTEGER NOT NULL DEFAULT 0,
		cash_on_hand_cents INTEGER,
		variance_cents INTEGER,
		status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
		note TEXT,
		closed_at DATETIME,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE (user_id, business_date)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		entity_type TEXT NOT NULL,
		entity_id INTEGER,
		action TEXT NOT NULL,
		metadata_json TEXT,
		notes TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS sync_state (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL UNIQUE,
		last_sync_at DATETIME,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS pilot_shops (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		shop_name TEXT NOT NULL CHECK (length(trim(shop_name)) > 0),
		type TEXT NOT NULL,
		onboarding_date DATETIME,
		status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused', 'completed')),
		estimated_daily_sales REAL NOT NULL DEFAULT 0 CHECK (estimated_daily_sales >= 0),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS analytics_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		shop_id INTEGER,
		event_type TEXT NOT NULL,
		timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		source TEXT,
		metadata_json TEXT,
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (shop_id) REFERENCES pilot_shops(id) ON DELETE SET NULL
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS feedback (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		shop_id INTEGER NOT NULL,
		category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'ux')),
		rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
		message TEXT NOT NULL CHECK (length(trim(message)) > 0),
		timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
		server_id TEXT,
		client_ref_id TEXT,
		sync_version INTEGER NOT NULL DEFAULT 1,
		sync_updated_at DATETIME,
		deleted_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (shop_id) REFERENCES pilot_shops(id) ON DELETE CASCADE
	);`);

	const createIndexSafely = async (sql) => {
		try {
			await db.execAsync(sql);
		} catch (error) {
			const message = String(error?.message || '').toLowerCase();
			// Legacy databases can miss columns that are added later in this function.
			if (message.includes('no such column')) {
				return;
			}

			throw error;
		}
	};

	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_customer_id ON baki_entries(customer_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_created_at ON baki_entries(created_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_customer_id ON baki_transactions(customer_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_created_at ON baki_transactions(created_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_due_status ON baki_transactions(user_id, status, due_date);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_reference ON baki_transactions(user_id, reference_id);`);
	await createIndexSafely(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_legacy ON baki_transactions(legacy_entry_id, legacy_kind);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_collection_reminders_customer_sent ON collection_reminders(customer_id, sent_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_collection_reminders_user_status ON collection_reminders(user_id, status, sent_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_payment_promises_customer_date ON payment_promises(customer_id, promise_date DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_payment_promises_user_status ON payment_promises(user_id, status, promise_date);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_stock_movements_reason ON stock_movements(stock_out_reason);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_stock_movements_source_event ON stock_movements(source_event_type, source_event_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_header_user_timestamp ON sales_header(user_id, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_header_receipt_id ON sales_header(receipt_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_header_customer_id ON sales_header(customer_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_items_header_id ON sales_items(sales_header_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_items_product_id ON sales_items(product_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_payments_sales_header_id ON payments(sales_header_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_sales_returns_sales_item_id ON sales_returns(sales_item_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_suppliers_user_name ON suppliers(user_id, name);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_suppliers_due ON suppliers(user_id, due_amount_cents DESC);`);
	await createIndexSafely(`CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_user_code ON purchase_orders(user_id, purchase_code);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_date ON purchase_orders(supplier_id, purchase_date DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(user_id, status);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_purchase_items_order_id ON purchase_items(purchase_order_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_supplier_payables_supplier_created ON supplier_payables(supplier_id, created_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_supplier_payables_order_id ON supplier_payables(purchase_order_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_expiry ON inventory_batches(product_id, expiry_date, purchase_date);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_inventory_batches_user_id ON inventory_batches(user_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_cycle_counts_product_timestamp ON cycle_counts(product_id, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_cycle_counts_user_id ON cycle_counts(user_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_alerts_user_active ON alerts(user_id, is_active, severity);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_alerts_product_type ON alerts(product_id, alert_type);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, expense_date DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(user_id, category);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_cashbook_user_occurred ON cashbook_entries(user_id, occurred_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_cashbook_type ON cashbook_entries(user_id, entry_type, occurred_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_day_closes_user_date ON day_closes(user_id, business_date DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_pilot_shops_user_status ON pilot_shops(user_id, status, onboarding_date DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time ON analytics_events(user_id, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(user_id, event_type, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_feedback_user_time ON feedback(user_id, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(user_id, category, timestamp DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_access_expires_at ON auth_sessions(access_expires_at DESC);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_auth_device_profile_email ON auth_device_profile(preferred_email);`);
	await createIndexSafely(`CREATE INDEX IF NOT EXISTS idx_pending_sync_queue_created_at ON pending_sync_queue(created_at ASC);`);

	await ensureColumn(
		'products',
		'quantity',
		`ALTER TABLE products ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0;`
	);
	await ensureColumn(
		'products',
		'price',
		`ALTER TABLE products ADD COLUMN price REAL NOT NULL DEFAULT 0;`
	);
	await ensureColumn(
		'products',
		'low_stock_threshold',
		`ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;`
	);
	await ensureColumn('products', 'created_at', `ALTER TABLE products ADD COLUMN created_at DATETIME;`);
	await ensureColumn('products', 'expiry_date', `ALTER TABLE products ADD COLUMN expiry_date TEXT;`);
	await ensureColumn('products', 'user_id', `ALTER TABLE products ADD COLUMN user_id INTEGER;`);
	await ensureColumn('products', 'server_id', `ALTER TABLE products ADD COLUMN server_id TEXT;`);
	await ensureColumn('products', 'client_ref_id', `ALTER TABLE products ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('products', 'sync_version', `ALTER TABLE products ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('products', 'sync_updated_at', `ALTER TABLE products ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('products', 'deleted_at', `ALTER TABLE products ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('products', 'dead_stock_flag', `ALTER TABLE products ADD COLUMN dead_stock_flag INTEGER NOT NULL DEFAULT 0;`);

	await ensureColumn('customers', 'phone', `ALTER TABLE customers ADD COLUMN phone TEXT;`);
	await ensureColumn('customers', 'address', `ALTER TABLE customers ADD COLUMN address TEXT;`);
	await ensureColumn(
		'customers',
		'created_at',
		`ALTER TABLE customers ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;`
	);
	await ensureColumn(
		'customers',
		'updated_at',
		`ALTER TABLE customers ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;`
	);
	await ensureColumn('customers', 'user_id', `ALTER TABLE customers ADD COLUMN user_id INTEGER;`);
	await ensureColumn('customers', 'server_id', `ALTER TABLE customers ADD COLUMN server_id TEXT;`);
	await ensureColumn('customers', 'client_ref_id', `ALTER TABLE customers ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('customers', 'sync_version', `ALTER TABLE customers ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('customers', 'sync_updated_at', `ALTER TABLE customers ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('customers', 'deleted_at', `ALTER TABLE customers ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('customers', 'credit_limit', `ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;`);
	await ensureColumn('customers', 'current_balance', `ALTER TABLE customers ADD COLUMN current_balance REAL NOT NULL DEFAULT 0;`);
	await ensureColumn('customers', 'risk_level', `ALTER TABLE customers ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low';`);
	await ensureColumn('customers', 'due_terms_days', `ALTER TABLE customers ADD COLUMN due_terms_days INTEGER NOT NULL DEFAULT 30;`);
	await ensureColumn('customers', 'last_payment_date', `ALTER TABLE customers ADD COLUMN last_payment_date DATETIME;`);

	await ensureColumn('users', 'last_login_at', `ALTER TABLE users ADD COLUMN last_login_at DATETIME;`);
	await ensureColumn('users', 'name', `ALTER TABLE users ADD COLUMN name TEXT;`);
	await ensureColumn('users', 'profile_image_uri', `ALTER TABLE users ADD COLUMN profile_image_uri TEXT;`);
	await migrateLegacyUsersTable();
	await ensureColumn('auth_sessions', 'access_token', `ALTER TABLE auth_sessions ADD COLUMN access_token TEXT;`);
	await ensureColumn('auth_sessions', 'refresh_token', `ALTER TABLE auth_sessions ADD COLUMN refresh_token TEXT;`);
	await ensureColumn('auth_sessions', 'access_expires_at', `ALTER TABLE auth_sessions ADD COLUMN access_expires_at DATETIME;`);
	await ensureColumn('auth_sessions', 'refresh_expires_at', `ALTER TABLE auth_sessions ADD COLUMN refresh_expires_at DATETIME;`);
	await ensureColumn(
		'auth_sessions',
		'auth_mode',
		`ALTER TABLE auth_sessions ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'offline';`
	);
	await ensureColumn('auth_sessions', 'last_server_check_at', `ALTER TABLE auth_sessions ADD COLUMN last_server_check_at DATETIME;`);
	await ensureColumn('auth_sessions', 'last_server_status', `ALTER TABLE auth_sessions ADD COLUMN last_server_status TEXT;`);
	await ensureColumn(
		'auth_sessions',
		'server_sync_pending',
		`ALTER TABLE auth_sessions ADD COLUMN server_sync_pending INTEGER NOT NULL DEFAULT 0;`
	);
	await ensureColumn(
		'auth_device_profile',
		'low_stock_notifications_enabled',
		`ALTER TABLE auth_device_profile ADD COLUMN low_stock_notifications_enabled INTEGER NOT NULL DEFAULT 1;`
	);

	await ensureColumn('baki_entries', 'paid_amount', `ALTER TABLE baki_entries ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;`);
	await ensureColumn('baki_entries', 'status', `ALTER TABLE baki_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'unpaid';`);
	await ensureColumn('baki_entries', 'note', `ALTER TABLE baki_entries ADD COLUMN note TEXT;`);
	await ensureColumn('baki_entries', 'created_at', `ALTER TABLE baki_entries ADD COLUMN created_at DATETIME;`);
	await ensureColumn('baki_entries', 'updated_at', `ALTER TABLE baki_entries ADD COLUMN updated_at DATETIME;`);
	await ensureColumn('baki_entries', 'user_id', `ALTER TABLE baki_entries ADD COLUMN user_id INTEGER;`);
	await ensureColumn('baki_transactions', 'user_id', `ALTER TABLE baki_transactions ADD COLUMN user_id INTEGER;`);
	await ensureColumn('baki_transactions', 'server_id', `ALTER TABLE baki_transactions ADD COLUMN server_id TEXT;`);
	await ensureColumn('baki_transactions', 'client_ref_id', `ALTER TABLE baki_transactions ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('baki_transactions', 'sync_version', `ALTER TABLE baki_transactions ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('baki_transactions', 'sync_updated_at', `ALTER TABLE baki_transactions ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('baki_transactions', 'deleted_at', `ALTER TABLE baki_transactions ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('baki_transactions', 'due_date', `ALTER TABLE baki_transactions ADD COLUMN due_date DATETIME;`);
	await ensureColumn('baki_transactions', 'status', `ALTER TABLE baki_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'open';`);
	await ensureColumn('baki_transactions', 'reference_id', `ALTER TABLE baki_transactions ADD COLUMN reference_id TEXT;`);
	await ensureColumn('baki_transactions', 'reminder_sent_at', `ALTER TABLE baki_transactions ADD COLUMN reminder_sent_at DATETIME;`);
	await ensureColumn('baki_transactions', 'resolved_at', `ALTER TABLE baki_transactions ADD COLUMN resolved_at DATETIME;`);
	await ensureColumn('baki_transactions', 'payment_code', `ALTER TABLE baki_transactions ADD COLUMN payment_code TEXT;`);
	await ensureColumn('baki_transactions', 'payment_code_expires_at', `ALTER TABLE baki_transactions ADD COLUMN payment_code_expires_at DATETIME;`);
	await ensureColumn('baki_transactions', 'payment_code_used', `ALTER TABLE baki_transactions ADD COLUMN payment_code_used INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('baki_transactions', 'image_url', `ALTER TABLE baki_transactions ADD COLUMN image_url TEXT;`);
	await ensureColumn('customers', 'pin_hash', `ALTER TABLE customers ADD COLUMN pin_hash TEXT;`);
	await ensureColumn('customers', 'verification_level', `ALTER TABLE customers ADD COLUMN verification_level TEXT NOT NULL DEFAULT 'L0';`);
	await ensureColumn('customers', 'global_id', `ALTER TABLE customers ADD COLUMN global_id TEXT;`);
	await ensureColumn('stock_movements', 'user_id', `ALTER TABLE stock_movements ADD COLUMN user_id INTEGER;`);
	await ensureColumn('stock_movements', 'server_id', `ALTER TABLE stock_movements ADD COLUMN server_id TEXT;`);
	await ensureColumn('stock_movements', 'client_ref_id', `ALTER TABLE stock_movements ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('stock_movements', 'sync_version', `ALTER TABLE stock_movements ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('stock_movements', 'sync_updated_at', `ALTER TABLE stock_movements ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('stock_movements', 'deleted_at', `ALTER TABLE stock_movements ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('stock_movements', 'stock_out_reason', `ALTER TABLE stock_movements ADD COLUMN stock_out_reason TEXT;`);
	await ensureColumn('stock_movements', 'source_event_type', `ALTER TABLE stock_movements ADD COLUMN source_event_type TEXT;`);
	await ensureColumn('stock_movements', 'source_event_id', `ALTER TABLE stock_movements ADD COLUMN source_event_id INTEGER;`);

	await ensureColumn('sales_header', 'user_id', `ALTER TABLE sales_header ADD COLUMN user_id INTEGER;`);
	await ensureColumn('sales_header', 'receipt_id', `ALTER TABLE sales_header ADD COLUMN receipt_id TEXT;`);
	await ensureColumn('sales_header', 'customer_id', `ALTER TABLE sales_header ADD COLUMN customer_id INTEGER;`);
	await ensureColumn('sales_header', 'timestamp', `ALTER TABLE sales_header ADD COLUMN timestamp DATETIME;`);
	await ensureColumn('sales_header', 'total_amount_cents', `ALTER TABLE sales_header ADD COLUMN total_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('sales_header', 'payment_mode', `ALTER TABLE sales_header ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'CASH';`);
	await ensureColumn('sales_header', 'status', `ALTER TABLE sales_header ADD COLUMN status TEXT NOT NULL DEFAULT 'posted';`);
	await ensureColumn('sales_header', 'note', `ALTER TABLE sales_header ADD COLUMN note TEXT;`);
	await ensureColumn('sales_header', 'server_id', `ALTER TABLE sales_header ADD COLUMN server_id TEXT;`);
	await ensureColumn('sales_header', 'client_ref_id', `ALTER TABLE sales_header ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('sales_header', 'sync_version', `ALTER TABLE sales_header ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('sales_header', 'sync_updated_at', `ALTER TABLE sales_header ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('sales_header', 'deleted_at', `ALTER TABLE sales_header ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('sales_header', 'created_at', `ALTER TABLE sales_header ADD COLUMN created_at DATETIME;`);
	await ensureColumn('sales_header', 'updated_at', `ALTER TABLE sales_header ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('sales_items', 'user_id', `ALTER TABLE sales_items ADD COLUMN user_id INTEGER;`);
	await ensureColumn('sales_items', 'sales_header_id', `ALTER TABLE sales_items ADD COLUMN sales_header_id INTEGER;`);
	await ensureColumn('sales_items', 'product_id', `ALTER TABLE sales_items ADD COLUMN product_id INTEGER;`);
	await ensureColumn('sales_items', 'quantity', `ALTER TABLE sales_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('sales_items', 'unit_price_cents', `ALTER TABLE sales_items ADD COLUMN unit_price_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('sales_items', 'subtotal_cents', `ALTER TABLE sales_items ADD COLUMN subtotal_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('sales_items', 'note', `ALTER TABLE sales_items ADD COLUMN note TEXT;`);
	await ensureColumn('sales_items', 'server_id', `ALTER TABLE sales_items ADD COLUMN server_id TEXT;`);
	await ensureColumn('sales_items', 'client_ref_id', `ALTER TABLE sales_items ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('sales_items', 'sync_version', `ALTER TABLE sales_items ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('sales_items', 'sync_updated_at', `ALTER TABLE sales_items ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('sales_items', 'deleted_at', `ALTER TABLE sales_items ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('sales_items', 'created_at', `ALTER TABLE sales_items ADD COLUMN created_at DATETIME;`);

	await ensureColumn('payments', 'user_id', `ALTER TABLE payments ADD COLUMN user_id INTEGER;`);
	await ensureColumn('payments', 'sales_header_id', `ALTER TABLE payments ADD COLUMN sales_header_id INTEGER;`);
	await ensureColumn('payments', 'amount_cents', `ALTER TABLE payments ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('payments', 'method', `ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'CASH';`);
	await ensureColumn('payments', 'status', `ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'PAID';`);
	await ensureColumn('payments', 'note', `ALTER TABLE payments ADD COLUMN note TEXT;`);
	await ensureColumn('payments', 'server_id', `ALTER TABLE payments ADD COLUMN server_id TEXT;`);
	await ensureColumn('payments', 'client_ref_id', `ALTER TABLE payments ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('payments', 'sync_version', `ALTER TABLE payments ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('payments', 'sync_updated_at', `ALTER TABLE payments ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('payments', 'deleted_at', `ALTER TABLE payments ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('payments', 'created_at', `ALTER TABLE payments ADD COLUMN created_at DATETIME;`);

	await ensureColumn('sales_returns', 'user_id', `ALTER TABLE sales_returns ADD COLUMN user_id INTEGER;`);
	await ensureColumn('sales_returns', 'sales_item_id', `ALTER TABLE sales_returns ADD COLUMN sales_item_id INTEGER;`);
	await ensureColumn('sales_returns', 'quantity', `ALTER TABLE sales_returns ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('sales_returns', 'reason', `ALTER TABLE sales_returns ADD COLUMN reason TEXT;`);
	await ensureColumn('sales_returns', 'note', `ALTER TABLE sales_returns ADD COLUMN note TEXT;`);
	await ensureColumn('sales_returns', 'server_id', `ALTER TABLE sales_returns ADD COLUMN server_id TEXT;`);
	await ensureColumn('sales_returns', 'client_ref_id', `ALTER TABLE sales_returns ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('sales_returns', 'sync_version', `ALTER TABLE sales_returns ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('sales_returns', 'sync_updated_at', `ALTER TABLE sales_returns ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('sales_returns', 'deleted_at', `ALTER TABLE sales_returns ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('sales_returns', 'created_at', `ALTER TABLE sales_returns ADD COLUMN created_at DATETIME;`);

	await ensureColumn('suppliers', 'user_id', `ALTER TABLE suppliers ADD COLUMN user_id INTEGER;`);
	await ensureColumn('suppliers', 'name', `ALTER TABLE suppliers ADD COLUMN name TEXT;`);
	await ensureColumn('suppliers', 'phone', `ALTER TABLE suppliers ADD COLUMN phone TEXT;`);
	await ensureColumn('suppliers', 'address', `ALTER TABLE suppliers ADD COLUMN address TEXT;`);
	await ensureColumn('suppliers', 'due_amount_cents', `ALTER TABLE suppliers ADD COLUMN due_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('suppliers', 'server_id', `ALTER TABLE suppliers ADD COLUMN server_id TEXT;`);
	await ensureColumn('suppliers', 'client_ref_id', `ALTER TABLE suppliers ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('suppliers', 'sync_version', `ALTER TABLE suppliers ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('suppliers', 'sync_updated_at', `ALTER TABLE suppliers ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('suppliers', 'deleted_at', `ALTER TABLE suppliers ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('suppliers', 'created_at', `ALTER TABLE suppliers ADD COLUMN created_at DATETIME;`);
	await ensureColumn('suppliers', 'updated_at', `ALTER TABLE suppliers ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('purchase_orders', 'user_id', `ALTER TABLE purchase_orders ADD COLUMN user_id INTEGER;`);
	await ensureColumn('purchase_orders', 'supplier_id', `ALTER TABLE purchase_orders ADD COLUMN supplier_id INTEGER;`);
	await ensureColumn('purchase_orders', 'purchase_code', `ALTER TABLE purchase_orders ADD COLUMN purchase_code TEXT;`);
	await ensureColumn('purchase_orders', 'purchase_date', `ALTER TABLE purchase_orders ADD COLUMN purchase_date DATETIME;`);
	await ensureColumn('purchase_orders', 'total_amount_cents', `ALTER TABLE purchase_orders ADD COLUMN total_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_orders', 'paid_amount_cents', `ALTER TABLE purchase_orders ADD COLUMN paid_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_orders', 'due_amount_cents', `ALTER TABLE purchase_orders ADD COLUMN due_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_orders', 'status', `ALTER TABLE purchase_orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';`);
	await ensureColumn('purchase_orders', 'note', `ALTER TABLE purchase_orders ADD COLUMN note TEXT;`);
	await ensureColumn('purchase_orders', 'server_id', `ALTER TABLE purchase_orders ADD COLUMN server_id TEXT;`);
	await ensureColumn('purchase_orders', 'client_ref_id', `ALTER TABLE purchase_orders ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('purchase_orders', 'sync_version', `ALTER TABLE purchase_orders ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('purchase_orders', 'sync_updated_at', `ALTER TABLE purchase_orders ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('purchase_orders', 'deleted_at', `ALTER TABLE purchase_orders ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('purchase_orders', 'created_at', `ALTER TABLE purchase_orders ADD COLUMN created_at DATETIME;`);
	await ensureColumn('purchase_orders', 'updated_at', `ALTER TABLE purchase_orders ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('purchase_items', 'user_id', `ALTER TABLE purchase_items ADD COLUMN user_id INTEGER;`);
	await ensureColumn('purchase_items', 'purchase_order_id', `ALTER TABLE purchase_items ADD COLUMN purchase_order_id INTEGER;`);
	await ensureColumn('purchase_items', 'product_id', `ALTER TABLE purchase_items ADD COLUMN product_id INTEGER;`);
	await ensureColumn('purchase_items', 'ordered_qty', `ALTER TABLE purchase_items ADD COLUMN ordered_qty INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('purchase_items', 'received_qty', `ALTER TABLE purchase_items ADD COLUMN received_qty INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_items', 'pending_qty', `ALTER TABLE purchase_items ADD COLUMN pending_qty INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('purchase_items', 'unit_cost_cents', `ALTER TABLE purchase_items ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_items', 'subtotal_cents', `ALTER TABLE purchase_items ADD COLUMN subtotal_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('purchase_items', 'status', `ALTER TABLE purchase_items ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';`);
	await ensureColumn('purchase_items', 'note', `ALTER TABLE purchase_items ADD COLUMN note TEXT;`);
	await ensureColumn('purchase_items', 'server_id', `ALTER TABLE purchase_items ADD COLUMN server_id TEXT;`);
	await ensureColumn('purchase_items', 'client_ref_id', `ALTER TABLE purchase_items ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('purchase_items', 'sync_version', `ALTER TABLE purchase_items ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('purchase_items', 'sync_updated_at', `ALTER TABLE purchase_items ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('purchase_items', 'deleted_at', `ALTER TABLE purchase_items ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('purchase_items', 'created_at', `ALTER TABLE purchase_items ADD COLUMN created_at DATETIME;`);
	await ensureColumn('purchase_items', 'updated_at', `ALTER TABLE purchase_items ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('supplier_payables', 'user_id', `ALTER TABLE supplier_payables ADD COLUMN user_id INTEGER;`);
	await ensureColumn('supplier_payables', 'supplier_id', `ALTER TABLE supplier_payables ADD COLUMN supplier_id INTEGER;`);
	await ensureColumn('supplier_payables', 'purchase_order_id', `ALTER TABLE supplier_payables ADD COLUMN purchase_order_id INTEGER;`);
	await ensureColumn('supplier_payables', 'entry_type', `ALTER TABLE supplier_payables ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'credit';`);
	await ensureColumn('supplier_payables', 'amount_cents', `ALTER TABLE supplier_payables ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('supplier_payables', 'running_due_cents', `ALTER TABLE supplier_payables ADD COLUMN running_due_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('supplier_payables', 'payment_method', `ALTER TABLE supplier_payables ADD COLUMN payment_method TEXT;`);
	await ensureColumn('supplier_payables', 'note', `ALTER TABLE supplier_payables ADD COLUMN note TEXT;`);
	await ensureColumn('supplier_payables', 'server_id', `ALTER TABLE supplier_payables ADD COLUMN server_id TEXT;`);
	await ensureColumn('supplier_payables', 'client_ref_id', `ALTER TABLE supplier_payables ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('supplier_payables', 'sync_version', `ALTER TABLE supplier_payables ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('supplier_payables', 'sync_updated_at', `ALTER TABLE supplier_payables ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('supplier_payables', 'deleted_at', `ALTER TABLE supplier_payables ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('supplier_payables', 'created_at', `ALTER TABLE supplier_payables ADD COLUMN created_at DATETIME;`);

	await ensureColumn('inventory_batches', 'user_id', `ALTER TABLE inventory_batches ADD COLUMN user_id INTEGER;`);
	await ensureColumn('inventory_batches', 'product_id', `ALTER TABLE inventory_batches ADD COLUMN product_id INTEGER;`);
	await ensureColumn('inventory_batches', 'batch_number', `ALTER TABLE inventory_batches ADD COLUMN batch_number TEXT;`);
	await ensureColumn('inventory_batches', 'quantity', `ALTER TABLE inventory_batches ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('inventory_batches', 'expiry_date', `ALTER TABLE inventory_batches ADD COLUMN expiry_date DATETIME;`);
	await ensureColumn('inventory_batches', 'purchase_date', `ALTER TABLE inventory_batches ADD COLUMN purchase_date DATETIME;`);
	await ensureColumn('inventory_batches', 'cost_price_cents', `ALTER TABLE inventory_batches ADD COLUMN cost_price_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('inventory_batches', 'server_id', `ALTER TABLE inventory_batches ADD COLUMN server_id TEXT;`);
	await ensureColumn('inventory_batches', 'client_ref_id', `ALTER TABLE inventory_batches ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('inventory_batches', 'sync_version', `ALTER TABLE inventory_batches ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('inventory_batches', 'sync_updated_at', `ALTER TABLE inventory_batches ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('inventory_batches', 'deleted_at', `ALTER TABLE inventory_batches ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('inventory_batches', 'created_at', `ALTER TABLE inventory_batches ADD COLUMN created_at DATETIME;`);
	await ensureColumn('inventory_batches', 'updated_at', `ALTER TABLE inventory_batches ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('cycle_counts', 'user_id', `ALTER TABLE cycle_counts ADD COLUMN user_id INTEGER;`);
	await ensureColumn('cycle_counts', 'product_id', `ALTER TABLE cycle_counts ADD COLUMN product_id INTEGER;`);
	await ensureColumn('cycle_counts', 'system_quantity', `ALTER TABLE cycle_counts ADD COLUMN system_quantity INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('cycle_counts', 'physical_quantity', `ALTER TABLE cycle_counts ADD COLUMN physical_quantity INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('cycle_counts', 'variance', `ALTER TABLE cycle_counts ADD COLUMN variance INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('cycle_counts', 'timestamp', `ALTER TABLE cycle_counts ADD COLUMN timestamp DATETIME;`);
	await ensureColumn('cycle_counts', 'note', `ALTER TABLE cycle_counts ADD COLUMN note TEXT;`);
	await ensureColumn('cycle_counts', 'server_id', `ALTER TABLE cycle_counts ADD COLUMN server_id TEXT;`);
	await ensureColumn('cycle_counts', 'client_ref_id', `ALTER TABLE cycle_counts ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('cycle_counts', 'sync_version', `ALTER TABLE cycle_counts ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('cycle_counts', 'sync_updated_at', `ALTER TABLE cycle_counts ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('cycle_counts', 'deleted_at', `ALTER TABLE cycle_counts ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('cycle_counts', 'created_at', `ALTER TABLE cycle_counts ADD COLUMN created_at DATETIME;`);

	await ensureColumn('alerts', 'user_id', `ALTER TABLE alerts ADD COLUMN user_id INTEGER;`);
	await ensureColumn('alerts', 'product_id', `ALTER TABLE alerts ADD COLUMN product_id INTEGER;`);
	await ensureColumn('alerts', 'alert_key', `ALTER TABLE alerts ADD COLUMN alert_key TEXT;`);
	await ensureColumn('alerts', 'alert_type', `ALTER TABLE alerts ADD COLUMN alert_type TEXT;`);
	await ensureColumn('alerts', 'message', `ALTER TABLE alerts ADD COLUMN message TEXT;`);
	await ensureColumn('alerts', 'severity', `ALTER TABLE alerts ADD COLUMN severity TEXT;`);
	await ensureColumn('alerts', 'is_active', `ALTER TABLE alerts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('alerts', 'resolved_at', `ALTER TABLE alerts ADD COLUMN resolved_at DATETIME;`);
	await ensureColumn('alerts', 'server_id', `ALTER TABLE alerts ADD COLUMN server_id TEXT;`);
	await ensureColumn('alerts', 'client_ref_id', `ALTER TABLE alerts ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('alerts', 'sync_version', `ALTER TABLE alerts ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('alerts', 'sync_updated_at', `ALTER TABLE alerts ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('alerts', 'deleted_at', `ALTER TABLE alerts ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('alerts', 'created_at', `ALTER TABLE alerts ADD COLUMN created_at DATETIME;`);
	await ensureColumn('alerts', 'updated_at', `ALTER TABLE alerts ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('expenses', 'user_id', `ALTER TABLE expenses ADD COLUMN user_id INTEGER;`);
	await ensureColumn('expenses', 'expense_date', `ALTER TABLE expenses ADD COLUMN expense_date DATETIME;`);
	await ensureColumn('expenses', 'category', `ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL';`);
	await ensureColumn('expenses', 'title', `ALTER TABLE expenses ADD COLUMN title TEXT;`);
	await ensureColumn('expenses', 'amount_cents', `ALTER TABLE expenses ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('expenses', 'payment_method', `ALTER TABLE expenses ADD COLUMN payment_method TEXT;`);
	await ensureColumn('expenses', 'note', `ALTER TABLE expenses ADD COLUMN note TEXT;`);
	await ensureColumn('expenses', 'server_id', `ALTER TABLE expenses ADD COLUMN server_id TEXT;`);
	await ensureColumn('expenses', 'client_ref_id', `ALTER TABLE expenses ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('expenses', 'sync_version', `ALTER TABLE expenses ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('expenses', 'sync_updated_at', `ALTER TABLE expenses ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('expenses', 'deleted_at', `ALTER TABLE expenses ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('expenses', 'created_at', `ALTER TABLE expenses ADD COLUMN created_at DATETIME;`);
	await ensureColumn('expenses', 'updated_at', `ALTER TABLE expenses ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('cashbook_entries', 'user_id', `ALTER TABLE cashbook_entries ADD COLUMN user_id INTEGER;`);
	await ensureColumn('cashbook_entries', 'entry_type', `ALTER TABLE cashbook_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'IN';`);
	await ensureColumn('cashbook_entries', 'category', `ALTER TABLE cashbook_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL';`);
	await ensureColumn('cashbook_entries', 'amount_cents', `ALTER TABLE cashbook_entries ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('cashbook_entries', 'payment_method', `ALTER TABLE cashbook_entries ADD COLUMN payment_method TEXT;`);
	await ensureColumn('cashbook_entries', 'reference_type', `ALTER TABLE cashbook_entries ADD COLUMN reference_type TEXT;`);
	await ensureColumn('cashbook_entries', 'reference_local_id', `ALTER TABLE cashbook_entries ADD COLUMN reference_local_id INTEGER;`);
	await ensureColumn('cashbook_entries', 'reference_client_ref_id', `ALTER TABLE cashbook_entries ADD COLUMN reference_client_ref_id TEXT;`);
	await ensureColumn('cashbook_entries', 'note', `ALTER TABLE cashbook_entries ADD COLUMN note TEXT;`);
	await ensureColumn('cashbook_entries', 'occurred_at', `ALTER TABLE cashbook_entries ADD COLUMN occurred_at DATETIME;`);
	await ensureColumn('cashbook_entries', 'server_id', `ALTER TABLE cashbook_entries ADD COLUMN server_id TEXT;`);
	await ensureColumn('cashbook_entries', 'client_ref_id', `ALTER TABLE cashbook_entries ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('cashbook_entries', 'sync_version', `ALTER TABLE cashbook_entries ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('cashbook_entries', 'sync_updated_at', `ALTER TABLE cashbook_entries ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('cashbook_entries', 'deleted_at', `ALTER TABLE cashbook_entries ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('cashbook_entries', 'created_at', `ALTER TABLE cashbook_entries ADD COLUMN created_at DATETIME;`);
	await ensureColumn('cashbook_entries', 'updated_at', `ALTER TABLE cashbook_entries ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('day_closes', 'user_id', `ALTER TABLE day_closes ADD COLUMN user_id INTEGER;`);
	await ensureColumn('day_closes', 'business_date', `ALTER TABLE day_closes ADD COLUMN business_date TEXT;`);
	await ensureColumn('day_closes', 'opening_balance_cents', `ALTER TABLE day_closes ADD COLUMN opening_balance_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('day_closes', 'total_in_cents', `ALTER TABLE day_closes ADD COLUMN total_in_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('day_closes', 'total_out_cents', `ALTER TABLE day_closes ADD COLUMN total_out_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('day_closes', 'closing_balance_cents', `ALTER TABLE day_closes ADD COLUMN closing_balance_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('day_closes', 'cash_on_hand_cents', `ALTER TABLE day_closes ADD COLUMN cash_on_hand_cents INTEGER;`);
	await ensureColumn('day_closes', 'variance_cents', `ALTER TABLE day_closes ADD COLUMN variance_cents INTEGER;`);
	await ensureColumn('day_closes', 'status', `ALTER TABLE day_closes ADD COLUMN status TEXT NOT NULL DEFAULT 'closed';`);
	await ensureColumn('day_closes', 'note', `ALTER TABLE day_closes ADD COLUMN note TEXT;`);
	await ensureColumn('day_closes', 'closed_at', `ALTER TABLE day_closes ADD COLUMN closed_at DATETIME;`);
	await ensureColumn('day_closes', 'server_id', `ALTER TABLE day_closes ADD COLUMN server_id TEXT;`);
	await ensureColumn('day_closes', 'client_ref_id', `ALTER TABLE day_closes ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('day_closes', 'sync_version', `ALTER TABLE day_closes ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('day_closes', 'sync_updated_at', `ALTER TABLE day_closes ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('day_closes', 'deleted_at', `ALTER TABLE day_closes ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('day_closes', 'created_at', `ALTER TABLE day_closes ADD COLUMN created_at DATETIME;`);
	await ensureColumn('day_closes', 'updated_at', `ALTER TABLE day_closes ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('collection_reminders', 'user_id', `ALTER TABLE collection_reminders ADD COLUMN user_id INTEGER;`);
	await ensureColumn('collection_reminders', 'customer_id', `ALTER TABLE collection_reminders ADD COLUMN customer_id INTEGER;`);
	await ensureColumn('collection_reminders', 'baki_transaction_id', `ALTER TABLE collection_reminders ADD COLUMN baki_transaction_id INTEGER;`);
	await ensureColumn('collection_reminders', 'channel', `ALTER TABLE collection_reminders ADD COLUMN channel TEXT NOT NULL DEFAULT 'manual';`);
	await ensureColumn('collection_reminders', 'message', `ALTER TABLE collection_reminders ADD COLUMN message TEXT;`);
	await ensureColumn('collection_reminders', 'sent_at', `ALTER TABLE collection_reminders ADD COLUMN sent_at DATETIME;`);
	await ensureColumn('collection_reminders', 'status', `ALTER TABLE collection_reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'sent';`);
	await ensureColumn('collection_reminders', 'reference_id', `ALTER TABLE collection_reminders ADD COLUMN reference_id TEXT;`);
	await ensureColumn('collection_reminders', 'server_id', `ALTER TABLE collection_reminders ADD COLUMN server_id TEXT;`);
	await ensureColumn('collection_reminders', 'client_ref_id', `ALTER TABLE collection_reminders ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('collection_reminders', 'sync_version', `ALTER TABLE collection_reminders ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('collection_reminders', 'sync_updated_at', `ALTER TABLE collection_reminders ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('collection_reminders', 'deleted_at', `ALTER TABLE collection_reminders ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('collection_reminders', 'created_at', `ALTER TABLE collection_reminders ADD COLUMN created_at DATETIME;`);

	await ensureColumn('payment_promises', 'user_id', `ALTER TABLE payment_promises ADD COLUMN user_id INTEGER;`);
	await ensureColumn('payment_promises', 'customer_id', `ALTER TABLE payment_promises ADD COLUMN customer_id INTEGER;`);
	await ensureColumn('payment_promises', 'promised_amount_cents', `ALTER TABLE payment_promises ADD COLUMN promised_amount_cents INTEGER NOT NULL DEFAULT 0;`);
	await ensureColumn('payment_promises', 'promise_date', `ALTER TABLE payment_promises ADD COLUMN promise_date DATETIME;`);
	await ensureColumn('payment_promises', 'status', `ALTER TABLE payment_promises ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';`);
	await ensureColumn('payment_promises', 'note', `ALTER TABLE payment_promises ADD COLUMN note TEXT;`);
	await ensureColumn('payment_promises', 'fulfilled_baki_transaction_id', `ALTER TABLE payment_promises ADD COLUMN fulfilled_baki_transaction_id INTEGER;`);
	await ensureColumn('payment_promises', 'server_id', `ALTER TABLE payment_promises ADD COLUMN server_id TEXT;`);
	await ensureColumn('payment_promises', 'client_ref_id', `ALTER TABLE payment_promises ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('payment_promises', 'sync_version', `ALTER TABLE payment_promises ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('payment_promises', 'sync_updated_at', `ALTER TABLE payment_promises ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('payment_promises', 'deleted_at', `ALTER TABLE payment_promises ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('payment_promises', 'created_at', `ALTER TABLE payment_promises ADD COLUMN created_at DATETIME;`);
	await ensureColumn('payment_promises', 'updated_at', `ALTER TABLE payment_promises ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('pilot_shops', 'user_id', `ALTER TABLE pilot_shops ADD COLUMN user_id INTEGER;`);
	await ensureColumn('pilot_shops', 'shop_name', `ALTER TABLE pilot_shops ADD COLUMN shop_name TEXT;`);
	await ensureColumn('pilot_shops', 'type', `ALTER TABLE pilot_shops ADD COLUMN type TEXT;`);
	await ensureColumn('pilot_shops', 'onboarding_date', `ALTER TABLE pilot_shops ADD COLUMN onboarding_date DATETIME;`);
	await ensureColumn('pilot_shops', 'status', `ALTER TABLE pilot_shops ADD COLUMN status TEXT NOT NULL DEFAULT 'planned';`);
	await ensureColumn('pilot_shops', 'estimated_daily_sales', `ALTER TABLE pilot_shops ADD COLUMN estimated_daily_sales REAL NOT NULL DEFAULT 0;`);
	await ensureColumn('pilot_shops', 'server_id', `ALTER TABLE pilot_shops ADD COLUMN server_id TEXT;`);
	await ensureColumn('pilot_shops', 'client_ref_id', `ALTER TABLE pilot_shops ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('pilot_shops', 'sync_version', `ALTER TABLE pilot_shops ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('pilot_shops', 'sync_updated_at', `ALTER TABLE pilot_shops ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('pilot_shops', 'deleted_at', `ALTER TABLE pilot_shops ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('pilot_shops', 'created_at', `ALTER TABLE pilot_shops ADD COLUMN created_at DATETIME;`);
	await ensureColumn('pilot_shops', 'updated_at', `ALTER TABLE pilot_shops ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('analytics_events', 'user_id', `ALTER TABLE analytics_events ADD COLUMN user_id INTEGER;`);
	await ensureColumn('analytics_events', 'shop_id', `ALTER TABLE analytics_events ADD COLUMN shop_id INTEGER;`);
	await ensureColumn('analytics_events', 'event_type', `ALTER TABLE analytics_events ADD COLUMN event_type TEXT;`);
	await ensureColumn('analytics_events', 'timestamp', `ALTER TABLE analytics_events ADD COLUMN timestamp DATETIME;`);
	await ensureColumn('analytics_events', 'source', `ALTER TABLE analytics_events ADD COLUMN source TEXT;`);
	await ensureColumn('analytics_events', 'metadata_json', `ALTER TABLE analytics_events ADD COLUMN metadata_json TEXT;`);
	await ensureColumn('analytics_events', 'server_id', `ALTER TABLE analytics_events ADD COLUMN server_id TEXT;`);
	await ensureColumn('analytics_events', 'client_ref_id', `ALTER TABLE analytics_events ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('analytics_events', 'sync_version', `ALTER TABLE analytics_events ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('analytics_events', 'sync_updated_at', `ALTER TABLE analytics_events ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('analytics_events', 'deleted_at', `ALTER TABLE analytics_events ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('analytics_events', 'created_at', `ALTER TABLE analytics_events ADD COLUMN created_at DATETIME;`);

	await ensureColumn('feedback', 'user_id', `ALTER TABLE feedback ADD COLUMN user_id INTEGER;`);
	await ensureColumn('feedback', 'shop_id', `ALTER TABLE feedback ADD COLUMN shop_id INTEGER;`);
	await ensureColumn('feedback', 'category', `ALTER TABLE feedback ADD COLUMN category TEXT;`);
	await ensureColumn('feedback', 'rating', `ALTER TABLE feedback ADD COLUMN rating INTEGER;`);
	await ensureColumn('feedback', 'message', `ALTER TABLE feedback ADD COLUMN message TEXT;`);
	await ensureColumn('feedback', 'timestamp', `ALTER TABLE feedback ADD COLUMN timestamp DATETIME;`);
	await ensureColumn('feedback', 'status', `ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'new';`);
	await ensureColumn('feedback', 'server_id', `ALTER TABLE feedback ADD COLUMN server_id TEXT;`);
	await ensureColumn('feedback', 'client_ref_id', `ALTER TABLE feedback ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('feedback', 'sync_version', `ALTER TABLE feedback ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('feedback', 'sync_updated_at', `ALTER TABLE feedback ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('feedback', 'deleted_at', `ALTER TABLE feedback ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('feedback', 'created_at', `ALTER TABLE feedback ADD COLUMN created_at DATETIME;`);
	await ensureColumn('feedback', 'updated_at', `ALTER TABLE feedback ADD COLUMN updated_at DATETIME;`);

	await ensureColumn('pending_sync_queue', 'user_id', `ALTER TABLE pending_sync_queue ADD COLUMN user_id INTEGER;`);

	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_client_ref_id ON products(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_client_ref_id ON customers(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_user_client_ref_id ON baki_transactions(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_reminders_user_client_ref_id ON collection_reminders(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_promises_user_client_ref_id ON payment_promises(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_user_client_ref_id ON stock_movements(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_header_user_client_ref_id ON sales_header(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_items_user_client_ref_id ON sales_items(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_client_ref_id ON payments(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_returns_user_client_ref_id ON sales_returns(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_user_client_ref_id ON suppliers(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_user_client_ref_id ON purchase_orders(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_items_user_client_ref_id ON purchase_items(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payables_user_client_ref_id ON supplier_payables(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batches_user_client_ref_id ON inventory_batches(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_counts_user_client_ref_id ON cycle_counts(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_user_client_ref_id ON alerts(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_user_client_ref_id ON expenses(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cashbook_entries_user_client_ref_id ON cashbook_entries(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_day_closes_user_client_ref_id ON day_closes(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_server_id ON products(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_server_id ON customers(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_user_server_id ON baki_transactions(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_reminders_user_server_id ON collection_reminders(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_promises_user_server_id ON payment_promises(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_user_server_id ON stock_movements(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_header_user_server_id ON sales_header(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_items_user_server_id ON sales_items(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_server_id ON payments(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_returns_user_server_id ON sales_returns(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_user_server_id ON suppliers(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_user_server_id ON purchase_orders(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_items_user_server_id ON purchase_items(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payables_user_server_id ON supplier_payables(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batches_user_server_id ON inventory_batches(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_counts_user_server_id ON cycle_counts(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_user_server_id ON alerts(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_user_server_id ON expenses(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cashbook_entries_user_server_id ON cashbook_entries(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_day_closes_user_server_id ON day_closes(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_user_alert_key ON alerts(user_id, alert_key);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_day_closes_user_business_date ON day_closes(user_id, business_date);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_entries_user_id ON baki_entries(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_user_id ON baki_transactions(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_collection_reminders_user_id ON collection_reminders(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_payment_promises_user_id ON payment_promises(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON stock_movements(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sales_header_user_id ON sales_header(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sales_items_user_id ON sales_items(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sales_returns_user_id ON sales_returns(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id ON purchase_orders(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_purchase_items_user_id ON purchase_items(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_supplier_payables_user_id ON supplier_payables(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_batches_user_id ON inventory_batches(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cycle_counts_user_id ON cycle_counts(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cashbook_entries_user_id ON cashbook_entries(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_day_closes_user_id ON day_closes(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_sync_queue_user_created_at ON pending_sync_queue(user_id, created_at ASC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sync_state_user_id ON sync_state(user_id);`);

	await db.execAsync(`UPDATE products
		SET created_at = COALESCE(created_at, datetime('now'))
		WHERE created_at IS NULL;`);

	await db.execAsync(`UPDATE products
		SET low_stock_threshold = COALESCE(low_stock_threshold, 5)
		WHERE low_stock_threshold IS NULL;`);

	await db.execAsync(`UPDATE products
		SET quantity = COALESCE(quantity, 0)
		WHERE quantity IS NULL OR quantity < 0;`);

	await db.execAsync(`UPDATE products
		SET dead_stock_flag = COALESCE(dead_stock_flag, 0)
		WHERE dead_stock_flag IS NULL;`);

	await db.execAsync(`UPDATE customers
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			credit_limit = MAX(0, COALESCE(credit_limit, 0)),
			current_balance = MAX(0, COALESCE(current_balance, 0)),
			risk_level = CASE
				WHEN LOWER(COALESCE(risk_level, '')) IN ('low', 'medium', 'high') THEN LOWER(risk_level)
				ELSE 'low'
			END,
			due_terms_days = CASE
				WHEN COALESCE(due_terms_days, 0) > 0 THEN due_terms_days
				ELSE 30
			END
		WHERE created_at IS NULL
			OR updated_at IS NULL
			OR credit_limit IS NULL
			OR current_balance IS NULL
			OR risk_level IS NULL
			OR due_terms_days IS NULL;`);

	await db.execAsync(`UPDATE baki_transactions
		SET status = CASE
				WHEN LOWER(COALESCE(status, '')) IN ('open', 'paid', 'overdue') THEN LOWER(status)
				ELSE CASE
					WHEN LOWER(COALESCE(type, 'credit')) = 'payment' THEN 'paid'
					ELSE 'open'
				END
			END
		WHERE status IS NULL
			OR LOWER(status) NOT IN ('open', 'paid', 'overdue');`);

	await db.execAsync(`UPDATE collection_reminders
		SET channel = CASE
				WHEN LOWER(COALESCE(channel, '')) IN ('sms', 'whatsapp', 'call', 'manual') THEN LOWER(channel)
				ELSE 'manual'
			END,
			status = CASE
				WHEN LOWER(COALESCE(status, '')) IN ('queued', 'sent', 'failed') THEN LOWER(status)
				ELSE 'sent'
			END,
			sync_version = COALESCE(sync_version, 1),
			created_at = COALESCE(created_at, datetime('now'))
		WHERE channel IS NULL
			OR status IS NULL
			OR sync_version IS NULL
			OR created_at IS NULL;`);

	await db.execAsync(`UPDATE payment_promises
		SET status = CASE
				WHEN LOWER(COALESCE(status, '')) IN ('pending', 'fulfilled', 'broken') THEN LOWER(status)
				ELSE 'pending'
			END,
			sync_version = COALESCE(sync_version, 1),
			updated_at = COALESCE(updated_at, datetime('now')),
			created_at = COALESCE(created_at, datetime('now'))
		WHERE status IS NULL
			OR sync_version IS NULL
			OR updated_at IS NULL
			OR created_at IS NULL;`);

	const fallbackUserId = await getFallbackUserId();
	if (fallbackUserId) {
		await db.execAsync(`UPDATE products SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE customers SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE baki_entries SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE baki_transactions SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE collection_reminders SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE payment_promises SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE stock_movements SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE sales_header SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE sales_items SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE payments SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE sales_returns SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE suppliers SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE purchase_orders SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE purchase_items SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE supplier_payables SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE inventory_batches SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE cycle_counts SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE alerts SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE expenses SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE cashbook_entries SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE day_closes SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE pilot_shops SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE analytics_events SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE feedback SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE baki_entries
			SET user_id = (
				SELECT c.user_id
				FROM customers c
				WHERE c.id = baki_entries.customer_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE baki_transactions
			SET user_id = (
				SELECT c.user_id
				FROM customers c
				WHERE c.id = baki_transactions.customer_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE collection_reminders
			SET user_id = (
				SELECT c.user_id
				FROM customers c
				WHERE c.id = collection_reminders.customer_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE payment_promises
			SET user_id = (
				SELECT c.user_id
				FROM customers c
				WHERE c.id = payment_promises.customer_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE stock_movements
			SET user_id = (
				SELECT p.user_id
				FROM products p
				WHERE p.id = stock_movements.product_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE sales_items
			SET user_id = (
				SELECT h.user_id
				FROM sales_header h
				WHERE h.id = sales_items.sales_header_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE payments
			SET user_id = (
				SELECT h.user_id
				FROM sales_header h
				WHERE h.id = payments.sales_header_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE sales_returns
			SET user_id = (
				SELECT i.user_id
				FROM sales_items i
				WHERE i.id = sales_returns.sales_item_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE purchase_orders
			SET user_id = (
				SELECT s.user_id
				FROM suppliers s
				WHERE s.id = purchase_orders.supplier_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE purchase_items
			SET user_id = (
				SELECT o.user_id
				FROM purchase_orders o
				WHERE o.id = purchase_items.purchase_order_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE supplier_payables
			SET user_id = (
				SELECT s.user_id
				FROM suppliers s
				WHERE s.id = supplier_payables.supplier_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE inventory_batches
			SET user_id = (
				SELECT p.user_id
				FROM products p
				WHERE p.id = inventory_batches.product_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE cycle_counts
			SET user_id = (
				SELECT p.user_id
				FROM products p
				WHERE p.id = cycle_counts.product_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);

		await db.execAsync(`UPDATE alerts
			SET user_id = (
				SELECT p.user_id
				FROM products p
				WHERE p.id = alerts.product_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);
	}

	await db.execAsync(`UPDATE stock_movements
		SET stock_out_reason = 'ADJUSTMENT'
		WHERE movement_type = 'out'
			AND (stock_out_reason IS NULL OR trim(stock_out_reason) = '');`);

	await db.execAsync(`UPDATE sales_header
		SET status = COALESCE(status, 'posted'),
			payment_mode = COALESCE(NULLIF(trim(payment_mode), ''), 'CASH'),
			timestamp = COALESCE(timestamp, created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			created_at = COALESCE(created_at, datetime('now'))
		WHERE status IS NULL
			OR payment_mode IS NULL
			OR timestamp IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL;`);

	await db.execAsync(`UPDATE baki_entries
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			status = COALESCE(status, 'unpaid'),
			paid_amount = COALESCE(paid_amount, 0)
		WHERE created_at IS NULL
			OR updated_at IS NULL
			OR status IS NULL
			OR paid_amount IS NULL;`);

	await db.execAsync(`UPDATE suppliers
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			due_amount_cents = COALESCE(due_amount_cents, 0),
			sync_version = COALESCE(sync_version, 1)
		WHERE created_at IS NULL
			OR updated_at IS NULL
			OR due_amount_cents IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE purchase_orders
		SET purchase_date = COALESCE(purchase_date, created_at, datetime('now')),
			status = COALESCE(status, 'pending'),
			total_amount_cents = COALESCE(total_amount_cents, 0),
			paid_amount_cents = COALESCE(paid_amount_cents, 0),
			due_amount_cents = MAX(0, COALESCE(total_amount_cents, 0) - COALESCE(paid_amount_cents, 0)),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE purchase_date IS NULL
			OR status IS NULL
			OR total_amount_cents IS NULL
			OR paid_amount_cents IS NULL
			OR due_amount_cents IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE purchase_items
		SET ordered_qty = COALESCE(ordered_qty, 0),
			received_qty = COALESCE(received_qty, 0),
			pending_qty = MAX(0, COALESCE(ordered_qty, 0) - COALESCE(received_qty, 0)),
			subtotal_cents = COALESCE(subtotal_cents, COALESCE(ordered_qty, 0) * COALESCE(unit_cost_cents, 0)),
			status = CASE
				WHEN COALESCE(received_qty, 0) <= 0 THEN 'pending'
				WHEN COALESCE(received_qty, 0) >= COALESCE(ordered_qty, 0) THEN 'received'
				ELSE 'partial'
			END,
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE ordered_qty IS NULL
			OR received_qty IS NULL
			OR pending_qty IS NULL
			OR subtotal_cents IS NULL
			OR status IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE supplier_payables
		SET entry_type = COALESCE(entry_type, 'credit'),
			running_due_cents = COALESCE(running_due_cents, 0),
			created_at = COALESCE(created_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE entry_type IS NULL
			OR running_due_cents IS NULL
			OR created_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE inventory_batches
		SET quantity = COALESCE(quantity, 0),
			cost_price_cents = COALESCE(cost_price_cents, 0),
			purchase_date = COALESCE(purchase_date, created_at, datetime('now')),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE quantity IS NULL
			OR cost_price_cents IS NULL
			OR purchase_date IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE cycle_counts
		SET system_quantity = COALESCE(system_quantity, 0),
			physical_quantity = COALESCE(physical_quantity, 0),
			variance = COALESCE(variance, COALESCE(physical_quantity, 0) - COALESCE(system_quantity, 0)),
			timestamp = COALESCE(timestamp, created_at, datetime('now')),
			created_at = COALESCE(created_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE system_quantity IS NULL
			OR physical_quantity IS NULL
			OR variance IS NULL
			OR timestamp IS NULL
			OR created_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE alerts
		SET alert_type = COALESCE(alert_type, 'LOW_STOCK'),
			message = COALESCE(message, 'Inventory alert'),
			severity = COALESCE(severity, 'medium'),
			is_active = COALESCE(is_active, 1),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1),
			alert_key = COALESCE(alert_key, alert_type || ':' || product_id)
		WHERE alert_type IS NULL
			OR message IS NULL
			OR severity IS NULL
			OR is_active IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL
			OR alert_key IS NULL;`);

	await db.execAsync(`UPDATE expenses
		SET expense_date = COALESCE(expense_date, created_at, datetime('now')),
			category = COALESCE(NULLIF(trim(category), ''), 'GENERAL'),
			title = COALESCE(NULLIF(trim(title), ''), 'Expense'),
			amount_cents = MAX(0, COALESCE(amount_cents, 0)),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE expense_date IS NULL
			OR category IS NULL
			OR title IS NULL
			OR amount_cents IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE cashbook_entries
		SET entry_type = COALESCE(entry_type, 'IN'),
			category = COALESCE(NULLIF(trim(category), ''), 'GENERAL'),
			amount_cents = MAX(0, COALESCE(amount_cents, 0)),
			occurred_at = COALESCE(occurred_at, created_at, datetime('now')),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE entry_type IS NULL
			OR category IS NULL
			OR amount_cents IS NULL
			OR occurred_at IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`UPDATE day_closes
		SET business_date = COALESCE(NULLIF(trim(business_date), ''), DATE(COALESCE(closed_at, created_at, datetime('now')))),
			opening_balance_cents = COALESCE(opening_balance_cents, 0),
			total_in_cents = COALESCE(total_in_cents, 0),
			total_out_cents = COALESCE(total_out_cents, 0),
			closing_balance_cents = COALESCE(closing_balance_cents, 0),
			status = COALESCE(status, 'closed'),
			created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			sync_version = COALESCE(sync_version, 1)
		WHERE business_date IS NULL
			OR opening_balance_cents IS NULL
			OR total_in_cents IS NULL
			OR total_out_cents IS NULL
			OR closing_balance_cents IS NULL
			OR status IS NULL
			OR created_at IS NULL
			OR updated_at IS NULL
			OR sync_version IS NULL;`);

	await db.execAsync(`INSERT INTO inventory_batches (
			user_id,
			product_id,
			batch_number,
			quantity,
			expiry_date,
			purchase_date,
			cost_price_cents,
			sync_version,
			sync_updated_at,
			created_at,
			updated_at
		)
		SELECT
			p.user_id,
			p.id,
			'OPENING-' || p.id,
			p.quantity,
			p.expiry_date,
			COALESCE(p.created_at, datetime('now')),
			CAST(ROUND(COALESCE(p.price, 0) * 100.0) AS INTEGER),
			1,
			datetime('now'),
			datetime('now'),
			datetime('now')
		FROM products p
		LEFT JOIN (
			SELECT user_id, product_id, COALESCE(SUM(quantity), 0) AS batch_qty
			FROM inventory_batches
			WHERE deleted_at IS NULL
			GROUP BY user_id, product_id
		) b
			on b.user_id = p.user_id
			AND b.product_id = p.id
		WHERE p.quantity > 0
			AND p.user_id IS NOT NULL
			AND COALESCE(b.batch_qty, 0) <= 0;`);

	await db.execAsync(`INSERT INTO baki_transactions (
			user_id,
			customer_id,
			type,
			amount_cents,
			note,
			legacy_entry_id,
			legacy_kind,
			created_at
		)
		SELECT
			COALESCE(b.user_id, c.user_id),
			b.customer_id,
			'credit',
			CAST(ROUND(COALESCE(b.amount, 0) * 100) AS INTEGER),
			b.note,
			b.id,
			'credit',
			COALESCE(b.created_at, datetime('now'))
		FROM baki_entries b
		JOIN customers c ON c.id = b.customer_id
		WHERE COALESCE(b.amount, 0) > 0
			AND NOT EXISTS (
				SELECT 1
				FROM baki_transactions t
				WHERE t.legacy_entry_id = b.id
					AND t.legacy_kind = 'credit'
			);`);

	await db.execAsync(`INSERT INTO baki_transactions (
			user_id,
			customer_id,
			type,
			amount_cents,
			note,
			legacy_entry_id,
			legacy_kind,
			created_at
		)
		SELECT
			COALESCE(b.user_id, c.user_id),
			b.customer_id,
			'payment',
			CAST(ROUND(COALESCE(b.paid_amount, 0) * 100) AS INTEGER),
			b.note,
			b.id,
			'payment',
			COALESCE(b.updated_at, b.created_at, datetime('now'))
		FROM baki_entries b
		JOIN customers c ON c.id = b.customer_id
		WHERE COALESCE(b.paid_amount, 0) > 0
			AND NOT EXISTS (
				SELECT 1
				FROM baki_transactions t
				WHERE t.legacy_entry_id = b.id
					AND t.legacy_kind = 'payment'
			);`);

	await cleanupExpiredSessions();
	await cleanupOldAuditLogs();

	const deviceRow = await db.getFirstAsync(`SELECT id, device_id FROM auth_device_profile WHERE id = 1 LIMIT 1;`);
	if (!deviceRow?.id || !String(deviceRow.device_id || '').trim()) {
		const nextDeviceId = generateLocalDeviceId();
		await db.runAsync(
			`INSERT INTO auth_device_profile (id, device_id, preferred_email, pin_enabled, created_at, updated_at)
			 VALUES (1, ?, NULL, 0, datetime('now'), datetime('now'))
			 ON CONFLICT(id)
			 DO UPDATE SET
				device_id = CASE
					WHEN excluded.device_id IS NOT NULL AND length(trim(excluded.device_id)) > 0 THEN excluded.device_id
					ELSE auth_device_profile.device_id
				END,
				updated_at = datetime('now');`,
			nextDeviceId
		);
	}
};

export const insertCustomer = async ({
	name,
	phone = null,
	address = null,
	creditLimit = 0,
	dueTermsDays = 30,
}) => {
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;
	const normalizedCreditLimit = Number.isFinite(Number(creditLimit)) && Number(creditLimit) >= 0
		? Number(Number(creditLimit).toFixed(2))
		: 0;
	const normalizedDueTermsDays = Number.isInteger(Number(dueTermsDays)) && Number(dueTermsDays) > 0
		? Math.min(365, Number(dueTermsDays))
		: 30;
	const syncUpdatedAt = new Date().toISOString();

	if (!normalizedName) {
		return Promise.reject(new Error('Customer name is required.'));
	}

	const userId = await getActiveScopedUserId();

	const result = await db.runAsync(
		`INSERT INTO customers (
			user_id,
			name,
			phone,
			address,
			credit_limit,
			current_balance,
			risk_level,
			due_terms_days,
			last_payment_date,
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at
		)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
		userId,
		normalizedName,
		normalizedPhone || null,
		normalizedAddress || null,
		normalizedCreditLimit,
		0,
		'low',
		normalizedDueTermsDays,
		null,
		null,
		1,
		syncUpdatedAt
	);

	const localId = Number(result.lastInsertRowId);
	const clientRefId = buildLocalClientRefId({ entityType: 'customer', localId });
	await db.runAsync(`UPDATE customers SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

	await enqueueEntitySyncChange({
		entityType: 'customer',
		operation: 'upsert',
		localId,
		clientRefId,
		version: 1,
		updatedAt: syncUpdatedAt,
		data: {
			name: normalizedName,
			phone: normalizedPhone || null,
			address: normalizedAddress || null,
			creditLimit: normalizedCreditLimit,
			currentBalance: 0,
			riskLevel: 'low',
			dueTermsDays: normalizedDueTermsDays,
			lastPaymentDate: null,
			deletedAt: null,
		},
	});

	void logAudit({
		userId,
		entityType: 'customer',
		entityId: result.lastInsertRowId,
		action: 'create',
		metadata: {
			new: {
				name: normalizedName,
				phone: normalizedPhone || null,
				address: normalizedAddress || null,
				credit_limit: normalizedCreditLimit,
				due_terms_days: normalizedDueTermsDays,
			},
		},
		notes: 'Customer created',
	});

	return {
		id: localId,
		name: normalizedName,
		phone: normalizedPhone || null,
		address: normalizedAddress || null,
		credit_limit: normalizedCreditLimit,
		current_balance: 0,
		risk_level: 'low',
		due_terms_days: normalizedDueTermsDays,
		last_payment_date: null,
	};
};

export const addCustomer = (payload) => insertCustomer(payload);

const CUSTOMER_WITH_DUE_BASE_SQL = `SELECT
	c.id,
	c.user_id,
	c.name,
	c.phone,
	c.address,
	c.credit_limit,
	c.current_balance,
	c.risk_level,
	c.due_terms_days,
	c.last_payment_date,
	c.created_at,
	c.updated_at,
	ROUND(
		(
			CASE
				WHEN COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0) < 0
				THEN 0
				ELSE COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0)
			END
		) / 100.0,
		2
	) AS total_due
FROM customers c
LEFT JOIN baki_transactions t ON t.customer_id = c.id
WHERE c.user_id = ?
GROUP BY c.id`;

const resolveCustomerSortSql = (sortBy) => {
	const normalizedSort = typeof sortBy === 'string' ? sortBy.trim().toLowerCase() : 'recent';

	if (normalizedSort === 'name-asc') {
		return `ORDER BY LOWER(name) ASC, id DESC`;
	}

	if (normalizedSort === 'name-desc') {
		return `ORDER BY LOWER(name) DESC, id DESC`;
	}

	if (normalizedSort === 'due-desc') {
		return `ORDER BY total_due DESC, id DESC`;
	}

	if (normalizedSort === 'due-asc') {
		return `ORDER BY total_due ASC, id DESC`;
	}

	return `ORDER BY id DESC`;
};

export const getCustomersWithDue = ({ searchText = '', dueFilter = 'all', sortBy = 'recent' } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedSearch = typeof searchText === 'string' ? searchText.trim().toLowerCase() : '';
	const normalizedDueFilter = typeof dueFilter === 'string' ? dueFilter.trim().toLowerCase() : 'all';
	const conditions = [];
	const params = [userId];

	if (normalizedSearch) {
		conditions.push(`(LOWER(COALESCE(name, '')) LIKE ? OR LOWER(COALESCE(phone, '')) LIKE ?)`);
		params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
	}

	if (normalizedDueFilter === 'due-only') {
		conditions.push(`total_due > 0`);
	} else if (normalizedDueFilter === 'no-due') {
		conditions.push(`total_due <= 0`);
	}

	const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
	const orderBySql = resolveCustomerSortSql(sortBy);
	const sql = `SELECT *
		FROM (
			${CUSTOMER_WITH_DUE_BASE_SQL}
		)
		${whereSql}
		${orderBySql};`;

		return db.getAllAsync(sql, ...params);
	};

	return run();
};

export const searchCustomersWithDue = (options = {}) => getCustomersWithDue(options);

export const getCustomers = () => getCustomersWithDue();

export const fetchCustomers = () => getCustomers();

export const fetchCustomersBasic = () =>
	getActiveScopedUserId().then((userId) =>
		db.getAllAsync(
			`SELECT
				id,
				name,
				phone,
				address,
				credit_limit,
				current_balance,
				risk_level,
				due_terms_days,
				last_payment_date,
				created_at,
				updated_at,
				0 AS total_due
			 FROM customers
			 WHERE user_id = ?
			 ORDER BY id DESC;`,
			userId
		)
	);

export const getCustomerRiskMetrics = () =>
	getActiveScopedUserId().then((userId) =>
		db.getAllAsync(
		`SELECT
			c.id AS customer_id,
			ROUND(
				(
					CASE
						WHEN COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0) < 0
						THEN 0
						ELSE COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0)
					END
				) / 100.0,
				2
			) AS total_due,
			SUM(CASE WHEN t.type IN ('credit', 'payment') THEN 1 ELSE 0 END) AS number_of_transactions,
			SUM(
				CASE
					WHEN t.type = 'credit'
						AND julianday('now') - julianday(COALESCE(t.created_at, datetime('now'))) > 14
					THEN 1
					ELSE 0
				END
			) AS number_of_late_payments,
			AVG(
				CASE
					WHEN t.type = 'payment'
					THEN MAX(
						0,
						julianday(COALESCE(t.created_at, datetime('now'))) -
						julianday(
							COALESCE(
								(
									SELECT MAX(c2.created_at)
									FROM baki_transactions c2
									WHERE c2.customer_id = t.customer_id
										AND c2.type = 'credit'
										AND c2.created_at <= t.created_at
								),
								t.created_at
							)
						)
					)
					ELSE NULL
				END
			) AS average_payment_delay
		 FROM customers c
		 LEFT JOIN baki_transactions t ON t.customer_id = c.id
		 WHERE c.user_id = ?
		 GROUP BY c.id
		 ORDER BY c.id DESC;`
		,
		userId
	)
	);

export const getCustomerFeatureSourceRows = ({
	lookbackDays = 60,
	onTimeDelayDays = 7,
	lateDelayDays = 30,
} = {}) => {
	const normalizedLookbackDays = Math.max(1, Math.trunc(Number(lookbackDays) || 60));
	const normalizedOnTimeDelayDays = Math.max(0, Number(onTimeDelayDays) || 7);
	const normalizedLateDelayDays = Math.max(normalizedOnTimeDelayDays, Number(lateDelayDays) || 30);
	const lookbackModifier = `-${normalizedLookbackDays} days`;

	return getActiveScopedUserId().then((userId) =>
		db.getAllAsync(
			`WITH tx_agg AS (
				SELECT
					customer_id,
					COALESCE(SUM(
						CASE
							WHEN type = 'credit' THEN amount_cents
							WHEN type = 'payment' THEN -amount_cents
							ELSE 0
						END
					), 0) AS due_cents,
					MAX(created_at) AS last_transaction_at
				FROM baki_transactions
				WHERE user_id = ?
				GROUP BY customer_id
			),
			window_tx_agg AS (
				SELECT
					customer_id,
					COUNT(*) AS transaction_depth_60d
				FROM baki_transactions
				WHERE user_id = ?
					AND type IN ('credit', 'payment')
					AND datetime(COALESCE(created_at, datetime('now'))) >= datetime('now', ?)
				GROUP BY customer_id
			),
			payment_events AS (
				SELECT
					p.customer_id,
					p.created_at AS payment_created_at,
					MAX(
						0,
						julianday(COALESCE(p.created_at, datetime('now'))) -
						julianday(
							COALESCE(
								(
									SELECT MAX(c2.created_at)
									FROM baki_transactions c2
									WHERE c2.user_id = p.user_id
										AND c2.customer_id = p.customer_id
										AND c2.type = 'credit'
										AND c2.created_at <= p.created_at
								),
								p.created_at
							)
						)
					) AS payment_delay_days
				FROM baki_transactions p
				WHERE p.user_id = ?
					AND p.type = 'payment'
			),
			window_pay_agg AS (
				SELECT
					customer_id,
					COUNT(*) AS payment_count_60d,
					SUM(CASE WHEN payment_delay_days <= ? THEN 1 ELSE 0 END) AS on_time_payment_count_60d,
					SUM(CASE WHEN payment_delay_days > ? THEN 1 ELSE 0 END) AS late_count_60d,
					AVG(payment_delay_days) AS avg_delay_days_60d,
					SUM(payment_delay_days * payment_delay_days) AS delay_sum_sq_60d
				FROM payment_events
				WHERE datetime(COALESCE(payment_created_at, datetime('now'))) >= datetime('now', ?)
				GROUP BY customer_id
			)
			SELECT
				c.id AS customer_id,
				ROUND(MAX(COALESCE(tx_agg.due_cents, 0), 0) / 100.0, 2) AS due_amount_raw,
				COALESCE(window_tx_agg.transaction_depth_60d, 0) AS transaction_depth_60d,
				COALESCE(window_pay_agg.payment_count_60d, 0) AS payment_count_60d,
				COALESCE(window_pay_agg.on_time_payment_count_60d, 0) AS on_time_payment_count_60d,
				COALESCE(window_pay_agg.late_count_60d, 0) AS late_count_60d,
				COALESCE(window_pay_agg.avg_delay_days_60d, 0) AS avg_delay_days_60d,
				COALESCE(window_pay_agg.delay_sum_sq_60d, 0) AS delay_sum_sq_60d,
				tx_agg.last_transaction_at AS last_transaction_at
			FROM customers c
			LEFT JOIN tx_agg ON tx_agg.customer_id = c.id
			LEFT JOIN window_tx_agg ON window_tx_agg.customer_id = c.id
			LEFT JOIN window_pay_agg ON window_pay_agg.customer_id = c.id
			WHERE c.user_id = ?
			ORDER BY c.id DESC;`,
			userId,
			userId,
			lookbackModifier,
			userId,
			normalizedOnTimeDelayDays,
			normalizedLateDelayDays,
			lookbackModifier,
			userId
		)
	);
};

export const getCustomerTotalDue = async (customerId) => {
	const userId = await getActiveScopedUserId();
	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		throw new Error('Valid customerId is required.');
	}

	const row = await db.getFirstAsync(
		`SELECT COALESCE(SUM(
			CASE
				WHEN type = 'credit' THEN amount_cents
				WHEN type = 'payment' THEN -amount_cents
				ELSE 0
			END
		), 0) AS total_due_cents
		FROM baki_transactions
		WHERE customer_id = ?
			AND user_id = ?;`,
		normalizedCustomerId,
		userId
	);

	return fromMoneyCents(Math.max(0, Number(row?.total_due_cents || 0)));
};

const insertBakiTransaction = async ({
	customerId,
	type,
	amount,
	note = null,
	paymentMethod = null,
	dueDate = null,
	dueTermsDays = null,
	referenceId = null,
	imageUrl = null,
}) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();
	const normalizedCustomerId = Number(customerId);
	const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
	const normalizedNote = typeof note === 'string' ? note.trim() : null;
	const normalizedPaymentMethod = typeof paymentMethod === 'string' ? paymentMethod.trim().toLowerCase() : null;
	const normalizedReferenceId = typeof referenceId === 'string' ? referenceId.trim() : null;
	const amountCents = toMoneyCents(amount);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		throw new Error('Valid customerId is required.');
	}

	if (!BAKI_TRANSACTION_TYPES.has(normalizedType)) {
		throw new Error("Transaction type must be 'credit' or 'payment'.");
	}

	if (!Number.isInteger(amountCents) || amountCents <= 0) {
		throw new Error('Amount must be a positive number with up to 2 decimals.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const customer = await db.getFirstAsync(
			`SELECT id, server_id, client_ref_id, credit_limit, due_terms_days FROM customers WHERE id = ? AND user_id = ?;`,
			normalizedCustomerId,
			userId
		);
		if (!customer) {
			throw new Error('Customer not found.');
		}

		const row = await db.getFirstAsync(
			`SELECT COALESCE(SUM(
				CASE
					WHEN type = 'credit' THEN amount_cents
					WHEN type = 'payment' THEN -amount_cents
					ELSE 0
				END
			), 0) AS total_due_cents
			FROM baki_transactions
			WHERE customer_id = ?
				AND user_id = ?;`,
			normalizedCustomerId,
			userId
		);

		const dueCents = Math.max(0, Number(row?.total_due_cents || 0));
		const customerCreditLimitCents = toMoneyCents(customer.credit_limit || 0) || 0;
		const resolvedDueTermsDays = Number.isInteger(Number(dueTermsDays)) && Number(dueTermsDays) > 0
			? Number(dueTermsDays)
			: (Number.isInteger(Number(customer.due_terms_days)) && Number(customer.due_terms_days) > 0 ? Number(customer.due_terms_days) : 30);

		let effectiveDueDateIso = null;
		if (normalizedType === 'credit') {
			if (dueDate) {
				const parsedDue = new Date(dueDate);
				if (Number.isNaN(parsedDue.getTime())) {
					throw new Error('dueDate must be a valid date.');
				}
				effectiveDueDateIso = parsedDue.toISOString();
			} else {
				const base = new Date(syncUpdatedAt);
				base.setUTCDate(base.getUTCDate() + resolvedDueTermsDays);
				effectiveDueDateIso = base.toISOString();
			}

			if (customerCreditLimitCents > 0 && dueCents + amountCents > customerCreditLimitCents) {
				const remaining = Math.max(0, customerCreditLimitCents - dueCents);
				throw new Error(`Credit limit exceeded. Max allowed now is ৳${fromMoneyCents(remaining).toFixed(2)}.`);
			}
		}

		if (normalizedType === 'payment') {
			if (dueCents <= 0) {
				throw new Error('No existing credit found for this customer. Payment is not allowed.');
			}

			if (amountCents > dueCents) {
				throw new Error(`Overpayment blocked. Max payable now is ৳${fromMoneyCents(dueCents).toFixed(2)}.`);
			}
		}

		const localPaymentCode = normalizedType === 'credit' ? generatePaymentCode() : null;
		const localPaymentCodeExpiresAt = normalizedType === 'credit'
			? new Date(Date.now() + PAYMENT_CODE_TTL_HOURS * 60 * 60 * 1000).toISOString()
			: null;

		const result = await db.runAsync(
			`INSERT INTO baki_transactions (
				user_id,
				customer_id,
				type,
				amount_cents,
				due_date,
				status,
				reference_id,
				reminder_sent_at,
				resolved_at,
				note,
				payment_method,
				image_url,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				payment_code,
				payment_code_expires_at,
				payment_code_used
			)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0);`,
			userId,
			normalizedCustomerId,
			normalizedType,
			amountCents,
			effectiveDueDateIso,
			normalizedType === 'payment'
				? 'paid'
				: (effectiveDueDateIso && new Date(effectiveDueDateIso).getTime() < Date.now() ? 'overdue' : 'open'),
			normalizedReferenceId || null,
			null,
			normalizedType === 'payment' ? syncUpdatedAt : null,
			normalizedNote || null,
			normalizedType === 'payment' ? normalizedPaymentMethod || 'cash' : null,
			typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
			null,
			1,
			syncUpdatedAt,
			localPaymentCode,
			localPaymentCodeExpiresAt
		);

		const localId = Number(result.lastInsertRowId);
		const clientRefId = buildLocalClientRefId({ entityType: 'baki_entry', localId });
		await db.runAsync(`UPDATE baki_transactions SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

		const dueAfterCents = normalizedType === 'credit'
			? dueCents + amountCents
			: Math.max(0, dueCents - amountCents);
		const nextRisk = dueAfterCents > 1000000 ? 'high' : dueAfterCents > 300000 ? 'medium' : 'low';
		await db.runAsync(
			`UPDATE customers
			 SET current_balance = ?,
				 risk_level = ?,
				 last_payment_date = CASE WHEN ? = 'payment' THEN ? ELSE last_payment_date END,
				 updated_at = datetime('now')
			 WHERE id = ? AND user_id = ?;`,
			fromMoneyCents(dueAfterCents),
			nextRisk,
			normalizedType,
			syncUpdatedAt,
			normalizedCustomerId,
			userId
		);

		if (normalizedType === 'payment') {
			if (dueAfterCents <= 0) {
				await db.runAsync(
					`UPDATE baki_transactions
					 SET status = 'paid',
						 resolved_at = COALESCE(resolved_at, ?)
					 WHERE customer_id = ?
						AND user_id = ?
						AND type = 'credit'
						AND status IN ('open', 'overdue');`,
					syncUpdatedAt,
					normalizedCustomerId,
					userId
				);
			} else {
				await db.runAsync(
					`UPDATE baki_transactions
					 SET status = 'overdue'
					 WHERE customer_id = ?
						AND user_id = ?
						AND type = 'credit'
						AND status = 'open'
						AND due_date IS NOT NULL
						AND datetime(due_date) < datetime('now');`,
					normalizedCustomerId,
					userId
				);
			}
		}

		await enqueueEntitySyncChange({
			entityType: 'baki_entry',
			operation: 'upsert',
			localId,
			clientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				type: normalizedType,
				amount: fromMoneyCents(amountCents),
				note: normalizedNote || null,
				paymentMethod: normalizedType === 'payment' ? normalizedPaymentMethod || 'cash' : null,
				dueDate: effectiveDueDateIso,
				status: normalizedType === 'payment'
					? 'paid'
					: (effectiveDueDateIso && new Date(effectiveDueDateIso).getTime() < Date.now() ? 'overdue' : 'open'),
				referenceId: normalizedReferenceId || null,
				reminderSentAt: null,
				resolvedAt: normalizedType === 'payment' ? syncUpdatedAt : null,
				customerId: Number(customer.id),
				customerServerId: customer.server_id || null,
				customerClientRefId: customer.client_ref_id || buildLocalClientRefId({ entityType: 'customer', localId: Number(customer.id) }),
				occurredAt: syncUpdatedAt,
				deletedAt: null,
			},
		});

		if (normalizedType === 'payment') {
			await insertCashbookEntryTx({
				userId,
				entryType: 'IN',
				amountCents,
				paymentMethod: normalizedPaymentMethod || 'cash',
				category: 'CUSTOMER_PAYMENT',
				referenceType: 'baki_transaction',
				referenceLocalId: localId,
				referenceClientRefId: clientRefId,
				note: normalizedNote || `Customer payment for customer #${normalizedCustomerId}`,
				occurredAt: syncUpdatedAt,
				syncUpdatedAt,
			});
		}

		console.info('[BAKI][LOCAL_CREATE]', {
			userId,
			localId,
			clientRefId,
			type: normalizedType,
			amount: fromMoneyCents(amountCents),
			customerId: normalizedCustomerId,
		});

		void logAudit({
			userId,
			entityType: 'baki_transaction',
			entityId: result.lastInsertRowId,
			action: normalizedType,
			metadata: {
				previous: { due_cents: dueCents },
				new: {
					customer_id: normalizedCustomerId,
					type: normalizedType,
					amount_cents: amountCents,
				},
				notes: normalizedNote || null,
			},
			notes: normalizedType === 'credit' ? 'Credit added' : 'Payment recorded',
		});

		await db.execAsync('COMMIT;');

		return {
			id: localId,
			user_id: userId,
			customer_id: normalizedCustomerId,
			type: normalizedType,
			amount: fromMoneyCents(amountCents),
			due_date: effectiveDueDateIso,
			status: normalizedType === 'payment'
				? 'paid'
				: (effectiveDueDateIso && new Date(effectiveDueDateIso).getTime() < Date.now() ? 'overdue' : 'open'),
			reference_id: normalizedReferenceId || null,
			note: normalizedNote || null,
			payment_method: normalizedType === 'payment' ? normalizedPaymentMethod || 'cash' : null,
			payment_code: localPaymentCode,
			payment_code_expires_at: localPaymentCodeExpiresAt,
			payment_code_used: 0,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const insertBakiEntry = ({ customerId, amount, note = null, dueDate = null, dueTermsDays = null, referenceId = null, imageUrl = null }) =>
	insertBakiTransaction({ customerId, type: 'credit', amount, note, dueDate, dueTermsDays, referenceId, imageUrl });

export const addBaki = (payload) => insertBakiEntry(payload);

export const addPayment = ({ customerId, amount, note = null, paymentMethod = 'cash', referenceId = null }) =>
	insertBakiTransaction({ customerId, type: 'payment', amount, note, paymentMethod, referenceId });

export const getBakiHistory = ({ customerId = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	if (customerId === null || customerId === undefined) {
		return db.getAllAsync(
			`SELECT
				c.id AS id,
				c.id AS customer_id,
				c.name AS customer_name,
				c.phone AS customer_phone,
				c.credit_limit,
				c.current_balance,
				c.risk_level,
				ROUND(
					MAX(
						COALESCE(
							SUM(
								CASE
									WHEN t.type = 'credit' THEN t.amount_cents
									WHEN t.type = 'payment' THEN -t.amount_cents
									ELSE 0
								END
							),
							0
						),
						0
					) / 100.0,
					2
				) AS due_amount,
				ROUND(COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'overdue' THEN t.amount_cents ELSE 0 END), 0) / 100.0, 2) AS overdue_amount,
				MIN(CASE WHEN t.type = 'credit' AND t.status IN ('open', 'overdue') THEN t.due_date ELSE NULL END) AS next_due_date,
				SUM(CASE WHEN t.type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
				SUM(CASE WHEN t.type = 'payment' THEN 1 ELSE 0 END) AS payment_count,
				MAX(t.created_at) AS last_activity_at,
				(SELECT payment_code FROM baki_transactions pc
				 WHERE pc.customer_id = c.id AND pc.user_id = c.user_id
				   AND pc.type = 'credit' AND pc.status IN ('open', 'overdue')
				   AND pc.payment_code IS NOT NULL AND pc.payment_code_used = 0
				 ORDER BY pc.created_at DESC LIMIT 1) AS latest_payment_code,
				(SELECT payment_code_expires_at FROM baki_transactions pc
				 WHERE pc.customer_id = c.id AND pc.user_id = c.user_id
				   AND pc.type = 'credit' AND pc.status IN ('open', 'overdue')
				   AND pc.payment_code IS NOT NULL AND pc.payment_code_used = 0
				 ORDER BY pc.created_at DESC LIMIT 1) AS latest_payment_code_expires_at
			FROM customers c
			LEFT JOIN baki_transactions t ON t.customer_id = c.id
			WHERE c.user_id = ?
			GROUP BY c.id
			ORDER BY due_amount DESC, last_activity_at DESC, c.id DESC;`,
			userId
		);
	}

	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT
			c.id AS id,
			c.id AS customer_id,
			c.name AS customer_name,
			c.phone AS customer_phone,
			c.credit_limit,
			c.current_balance,
			c.risk_level,
			ROUND(
				(
					CASE
						WHEN COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0) < 0
						THEN 0
						ELSE COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0)
					END
				) / 100.0,
				2
			) AS due_amount,
				ROUND(COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'overdue' THEN t.amount_cents ELSE 0 END), 0) / 100.0, 2) AS overdue_amount,
				MIN(CASE WHEN t.type = 'credit' AND t.status IN ('open', 'overdue') THEN t.due_date ELSE NULL END) AS next_due_date,
			SUM(CASE WHEN t.type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
			SUM(CASE WHEN t.type = 'payment' THEN 1 ELSE 0 END) AS payment_count,
			MAX(t.created_at) AS last_activity_at,
			(SELECT payment_code FROM baki_transactions pc
			 WHERE pc.customer_id = c.id AND pc.user_id = ?
			   AND pc.type = 'credit' AND pc.status IN ('open', 'overdue')
			   AND pc.payment_code IS NOT NULL AND pc.payment_code_used = 0
			 ORDER BY pc.created_at DESC LIMIT 1) AS latest_payment_code,
			(SELECT payment_code_expires_at FROM baki_transactions pc
			 WHERE pc.customer_id = c.id AND pc.user_id = ?
			   AND pc.type = 'credit' AND pc.status IN ('open', 'overdue')
			   AND pc.payment_code IS NOT NULL AND pc.payment_code_used = 0
			 ORDER BY pc.created_at DESC LIMIT 1) AS latest_payment_code_expires_at
		FROM customers c
		LEFT JOIN baki_transactions t ON t.customer_id = c.id
		WHERE c.id = ?
			AND c.user_id = ?
		GROUP BY c.id
		ORDER BY c.id DESC;`,
		normalizedCustomerId,
		userId,
		userId,
		normalizedCustomerId,
		userId
	);
	};

	return run();
};

export const fetchBakiWithCustomer = (options = {}) => getBakiHistory(options);

export const getBakiHistoryByCustomer = (customerId) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT
			t.id,
			t.customer_id,
			c.name AS customer_name,
			c.phone AS customer_phone,
			t.type,
			ROUND(t.amount_cents / 100.0, 2) AS amount,
			t.due_date,
			t.status,
			t.reference_id,
			t.reminder_sent_at,
			t.resolved_at,
			t.note,
			t.payment_method,
			t.created_at
		FROM baki_transactions t
		JOIN customers c ON c.id = t.customer_id
		WHERE t.customer_id = ?
			AND t.user_id = ?
		ORDER BY datetime(t.created_at) DESC, t.id DESC;`,
		normalizedCustomerId,
		userId
	);
	};

	return run();
};

export const getCustomerLedger = (customerId) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT
			t.customer_id,
			c.name AS customer_name,
			c.phone AS customer_phone,
			t.id AS entry_id,
			t.type AS event_type,
			t.status,
			t.due_date,
			t.reference_id,
			t.reminder_sent_at,
			t.resolved_at,
			CASE
				WHEN t.type = 'credit' AND t.due_date IS NOT NULL
				THEN MAX(0, CAST(julianday('now') - julianday(t.due_date) AS INTEGER))
				ELSE 0
			END AS days_overdue,
			ROUND(
				CASE
					WHEN t.type = 'credit' THEN t.amount_cents / 100.0
					WHEN t.type = 'payment' THEN -t.amount_cents / 100.0
					ELSE 0
				END,
				2
			) AS amount_change,
			t.note,
			t.payment_method,
			t.created_at,
			ROUND(
				(
					CASE
						WHEN (
							SELECT COALESCE(
								SUM(
									CASE
										WHEN t2.type = 'credit' THEN t2.amount_cents
										WHEN t2.type = 'payment' THEN -t2.amount_cents
										ELSE 0
									END
								),
								0
							)
							FROM baki_transactions t2
							WHERE t2.customer_id = t.customer_id
								AND (
									datetime(t2.created_at) < datetime(t.created_at)
									OR (
										datetime(t2.created_at) = datetime(t.created_at)
										AND t2.id <= t.id
									)
								)
						) < 0
						THEN 0
						ELSE (
							SELECT COALESCE(
								SUM(
									CASE
										WHEN t2.type = 'credit' THEN t2.amount_cents
										WHEN t2.type = 'payment' THEN -t2.amount_cents
										ELSE 0
									END
								),
								0
							)
							FROM baki_transactions t2
							WHERE t2.customer_id = t.customer_id
								AND (
									datetime(t2.created_at) < datetime(t.created_at)
									OR (
										datetime(t2.created_at) = datetime(t.created_at)
										AND t2.id <= t.id
									)
								)
						)
					END
				) / 100.0,
				2
			) AS running_due
		FROM baki_transactions t
		JOIN customers c ON c.id = t.customer_id
		WHERE t.customer_id = ?
			AND t.user_id = ?
		ORDER BY datetime(t.created_at) ASC, t.id ASC;`,
		normalizedCustomerId,
		userId
	);
	};

	return run();
};

export const getBakiTransactions = ({ customerId = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	if (customerId === null || customerId === undefined) {
		return db.getAllAsync(
			`SELECT
				t.id,
				t.customer_id,
				c.name AS customer_name,
				c.phone AS customer_phone,
				t.type,
				ROUND(t.amount_cents / 100.0, 2) AS amount,
				t.note,
				t.payment_method,
				t.created_at
			FROM baki_transactions t
			JOIN customers c ON c.id = t.customer_id
			WHERE t.user_id = ?
			ORDER BY datetime(t.created_at) DESC, t.id DESC;`
			,
			userId
		);
	}

	const normalizedCustomerId = Number(customerId);
	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT
			t.id,
			t.customer_id,
			c.name AS customer_name,
			c.phone AS customer_phone,
			t.type,
			ROUND(t.amount_cents / 100.0, 2) AS amount,
			t.due_date,
			t.status,
			t.reference_id,
			t.reminder_sent_at,
			t.resolved_at,
			t.note,
			t.payment_method,
			t.created_at
		FROM baki_transactions t
		JOIN customers c ON c.id = t.customer_id
		WHERE t.customer_id = ?
			AND t.user_id = ?
		ORDER BY datetime(t.created_at) DESC, t.id DESC;`,
		normalizedCustomerId
		,
		userId
	);
	};

	return run();
};

export const getBakiKpiSummary = ({ startDateIso, endDateIso, rangeDays = 1 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const start = new Date(startDateIso);
	const end = new Date(endDateIso);
	const normalizedRangeDays = Number.isInteger(Number(rangeDays)) && Number(rangeDays) > 0 ? Number(rangeDays) : 1;

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return Promise.reject(new Error('Valid startDateIso and endDateIso are required.'));
	}

	if (start.getTime() > end.getTime()) {
		return Promise.reject(new Error('startDateIso cannot be after endDateIso.'));
	}

	return db.getFirstAsync(
		`WITH filtered AS (
			SELECT id, customer_id, type, amount_cents, created_at
			FROM baki_transactions
			WHERE datetime(created_at) >= datetime(?)
				AND datetime(created_at) <= datetime(?)
				AND user_id = ?
		),
		per_customer AS (
			SELECT
				f.customer_id,
				SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents ELSE 0 END) AS credit_cents
			FROM filtered f
			GROUP BY f.customer_id
		),
		top_customer AS (
			SELECT pc.customer_id, pc.credit_cents
			FROM per_customer pc
			ORDER BY pc.credit_cents DESC, pc.customer_id ASC
			LIMIT 1
		)
		SELECT
			ROUND(COALESCE(SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents ELSE 0 END), 0) / 100.0, 2) AS total_credit,
			ROUND(COALESCE(SUM(CASE WHEN f.type = 'payment' THEN f.amount_cents ELSE 0 END), 0) / 100.0, 2) AS total_payments_received,
			ROUND(COALESCE(SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents WHEN f.type = 'payment' THEN -f.amount_cents ELSE 0 END), 0) / 100.0, 2) AS net_balance_change,
			COUNT(f.id) AS number_of_transactions,
			ROUND(COALESCE(SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents ELSE 0 END), 0) / (? * 100.0), 2) AS average_daily_credit,
			ROUND(
				COALESCE(SUM(CASE WHEN f.type = 'payment' THEN f.amount_cents ELSE 0 END), 0) /
				CASE
					WHEN SUM(CASE WHEN f.type = 'payment' THEN 1 ELSE 0 END) > 0
					THEN SUM(CASE WHEN f.type = 'payment' THEN 1 ELSE 0 END)
					ELSE 1
				END / 100.0,
				2
			) AS average_payment,
			COALESCE((SELECT c.name FROM top_customer tc JOIN customers c ON c.id = tc.customer_id LIMIT 1), NULL) AS top_customer_name,
			ROUND(COALESCE((SELECT tc.credit_cents FROM top_customer tc LIMIT 1), 0) / 100.0, 2) AS top_customer_credit,
			ROUND(
				CASE
					WHEN COALESCE(SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents ELSE 0 END), 0) > 0
					THEN (
						COALESCE(SUM(CASE WHEN f.type = 'payment' THEN f.amount_cents ELSE 0 END), 0) * 100.0 /
						COALESCE(SUM(CASE WHEN f.type = 'credit' THEN f.amount_cents ELSE 0 END), 1)
					)
					ELSE 0
				END,
				2
			) AS collection_rate,
			COUNT(DISTINCT f.customer_id) AS active_customers
		FROM filtered f;`,
		start.toISOString(),
		end.toISOString(),
		userId,
		normalizedRangeDays
	).then((row) => ({
		total_credit: Number(row?.total_credit || 0),
		total_payments_received: Number(row?.total_payments_received || 0),
		net_balance_change: Number(row?.net_balance_change || 0),
		number_of_transactions: Number(row?.number_of_transactions || 0),
		average_daily_credit: Number(row?.average_daily_credit || 0),
		average_payment: Number(row?.average_payment || 0),
		top_customer_name: row?.top_customer_name || null,
		top_customer_credit: Number(row?.top_customer_credit || 0),
		collection_rate: Number(row?.collection_rate || 0),
		active_customers: Number(row?.active_customers || 0),
	}));
	};

	return run();
};

export const getCollectionsDashboard = ({ asOfIso = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const asOfDate = asOfIso ? new Date(asOfIso) : new Date();
		if (Number.isNaN(asOfDate.getTime())) {
			throw new Error('asOfIso must be a valid date when provided.');
		}

		const [summaryRow, customerRows, overdueRows, promiseRows] = await Promise.all([
			db.getFirstAsync(
				`SELECT
					COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0) AS total_credit_cents,
					COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_cents ELSE 0 END), 0) AS total_payment_cents
				 FROM baki_transactions
				 WHERE user_id = ?;`,
				userId
			),
			db.getAllAsync(
				`SELECT id, name, phone, risk_level, credit_limit, current_balance
				 FROM customers
				 WHERE user_id = ?
				 ORDER BY current_balance DESC, id DESC;`,
				userId
			),
			db.getAllAsync(
				`SELECT amount_cents, due_date
				 FROM baki_transactions
				 WHERE user_id = ?
					AND type = 'credit'
					AND status = 'overdue';`,
				userId
			),
			db.getAllAsync(
				`SELECT promised_amount_cents, promise_date, status
				 FROM payment_promises
				 WHERE user_id = ?
					AND status = 'pending';`,
				userId
			),
		]);

		const nowMs = asOfDate.getTime();
		const agingBuckets = {
			'0_30': 0,
			'31_60': 0,
			'61_90': 0,
			'90_plus': 0,
		};

		for (const row of overdueRows || []) {
			const dueMs = row?.due_date ? new Date(row.due_date).getTime() : nowMs;
			const diffDays = Math.max(0, Math.floor((nowMs - dueMs) / (24 * 60 * 60 * 1000)));
			const amount = fromMoneyCents(Number(row?.amount_cents || 0));

			if (diffDays <= 30) {
				agingBuckets['0_30'] += amount;
			} else if (diffDays <= 60) {
				agingBuckets['31_60'] += amount;
			} else if (diffDays <= 90) {
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

		for (const row of customerRows || []) {
			const token = String(row?.risk_level || 'low').trim().toLowerCase();
			const bucket = token === 'high' || token === 'medium' ? token : 'low';
			segmentSummary[bucket].customers += 1;
			segmentSummary[bucket].outstanding += Number(row?.current_balance || 0);
		}

		const totalCredit = fromMoneyCents(Number(summaryRow?.total_credit_cents || 0));
		const totalPayment = fromMoneyCents(Number(summaryRow?.total_payment_cents || 0));
		const totalOutstanding = (customerRows || []).reduce((sum, row) => sum + Number(row.current_balance || 0), 0);
		const totalOverdue = (overdueRows || []).reduce((sum, row) => sum + fromMoneyCents(Number(row.amount_cents || 0)), 0);
		const totalPromised = (promiseRows || []).reduce(
			(sum, row) => sum + fromMoneyCents(Number(row.promised_amount_cents || 0)),
			0
		);

		return {
			total_credit: Number(totalCredit.toFixed(2)),
			total_payment: Number(totalPayment.toFixed(2)),
			total_outstanding: Number(totalOutstanding.toFixed(2)),
			total_overdue: Number(totalOverdue.toFixed(2)),
			collection_rate: totalCredit > 0 ? Number(((totalPayment / totalCredit) * 100).toFixed(2)) : 0,
			aging_buckets: {
				'0_30': Number(agingBuckets['0_30'].toFixed(2)),
				'31_60': Number(agingBuckets['31_60'].toFixed(2)),
				'61_90': Number(agingBuckets['61_90'].toFixed(2)),
				'90_plus': Number(agingBuckets['90_plus'].toFixed(2)),
			},
			segment_summary: {
				low: {
					customers: segmentSummary.low.customers,
					outstanding: Number(segmentSummary.low.outstanding.toFixed(2)),
				},
				medium: {
					customers: segmentSummary.medium.customers,
					outstanding: Number(segmentSummary.medium.outstanding.toFixed(2)),
				},
				high: {
					customers: segmentSummary.high.customers,
					outstanding: Number(segmentSummary.high.outstanding.toFixed(2)),
				},
			},
			pending_promises: {
				count: (promiseRows || []).length,
				total_promised: Number(totalPromised.toFixed(2)),
			},
			customers: (customerRows || []).map((row) => ({
				customer_id: Number(row.id),
				name: String(row.name || ''),
				phone: row.phone ? String(row.phone) : null,
				risk_level: String(row.risk_level || 'low'),
				credit_limit: Number(row.credit_limit || 0),
				current_balance: Number(row.current_balance || 0),
			})),
		};
	};

	return run();
};

export const getCustomerStatement = ({ customerId, fromDateIso = null, toDateIso = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedCustomerId = Number(customerId);

		if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
			throw new Error('Valid customerId is required.');
		}

		const fromDate = fromDateIso ? new Date(fromDateIso) : null;
		const toDate = toDateIso ? new Date(toDateIso) : null;
		if (fromDate && Number.isNaN(fromDate.getTime())) {
			throw new Error('fromDateIso must be a valid date.');
		}
		if (toDate && Number.isNaN(toDate.getTime())) {
			throw new Error('toDateIso must be a valid date.');
		}

		const customer = await db.getFirstAsync(
			`SELECT id, name, phone, address, credit_limit, current_balance, risk_level, due_terms_days, last_payment_date
			 FROM customers
			 WHERE id = ? AND user_id = ?
			 LIMIT 1;`,
			normalizedCustomerId,
			userId
		);

		if (!customer) {
			throw new Error('Customer not found.');
		}

		const entries = await db.getAllAsync(
			`SELECT
				id,
				type,
				ROUND(amount_cents / 100.0, 2) AS amount,
				due_date,
				status,
				reference_id,
				reminder_sent_at,
				resolved_at,
				note,
				payment_method,
				created_at
			 FROM baki_transactions
			 WHERE user_id = ?
				AND customer_id = ?
				AND (? IS NULL OR datetime(created_at) >= datetime(?))
				AND (? IS NULL OR datetime(created_at) <= datetime(?))
			 ORDER BY datetime(created_at) ASC, id ASC;`,
			userId,
			normalizedCustomerId,
			fromDate ? fromDate.toISOString() : null,
			fromDate ? fromDate.toISOString() : null,
			toDate ? toDate.toISOString() : null,
			toDate ? toDate.toISOString() : null
		);

		const reminders = await db.getAllAsync(
			`SELECT id, channel, message, sent_at, status, reference_id
			 FROM collection_reminders
			 WHERE user_id = ? AND customer_id = ?
			 ORDER BY datetime(sent_at) DESC, id DESC
			 LIMIT 30;`,
			userId,
			normalizedCustomerId
		);

		const promises = await db.getAllAsync(
			`SELECT id, promised_amount_cents, promise_date, status, note, fulfilled_baki_transaction_id
			 FROM payment_promises
			 WHERE user_id = ? AND customer_id = ?
			 ORDER BY datetime(promise_date) DESC, id DESC
			 LIMIT 30;`,
			userId,
			normalizedCustomerId
		);

		const totalCredit = entries.reduce((sum, row) => sum + (String(row.type) === 'credit' ? Number(row.amount || 0) : 0), 0);
		const totalPayment = entries.reduce((sum, row) => sum + (String(row.type) === 'payment' ? Number(row.amount || 0) : 0), 0);

		return {
			customer: {
				customer_id: Number(customer.id),
				name: String(customer.name || ''),
				phone: customer.phone ? String(customer.phone) : null,
				address: customer.address ? String(customer.address) : null,
				credit_limit: Number(customer.credit_limit || 0),
				current_balance: Number(customer.current_balance || 0),
				risk_level: String(customer.risk_level || 'low'),
				due_terms_days: Number(customer.due_terms_days || 30),
				last_payment_date: customer.last_payment_date || null,
			},
			summary: {
				total_credit: Number(totalCredit.toFixed(2)),
				total_payment: Number(totalPayment.toFixed(2)),
				closing_balance: Number(Math.max(0, totalCredit - totalPayment).toFixed(2)),
			},
			entries,
			reminders: (reminders || []).map((row) => ({
				id: Number(row.id),
				channel: String(row.channel || 'manual'),
				message: row.message ? String(row.message) : null,
				sent_at: row.sent_at || null,
				status: String(row.status || 'sent'),
				reference_id: row.reference_id ? String(row.reference_id) : null,
			})),
			promises: (promises || []).map((row) => ({
				id: Number(row.id),
				promised_amount: fromMoneyCents(Number(row.promised_amount_cents || 0)),
				promise_date: row.promise_date || null,
				status: String(row.status || 'pending'),
				note: row.note ? String(row.note) : null,
				fulfilled_baki_transaction_id: row.fulfilled_baki_transaction_id ? Number(row.fulfilled_baki_transaction_id) : null,
			})),
		};
	};

	return run();
};

export const scheduleCollectionReminder = ({
	customerId,
	bakiTransactionId = null,
	channel = 'manual',
	message = null,
	sentAt = null,
	referenceId = null,
	status = 'sent',
} = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedCustomerId = Number(customerId);
		const normalizedBakiTransactionId = bakiTransactionId === null || bakiTransactionId === undefined
			? null
			: Number(bakiTransactionId);
		const normalizedChannel = String(channel || 'manual').trim().toLowerCase();
		const normalizedStatus = String(status || 'sent').trim().toLowerCase();
		const normalizedSentAt = sentAt ? new Date(sentAt) : new Date();

		if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
			throw new Error('Valid customerId is required.');
		}

		if (normalizedBakiTransactionId !== null && (!Number.isInteger(normalizedBakiTransactionId) || normalizedBakiTransactionId <= 0)) {
			throw new Error('bakiTransactionId must be a valid transaction id when provided.');
		}

		if (!CREDIT_REMINDER_CHANNELS.has(normalizedChannel)) {
			throw new Error('channel must be sms, whatsapp, call, or manual.');
		}

		if (!['queued', 'sent', 'failed'].includes(normalizedStatus)) {
			throw new Error('status must be queued, sent, or failed.');
		}

		if (Number.isNaN(normalizedSentAt.getTime())) {
			throw new Error('sentAt must be a valid date.');
		}

		const syncUpdatedAt = new Date().toISOString();
		const result = await db.runAsync(
			`INSERT INTO collection_reminders (
				user_id,
				customer_id,
				baki_transaction_id,
				channel,
				message,
				sent_at,
				status,
				reference_id,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL);`,
			userId,
			normalizedCustomerId,
			normalizedBakiTransactionId,
			normalizedChannel,
			typeof message === 'string' ? message.trim() : null,
			normalizedSentAt.toISOString(),
			normalizedStatus,
			typeof referenceId === 'string' ? referenceId.trim() : null,
			null,
			syncUpdatedAt
		);

		const localId = Number(result.lastInsertRowId);
		const clientRefId = buildLocalClientRefId({ entityType: 'collection_reminder', localId });
		await db.runAsync(`UPDATE collection_reminders SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

		if (normalizedBakiTransactionId) {
			await db.runAsync(
				`UPDATE baki_transactions
				 SET reminder_sent_at = ?
				 WHERE id = ? AND user_id = ?;`,
				normalizedSentAt.toISOString(),
				normalizedBakiTransactionId,
				userId
			);
		}

		const customerRow = await db.getFirstAsync(
			`SELECT server_id, client_ref_id FROM customers WHERE id = ? AND user_id = ? LIMIT 1;`,
			normalizedCustomerId,
			userId
		);

		let bakiRow = null;
		if (normalizedBakiTransactionId) {
			bakiRow = await db.getFirstAsync(
				`SELECT server_id, client_ref_id FROM baki_transactions WHERE id = ? AND user_id = ? LIMIT 1;`,
				normalizedBakiTransactionId,
				userId
			);
		}

		await enqueueEntitySyncChange({
			entityType: 'collection_reminder',
			operation: 'upsert',
			localId,
			clientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				customerId: normalizedCustomerId,
				customerServerId: customerRow?.server_id || null,
				customerClientRefId: customerRow?.client_ref_id || null,
				bakiEntryId: normalizedBakiTransactionId,
				bakiEntryServerId: bakiRow?.server_id || null,
				bakiEntryClientRefId: bakiRow?.client_ref_id || null,
				channel: normalizedChannel,
				message: typeof message === 'string' ? message.trim() : null,
				sentAt: normalizedSentAt.toISOString(),
				status: normalizedStatus,
				referenceId: typeof referenceId === 'string' ? referenceId.trim() : null,
				deletedAt: null,
			},
		});

		return {
			id: localId,
			customer_id: normalizedCustomerId,
			baki_transaction_id: normalizedBakiTransactionId,
			channel: normalizedChannel,
			message: typeof message === 'string' ? message.trim() : null,
			sent_at: normalizedSentAt.toISOString(),
			status: normalizedStatus,
			reference_id: typeof referenceId === 'string' ? referenceId.trim() : null,
		};
	};

	return run();
};

export const getCollectionReminders = ({ customerId = null, limit = 100 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedLimit = Math.max(1, Math.min(300, Number(limit) || 100));
		const normalizedCustomerId = customerId === null || customerId === undefined || customerId === ''
			? null
			: Number(customerId);

		if (normalizedCustomerId !== null && (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0)) {
			throw new Error('Valid customerId is required when provided.');
		}

		return db.getAllAsync(
			`SELECT id, customer_id, baki_transaction_id, channel, message, sent_at, status, reference_id
			 FROM collection_reminders
			 WHERE user_id = ?
				AND (? IS NULL OR customer_id = ?)
			 ORDER BY datetime(sent_at) DESC, id DESC
			 LIMIT ?;`,
			userId,
			normalizedCustomerId,
			normalizedCustomerId,
			normalizedLimit
		);
	};

	return run();
};

export const createPaymentPromise = ({ customerId, promisedAmount, promiseDate, note = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedCustomerId = Number(customerId);
		const promisedAmountCents = toMoneyCents(promisedAmount);
		const normalizedPromiseDate = new Date(promiseDate);

		if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
			throw new Error('Valid customerId is required.');
		}

		if (!Number.isInteger(promisedAmountCents) || promisedAmountCents <= 0) {
			throw new Error('promisedAmount must be greater than 0.');
		}

		if (Number.isNaN(normalizedPromiseDate.getTime())) {
			throw new Error('promiseDate must be a valid date.');
		}

		const syncUpdatedAt = new Date().toISOString();
		const result = await db.runAsync(
			`INSERT INTO payment_promises (
				user_id,
				customer_id,
				promised_amount_cents,
				promise_date,
				status,
				note,
				fulfilled_baki_transaction_id,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?, 1, ?, NULL, datetime('now'), datetime('now'));`,
			userId,
			normalizedCustomerId,
			promisedAmountCents,
			normalizedPromiseDate.toISOString(),
			typeof note === 'string' ? note.trim() : null,
			null,
			syncUpdatedAt
		);

		const localId = Number(result.lastInsertRowId);
		const clientRefId = buildLocalClientRefId({ entityType: 'payment_promise', localId });
		await db.runAsync(`UPDATE payment_promises SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

		const customerRow = await db.getFirstAsync(
			`SELECT server_id, client_ref_id FROM customers WHERE id = ? AND user_id = ? LIMIT 1;`,
			normalizedCustomerId,
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'payment_promise',
			operation: 'upsert',
			localId,
			clientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				customerId: normalizedCustomerId,
				customerServerId: customerRow?.server_id || null,
				customerClientRefId: customerRow?.client_ref_id || null,
				promisedAmount: fromMoneyCents(promisedAmountCents),
				promiseDate: normalizedPromiseDate.toISOString(),
				status: 'pending',
				note: typeof note === 'string' ? note.trim() : null,
				fulfilledByEntryId: null,
				fulfilledByEntryServerId: null,
				fulfilledByEntryClientRefId: null,
				deletedAt: null,
			},
		});

		return {
			id: localId,
			customer_id: normalizedCustomerId,
			promised_amount: fromMoneyCents(promisedAmountCents),
			promise_date: normalizedPromiseDate.toISOString(),
			status: 'pending',
			note: typeof note === 'string' ? note.trim() : null,
		};
	};

	return run();
};

export const getPaymentPromises = ({ customerId = null, status = 'all', limit = 100 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedCustomerId = customerId === null || customerId === undefined || customerId === ''
			? null
			: Number(customerId);
		const normalizedStatus = String(status || 'all').trim().toLowerCase();
		const effectiveStatus = PAYMENT_PROMISE_STATUSES.has(normalizedStatus) ? normalizedStatus : 'all';
		const normalizedLimit = Math.max(1, Math.min(300, Number(limit) || 100));

		if (normalizedCustomerId !== null && (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0)) {
			throw new Error('Valid customerId is required when provided.');
		}

		return db.getAllAsync(
			`SELECT id, customer_id, promised_amount_cents, promise_date, status, note, fulfilled_baki_transaction_id
			 FROM payment_promises
			 WHERE user_id = ?
				AND (? IS NULL OR customer_id = ?)
				AND (? = 'all' OR status = ?)
			 ORDER BY datetime(promise_date) DESC, id DESC
			 LIMIT ?;`,
			userId,
			normalizedCustomerId,
			normalizedCustomerId,
			effectiveStatus,
			effectiveStatus,
			normalizedLimit
		).then((rows) =>
			(rows || []).map((row) => ({
				id: Number(row.id),
				customer_id: Number(row.customer_id),
				promised_amount: fromMoneyCents(Number(row.promised_amount_cents || 0)),
				promise_date: row.promise_date || null,
				status: String(row.status || 'pending'),
				note: row.note ? String(row.note) : null,
				fulfilled_baki_transaction_id: row.fulfilled_baki_transaction_id ? Number(row.fulfilled_baki_transaction_id) : null,
			}))
		);
	};

	return run();
};

export const updatePaymentPromiseStatus = ({ promiseId, status, fulfilledBakiTransactionId = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const normalizedPromiseId = Number(promiseId);
		const normalizedStatus = String(status || '').trim().toLowerCase();
		const normalizedFulfilledBakiTransactionId = fulfilledBakiTransactionId === null || fulfilledBakiTransactionId === undefined
			? null
			: Number(fulfilledBakiTransactionId);

		if (!Number.isInteger(normalizedPromiseId) || normalizedPromiseId <= 0) {
			throw new Error('Valid promiseId is required.');
		}

		if (!PAYMENT_PROMISE_STATUSES.has(normalizedStatus)) {
			throw new Error('status must be pending, fulfilled, or broken.');
		}

		if (
			normalizedFulfilledBakiTransactionId !== null
			&& (!Number.isInteger(normalizedFulfilledBakiTransactionId) || normalizedFulfilledBakiTransactionId <= 0)
		) {
			throw new Error('fulfilledBakiTransactionId must be a valid transaction id when provided.');
		}

		const syncUpdatedAt = new Date().toISOString();
		const result = await db.runAsync(
			`UPDATE payment_promises
			 SET status = ?,
				 fulfilled_baki_transaction_id = CASE WHEN ? = 'fulfilled' THEN ? ELSE fulfilled_baki_transaction_id END,
				 sync_version = COALESCE(sync_version, 0) + 1,
				 sync_updated_at = ?,
				 updated_at = datetime('now')
			 WHERE id = ? AND user_id = ?;`,
			normalizedStatus,
			normalizedStatus,
			normalizedFulfilledBakiTransactionId,
			syncUpdatedAt,
			normalizedPromiseId,
			userId
		);

		if (!result?.changes) {
			throw new Error('Payment promise not found.');
		}

		const row = await db.getFirstAsync(
			`SELECT
				pp.id,
				pp.customer_id,
				pp.promised_amount_cents,
				pp.promise_date,
				pp.status,
				pp.note,
				pp.fulfilled_baki_transaction_id,
				pp.server_id,
				pp.client_ref_id,
				pp.sync_version,
				c.server_id AS customer_server_id,
				c.client_ref_id AS customer_client_ref_id,
				bt.server_id AS fulfilled_baki_server_id,
				bt.client_ref_id AS fulfilled_baki_client_ref_id
			 FROM payment_promises pp
			 JOIN customers c ON c.id = pp.customer_id
			 LEFT JOIN baki_transactions bt ON bt.id = pp.fulfilled_baki_transaction_id AND bt.user_id = pp.user_id
			 WHERE pp.id = ? AND pp.user_id = ?
			 LIMIT 1;`,
			normalizedPromiseId,
			userId
		);

		if (row?.id) {
			await enqueueEntitySyncChange({
				entityType: 'payment_promise',
				operation: 'upsert',
				localId: Number(row.id),
				clientRefId: row.client_ref_id,
				serverId: row.server_id || null,
				version: Number(row.sync_version || 1),
				updatedAt: syncUpdatedAt,
				data: {
					customerId: Number(row.customer_id),
					customerServerId: row.customer_server_id || null,
					customerClientRefId: row.customer_client_ref_id || null,
					promisedAmount: fromMoneyCents(Number(row.promised_amount_cents || 0)),
					promiseDate: row.promise_date || null,
					status: String(row.status || 'pending'),
					note: row.note ? String(row.note) : null,
					fulfilledByEntryId: row.fulfilled_baki_transaction_id ? Number(row.fulfilled_baki_transaction_id) : null,
					fulfilledByEntryServerId: row.fulfilled_baki_server_id || null,
					fulfilledByEntryClientRefId: row.fulfilled_baki_client_ref_id || null,
					deletedAt: null,
				},
			});
		}

		return {
			id: normalizedPromiseId,
			status: normalizedStatus,
			fulfilled_baki_transaction_id: normalizedStatus === 'fulfilled' ? normalizedFulfilledBakiTransactionId : null,
		};
	};

	return run();
};

export const buildCustomerStatementCsv = ({ statement }) => {
	const customer = statement?.customer || {};
	const rows = Array.isArray(statement?.entries) ? statement.entries : [];
	const header = ['date', 'type', 'amount', 'status', 'due_date', 'reference_id', 'payment_method', 'note'];
	const body = rows.map((row) => [
		row.created_at || '',
		row.type || '',
		Number(row.amount || 0).toFixed(2),
		row.status || '',
		row.due_date || '',
		row.reference_id || '',
		row.payment_method || '',
		(row.note || '').replace(/\"/g, '\"\"'),
	]);

	return [
		`customer,\"${String(customer.name || '').replace(/\"/g, '\"\"')}\"`,
		`phone,\"${String(customer.phone || '').replace(/\"/g, '\"\"')}\"`,
		header.join(','),
		...body.map((cols) => cols.map((col) => `\"${String(col || '')}\"`).join(',')),
	].join('\n');
};

export const getDashboardKpiSummary = ({ startDateIso, endDateIso, transactionType = 'all' } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const start = new Date(startDateIso);
	const end = new Date(endDateIso);
	const normalizedType = typeof transactionType === 'string' ? transactionType.trim().toLowerCase() : 'all';
	const effectiveType = BAKI_TRANSACTION_TYPES.has(normalizedType) ? normalizedType : 'all';

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return Promise.reject(new Error('Valid startDateIso and endDateIso are required.'));
	}

	if (start.getTime() > end.getTime()) {
		return Promise.reject(new Error('startDateIso cannot be after endDateIso.'));
	}

	const salesRow = await db.getFirstAsync(
		`SELECT ROUND(COALESCE(SUM(total_amount_cents), 0) / 100.0, 2) AS total_sales
		 FROM sales_header
		 WHERE datetime(COALESCE(timestamp, created_at)) >= datetime(?)
		   AND datetime(COALESCE(timestamp, created_at)) <= datetime(?)
		   AND user_id = ?
		   AND (deleted_at IS NULL)
		   AND status = 'posted';`,
		start.toISOString(),
		end.toISOString(),
		userId,
	);

	return db
		.getFirstAsync(
			`WITH filtered AS (
				SELECT id, customer_id, type, amount_cents
				FROM baki_transactions
				WHERE datetime(created_at) >= datetime(?)
					AND datetime(created_at) <= datetime(?)
					AND user_id = ?
					AND (? = 'all' OR type = ?)
			),
			customer_due AS (
				SELECT
					c.id AS customer_id,
					c.name AS customer_name,
					COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents WHEN t.type = 'payment' THEN -t.amount_cents ELSE 0 END), 0) AS due_cents
				FROM customers c
				LEFT JOIN baki_transactions t ON t.customer_id = c.id AND t.user_id = c.user_id
				WHERE c.user_id = ?
				GROUP BY c.id
			),
			top_debtor AS (
				SELECT customer_id, customer_name, due_cents
				FROM customer_due
				WHERE due_cents > 0
				ORDER BY due_cents DESC, customer_id ASC
				LIMIT 1
			),
			most_active AS (
				SELECT
					f.customer_id,
					c.name AS customer_name,
					COUNT(f.id) AS tx_count
				FROM filtered f
				JOIN customers c ON c.id = f.customer_id
				GROUP BY f.customer_id
				ORDER BY tx_count DESC, f.customer_id ASC
				LIMIT 1
			)
			SELECT
				ROUND(COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0) / 100.0, 2) AS total_credit,
				ROUND(COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_cents ELSE 0 END), 0) / 100.0, 2) AS total_payment,
				ROUND(COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents WHEN type = 'payment' THEN -amount_cents ELSE 0 END), 0) / 100.0, 2) AS net,
				COUNT(id) AS transactions_count,
				COUNT(DISTINCT customer_id) AS active_customers,
				ROUND(
					CASE
						WHEN COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 0) > 0
						THEN (
							COALESCE(SUM(CASE WHEN type = 'payment' THEN amount_cents ELSE 0 END), 0) * 100.0 /
							COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END), 1)
						)
						ELSE 0
					END,
					2
				) AS collection_rate,
				ROUND(
					COALESCE(SUM(amount_cents), 0) /
					CASE WHEN COUNT(id) > 0 THEN COUNT(id) ELSE 1 END /
					100.0,
					2
				) AS average_transaction,
				COALESCE((SELECT td.customer_name FROM top_debtor td LIMIT 1), NULL) AS top_debtor_name,
				ROUND(COALESCE((SELECT td.due_cents FROM top_debtor td LIMIT 1), 0) / 100.0, 2) AS top_debtor_due,
				COALESCE((SELECT ma.customer_name FROM most_active ma LIMIT 1), NULL) AS most_active_customer_name,
				COALESCE((SELECT ma.tx_count FROM most_active ma LIMIT 1), 0) AS most_active_customer_tx_count
			FROM filtered;`,
			start.toISOString(),
			end.toISOString(),
			userId,
			effectiveType,
			effectiveType,
			userId
		)
		.then((row) => ({
			total_credit: Number(row?.total_credit || 0),
			total_payment: Number(row?.total_payment || 0),
			total_sales: Number(salesRow?.total_sales || 0),
			net: Number(row?.net || 0),
			transactions_count: Number(row?.transactions_count || 0),
			active_customers: Number(row?.active_customers || 0),
			collection_rate: Number(row?.collection_rate || 0),
			average_transaction: Number(row?.average_transaction || 0),
			top_debtor_name: row?.top_debtor_name || null,
			top_debtor_due: Number(row?.top_debtor_due || 0),
			most_active_customer_name: row?.most_active_customer_name || null,
			most_active_customer_tx_count: Number(row?.most_active_customer_tx_count || 0),
			transaction_type: effectiveType,
		}));
	};

	return run();
};

export const getStockMovementCountInRange = ({ startDateIso, endDateIso } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const start = new Date(startDateIso);
	const end = new Date(endDateIso);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return Promise.reject(new Error('Valid startDateIso and endDateIso are required.'));
	}

	if (start.getTime() > end.getTime()) {
		return Promise.reject(new Error('startDateIso cannot be after endDateIso.'));
	}

	return db
		.getFirstAsync(
			`SELECT COUNT(id) AS movement_count
			FROM stock_movements
			WHERE datetime(created_at) >= datetime(?)
				AND datetime(created_at) <= datetime(?)
				AND user_id = ?;`,
			start.toISOString(),
			end.toISOString(),
			userId
		)
		.then((row) => Number(row?.movement_count || 0));
	};

	return run();
};

export const getDashboardTopActiveCustomers = ({ startDateIso, endDateIso, transactionType = 'all', limit = 5 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const start = new Date(startDateIso);
	const end = new Date(endDateIso);
	const normalizedType = typeof transactionType === 'string' ? transactionType.trim().toLowerCase() : 'all';
	const effectiveType = BAKI_TRANSACTION_TYPES.has(normalizedType) ? normalizedType : 'all';
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 5;

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return Promise.reject(new Error('Valid startDateIso and endDateIso are required.'));
	}

	if (start.getTime() > end.getTime()) {
		return Promise.reject(new Error('startDateIso cannot be after endDateIso.'));
	}

	return db.getAllAsync(
		`SELECT
			t.customer_id,
			c.name AS customer_name,
			COUNT(t.id) AS tx_count,
			ROUND(COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount_cents ELSE 0 END), 0) / 100.0, 2) AS credit_total,
			ROUND(COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount_cents ELSE 0 END), 0) / 100.0, 2) AS payment_total
		FROM baki_transactions t
		JOIN customers c ON c.id = t.customer_id
		WHERE datetime(t.created_at) >= datetime(?)
			AND datetime(t.created_at) <= datetime(?)
			AND t.user_id = ?
			AND (? = 'all' OR t.type = ?)
		GROUP BY t.customer_id
		ORDER BY tx_count DESC, t.customer_id ASC
		LIMIT ?;`,
		start.toISOString(),
		end.toISOString(),
		userId,
		effectiveType,
		effectiveType,
		effectiveLimit
	);
	};

	return run();
};

const mapPilotShopRow = (row) => ({
	id: Number(row?.id || 0),
	user_id: Number(row?.user_id || 0),
	shop_name: row?.shop_name || '',
	type: row?.type || '',
	onboarding_date: row?.onboarding_date || null,
	status: row?.status || 'planned',
	estimated_daily_sales: Number(row?.estimated_daily_sales || 0),
	created_at: row?.created_at || null,
	updated_at: row?.updated_at || null,
});

const mapAnalyticsEventRow = (row) => {
	let metadata = null;
	if (row?.metadata_json) {
		try {
			metadata = JSON.parse(row.metadata_json);
		} catch {
			metadata = null;
		}
	}

	return {
		id: Number(row?.id || 0),
		user_id: Number(row?.user_id || 0),
		shop_id: row?.shop_id === null || row?.shop_id === undefined ? null : Number(row.shop_id),
		event_type: row?.event_type || '',
		timestamp: row?.timestamp || null,
		source: row?.source || null,
		metadata,
	};
};

const mapFeedbackRow = (row) => ({
	id: Number(row?.id || 0),
	user_id: Number(row?.user_id || 0),
	shop_id: Number(row?.shop_id || 0),
	category: row?.category || 'ux',
	rating: row?.rating === null || row?.rating === undefined ? null : Number(row.rating),
	message: row?.message || '',
	timestamp: row?.timestamp || null,
	status: row?.status || 'new',
	created_at: row?.created_at || null,
	updated_at: row?.updated_at || null,
});

export const addPilotShop = async ({
	shopName,
	type,
	onboardingDate = null,
	status = 'planned',
	estimatedDailySales = 0,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedName = String(shopName || '').trim();
	const normalizedType = String(type || '').trim().toLowerCase();
	const normalizedStatus = String(status || 'planned').trim().toLowerCase();

	if (!normalizedName) {
		throw new Error('shopName is required.');
	}

	if (!normalizedType) {
		throw new Error('type is required.');
	}

	if (!PILOT_SHOP_STATUSES.has(normalizedStatus)) {
		throw new Error('status is invalid.');
	}

	const normalizedOnboardingDate = onboardingDate ? new Date(onboardingDate).toISOString() : new Date().toISOString();
	const sales = Math.max(0, Number(estimatedDailySales || 0));

	await db.runAsync(
		`INSERT INTO pilot_shops (user_id, shop_name, type, onboarding_date, status, estimated_daily_sales)
		 VALUES (?, ?, ?, ?, ?, ?);`,
		userId,
		normalizedName,
		normalizedType,
		normalizedOnboardingDate,
		normalizedStatus,
		sales
	);

	const created = await db.getFirstAsync(
		`SELECT id, user_id, shop_name, type, onboarding_date, status, estimated_daily_sales, created_at, updated_at
		 FROM pilot_shops
		 WHERE user_id = ?
		 ORDER BY id DESC
		 LIMIT 1;`,
		userId
	);

	return mapPilotShopRow(created);
};

export const listPilotShops = async ({ status = 'all', limit = 200 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedStatus = String(status || 'all').trim().toLowerCase();
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 200;

	const rows = await db.getAllAsync(
		`SELECT id, user_id, shop_name, type, onboarding_date, status, estimated_daily_sales, created_at, updated_at
		 FROM pilot_shops
		 WHERE user_id = ?
			AND (? = 'all' OR status = ?)
		 ORDER BY datetime(onboarding_date) DESC, id DESC
		 LIMIT ?;`,
		userId,
		normalizedStatus,
		normalizedStatus,
		effectiveLimit
	);

	return (rows || []).map(mapPilotShopRow);
};

export const trackAnalyticsEvent = async ({
	shopId = null,
	eventType,
	timestamp = null,
	source = 'mobile_app',
	metadata = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedType = String(eventType || '').trim().toLowerCase();

	if (!normalizedType) {
		throw new Error('eventType is required.');
	}

	let metadataJson = null;
	if (metadata !== null && metadata !== undefined) {
		try {
			metadataJson = JSON.stringify(metadata);
		} catch {
			metadataJson = null;
		}
	}

	const normalizedTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

	await db.runAsync(
		`INSERT INTO analytics_events (user_id, shop_id, event_type, timestamp, source, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?);`,
		userId,
		shopId === null || shopId === undefined || shopId === '' ? null : Number(shopId),
		normalizedType,
		normalizedTimestamp,
		source ? String(source) : null,
		metadataJson
	);

	const created = await db.getFirstAsync(
		`SELECT id, user_id, shop_id, event_type, timestamp, source, metadata_json
		 FROM analytics_events
		 WHERE user_id = ?
		 ORDER BY id DESC
		 LIMIT 1;`,
		userId
	);

	return mapAnalyticsEventRow(created);
};

export const listAnalyticsEvents = async ({
	eventType = 'all',
	shopId = null,
	fromDateIso = null,
	toDateIso = null,
	limit = 200,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedEventType = String(eventType || 'all').trim().toLowerCase();
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 200;
	const normalizedFrom = fromDateIso ? new Date(fromDateIso).toISOString() : null;
	const normalizedTo = toDateIso ? new Date(toDateIso).toISOString() : null;

	const rows = await db.getAllAsync(
		`SELECT id, user_id, shop_id, event_type, timestamp, source, metadata_json
		 FROM analytics_events
		 WHERE user_id = ?
			AND (? = 'all' OR event_type = ?)
			AND (? IS NULL OR shop_id = ?)
			AND (? IS NULL OR datetime(timestamp) >= datetime(?))
			AND (? IS NULL OR datetime(timestamp) <= datetime(?))
		 ORDER BY datetime(timestamp) DESC, id DESC
		 LIMIT ?;`,
		userId,
		normalizedEventType,
		normalizedEventType,
		shopId,
		shopId,
		normalizedFrom,
		normalizedFrom,
		normalizedTo,
		normalizedTo,
		effectiveLimit
	);

	return (rows || []).map(mapAnalyticsEventRow);
};

export const submitFeedback = async ({
	shopId,
	category,
	rating = null,
	message,
	timestamp = null,
	status = 'new',
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedShopId = Number(shopId);
	const normalizedCategory = String(category || '').trim().toLowerCase();
	const normalizedStatus = String(status || 'new').trim().toLowerCase();
	const normalizedMessage = String(message || '').trim();

	if (!Number.isInteger(normalizedShopId) || normalizedShopId <= 0) {
		throw new Error('shopId is required.');
	}

	if (!FEEDBACK_CATEGORIES.has(normalizedCategory)) {
		throw new Error('category must be bug, feature, or ux.');
	}

	if (!FEEDBACK_STATUSES.has(normalizedStatus)) {
		throw new Error('status is invalid.');
	}

	if (!normalizedMessage) {
		throw new Error('message is required.');
	}

	const normalizedRating = rating === null || rating === undefined || rating === '' ? null : Number(rating);
	if (normalizedRating !== null && (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5)) {
		throw new Error('rating must be between 1 and 5 when provided.');
	}

	const normalizedTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

	await db.runAsync(
		`INSERT INTO feedback (user_id, shop_id, category, rating, message, timestamp, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?);`,
		userId,
		normalizedShopId,
		normalizedCategory,
		normalizedRating,
		normalizedMessage,
		normalizedTimestamp,
		normalizedStatus
	);

	const created = await db.getFirstAsync(
		`SELECT id, user_id, shop_id, category, rating, message, timestamp, status, created_at, updated_at
		 FROM feedback
		 WHERE user_id = ?
		 ORDER BY id DESC
		 LIMIT 1;`,
		userId
	);

	return mapFeedbackRow(created);
};

export const listFeedback = async ({ shopId = null, category = 'all', limit = 200 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedCategory = String(category || 'all').trim().toLowerCase();
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 200;

	const rows = await db.getAllAsync(
		`SELECT id, user_id, shop_id, category, rating, message, timestamp, status, created_at, updated_at
		 FROM feedback
		 WHERE user_id = ?
			AND (? IS NULL OR shop_id = ?)
			AND (? = 'all' OR category = ?)
		 ORDER BY datetime(timestamp) DESC, id DESC
		 LIMIT ?;`,
		userId,
		shopId,
		shopId,
		normalizedCategory,
		normalizedCategory,
		effectiveLimit
	);

	return (rows || []).map(mapFeedbackRow);
};

export const getPilotMetricsOverview = async ({ fromDateIso = null, toDateIso = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedFrom = fromDateIso ? new Date(fromDateIso).toISOString() : null;
	const normalizedTo = toDateIso ? new Date(toDateIso).toISOString() : null;

	const [daoRow, ratioRows, featureRows] = await Promise.all([
		db.getFirstAsync(
			`SELECT COUNT(DISTINCT DATE(datetime(timestamp))) AS active_operator_days
			 FROM analytics_events
			 WHERE user_id = ?
				AND event_type = 'login'
				AND (? IS NULL OR datetime(timestamp) >= datetime(?))
				AND (? IS NULL OR datetime(timestamp) <= datetime(?));`,
			userId,
			normalizedFrom,
			normalizedFrom,
			normalizedTo,
			normalizedTo
		),
		db.getAllAsync(
			`SELECT event_type, COUNT(id) AS total
			 FROM analytics_events
			 WHERE user_id = ?
				AND event_type IN ('sale_created', 'payment_recorded')
				AND (? IS NULL OR datetime(timestamp) >= datetime(?))
				AND (? IS NULL OR datetime(timestamp) <= datetime(?))
			 GROUP BY event_type;`,
			userId,
			normalizedFrom,
			normalizedFrom,
			normalizedTo,
			normalizedTo
		),
		db.getAllAsync(
			`SELECT event_type, COUNT(id) AS total
			 FROM analytics_events
			 WHERE user_id = ?
				AND (? IS NULL OR datetime(timestamp) >= datetime(?))
				AND (? IS NULL OR datetime(timestamp) <= datetime(?))
			 GROUP BY event_type
			 ORDER BY total DESC, event_type ASC
			 LIMIT 10;`,
			userId,
			normalizedFrom,
			normalizedFrom,
			normalizedTo,
			normalizedTo
		),
	]);

	const digitalSalesCount = Number((ratioRows || []).find((row) => row.event_type === 'sale_created')?.total || 0);
	const totalTransactions = (ratioRows || []).reduce((sum, row) => sum + Number(row.total || 0), 0);

	return {
		dao: Number(daoRow?.active_operator_days || 0),
		digital_sales_ratio: totalTransactions > 0
			? Number(((digitalSalesCount * 100) / totalTransactions).toFixed(2))
			: 0,
		feature_usage: (featureRows || []).map((row) => ({
			event_type: row.event_type,
			count: Number(row.total || 0),
		})),
	};
};

export const getAuditLogs = async ({
	entityType = 'all',
	action = 'all',
	searchText = '',
	limit = 200,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedEntityType = String(entityType || 'all').trim().toLowerCase();
	const normalizedAction = String(action || 'all').trim().toLowerCase();
	const normalizedSearch = String(searchText || '').trim().toLowerCase();
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 200;

	return db.getAllAsync(
		`SELECT id, user_id, entity_type, entity_id, action, metadata_json, notes, created_at
		 FROM audit_logs
		 WHERE user_id = ?
			AND (? = 'all' OR LOWER(entity_type) = ?)
			AND (? = 'all' OR LOWER(action) = ?)
			AND (
				? = ''
				OR LOWER(COALESCE(entity_type, '')) LIKE ?
				OR LOWER(COALESCE(action, '')) LIKE ?
				OR LOWER(COALESCE(notes, '')) LIKE ?
			)
		 ORDER BY datetime(created_at) DESC, id DESC
		 LIMIT ?;`,
		userId,
		normalizedEntityType,
		normalizedEntityType,
		normalizedAction,
		normalizedAction,
		normalizedSearch,
		`%${normalizedSearch}%`,
		`%${normalizedSearch}%`,
		`%${normalizedSearch}%`,
		effectiveLimit
	).then((rows) =>
		(rows || []).map((row) => {
			let metadata = null;
			if (row.metadata_json) {
				try {
					metadata = JSON.parse(row.metadata_json);
				} catch {
					metadata = null;
				}
			}

			return {
				id: Number(row.id),
				user_id: Number(row.user_id),
				entity_type: row.entity_type || '',
				entity_id: row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
				action: row.action || '',
				metadata,
				notes: row.notes || null,
				created_at: row.created_at || null,
			};
		})
	);
};

export const getOrCreateDeviceId = async () => {
	const existing = await db.getFirstAsync(
		`SELECT device_id
		 FROM auth_device_profile
		 WHERE id = 1
		 LIMIT 1;`
	);

	const existingDeviceId = String(existing?.device_id || '').trim();
	if (existingDeviceId) {
		return existingDeviceId;
	}

	const nextDeviceId = generateLocalDeviceId();
	await db.runAsync(
		`INSERT INTO auth_device_profile (id, device_id, preferred_email, pin_enabled, created_at, updated_at)
		 VALUES (1, ?, NULL, 0, datetime('now'), datetime('now'))
		 ON CONFLICT(id)
		 DO UPDATE SET
			device_id = excluded.device_id,
			updated_at = datetime('now');`,
		nextDeviceId
	);

	return nextDeviceId;
};

export const getAuthDeviceProfile = async () => {
	const deviceId = await getOrCreateDeviceId();
	const row = await db.getFirstAsync(
		`SELECT preferred_email, pin_enabled, low_stock_notifications_enabled
		 FROM auth_device_profile
		 WHERE id = 1
		 LIMIT 1;`
	);

	return {
		deviceId,
		preferredEmail: String(row?.preferred_email || '').trim() || null,
		pinEnabled: Boolean(Number(row?.pin_enabled || 0)),
		lowStockNotificationsEnabled: Number(row?.low_stock_notifications_enabled ?? 1) !== 0,
	};
};

export const setAuthDeviceProfile = async ({ preferredEmail, pinEnabled, lowStockNotificationsEnabled } = {}) => {
	await getOrCreateDeviceId();

	const shouldUpdateEmail = preferredEmail !== undefined;
	const normalizedEmail = shouldUpdateEmail ? normalizeAuthEmail(preferredEmail) : null;
	const shouldUpdatePinEnabled = pinEnabled !== undefined;
	const shouldUpdateLowStock = lowStockNotificationsEnabled !== undefined;

	await db.runAsync(
		`UPDATE auth_device_profile
		 SET preferred_email = CASE
				WHEN ? = 1 THEN ?
				ELSE preferred_email
			END,
			pin_enabled = CASE
				WHEN ? = 1 THEN ?
				ELSE pin_enabled
			END,
			low_stock_notifications_enabled = CASE
				WHEN ? = 1 THEN ?
				ELSE low_stock_notifications_enabled
			END,
			updated_at = datetime('now')
		 WHERE id = 1;`,
		shouldUpdateEmail ? 1 : 0,
		normalizedEmail || null,
		shouldUpdatePinEnabled ? 1 : 0,
		shouldUpdatePinEnabled && pinEnabled ? 1 : 0,
		shouldUpdateLowStock ? 1 : 0,
		shouldUpdateLowStock && lowStockNotificationsEnabled ? 1 : 0
	);

	return getAuthDeviceProfile();
};

export const updateSessionTokens = async ({
	sessionToken,
	accessToken,
	refreshToken,
	accessTokenExpiresAt = null,
	refreshTokenExpiresAt = null,
	authMode = 'hybrid',
	serverStatus = 'ok',
	syncPending = false,
} = {}) => {
	const normalizedSessionToken = String(sessionToken || '').trim();
	if (!normalizedSessionToken) {
		throw new Error('sessionToken is required to update session tokens.');
	}

	const mode = authMode === 'online' || authMode === 'offline' ? authMode : 'hybrid';
	const nowIso = new Date().toISOString();

	const result = await db.runAsync(
		`UPDATE auth_sessions
		 SET access_token = ?,
			 refresh_token = ?,
			 access_expires_at = ?,
			 refresh_expires_at = ?,
			 auth_mode = ?,
			 last_server_check_at = ?,
			 last_server_status = ?,
			 server_sync_pending = ?
		 WHERE token = ?;`,
		accessToken ? String(accessToken) : null,
		refreshToken ? String(refreshToken) : null,
		accessTokenExpiresAt || null,
		refreshTokenExpiresAt || null,
		mode,
		nowIso,
		serverStatus || null,
		syncPending ? 1 : 0,
		normalizedSessionToken
	);

	if (!Number(result?.changes || 0)) {
		throw new Error('Session not found for token update.');
	}

	const row = await db.getFirstAsync(
		`SELECT token, expires_at, remember_me, access_token, refresh_token, access_expires_at, refresh_expires_at, auth_mode, last_server_check_at, last_server_status, server_sync_pending
		 FROM auth_sessions
		 WHERE token = ?
		 LIMIT 1;`,
		normalizedSessionToken
	);

	return sanitizeAuthSession(row);
};

export const updateSessionServerStatus = async ({ sessionToken, serverStatus = null } = {}) => {
	const normalizedSessionToken = String(sessionToken || '').trim();
	if (!normalizedSessionToken) {
		throw new Error('sessionToken is required to update session status.');
	}

	const result = await db.runAsync(
		`UPDATE auth_sessions
		 SET last_server_check_at = ?,
			 last_server_status = ?
		 WHERE token = ?;`,
		new Date().toISOString(),
		serverStatus,
		normalizedSessionToken
	);

	return Number(result?.changes || 0);
};

export const enqueuePendingSyncItem = async ({ entityType, operation, payload = null } = {}) => {
	const normalizedEntityType = String(entityType || '').trim();
	const normalizedOperation = String(operation || '').trim();

	if (!normalizedEntityType || !normalizedOperation) {
		throw new Error('entityType and operation are required for pending sync queue.');
	}

	const payloadJson = payload === null || payload === undefined ? null : JSON.stringify(payload);
	let scopedUserId = null;
	try {
		scopedUserId = await getActiveScopedUserId();
	} catch {
		scopedUserId = null;
	}

	const result = await db.runAsync(
		`INSERT INTO pending_sync_queue (user_id, entity_type, operation, payload_json)
		 VALUES (?, ?, ?, ?);`,
		scopedUserId,
		normalizedEntityType,
		normalizedOperation,
		payloadJson
	);

	return Number(result?.lastInsertRowId || 0);
};

export const getPendingSyncItems = async ({
	limit = 50,
	forCurrentUser = false,
	entityTypes = null,
	excludeEntityTypes = null,
} = {}) => {
	const normalizedLimit = Number(limit);
	const effectiveLimit = Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 50;
	const where = [];
	const params = [];

	if (forCurrentUser) {
		const userId = await getActiveScopedUserId();
		where.push(`(user_id IS NULL OR user_id = ?)`);
		params.push(userId);
	}

	if (Array.isArray(entityTypes) && entityTypes.length) {
		const normalizedEntityTypes = entityTypes.map((item) => String(item || '').trim()).filter(Boolean);
		if (normalizedEntityTypes.length) {
			where.push(`entity_type IN (${normalizedEntityTypes.map(() => '?').join(', ')})`);
			params.push(...normalizedEntityTypes);
		}
	}

	if (Array.isArray(excludeEntityTypes) && excludeEntityTypes.length) {
		const normalizedExcluded = excludeEntityTypes.map((item) => String(item || '').trim()).filter(Boolean);
		if (normalizedExcluded.length) {
			where.push(`entity_type NOT IN (${normalizedExcluded.map(() => '?').join(', ')})`);
			params.push(...normalizedExcluded);
		}
	}

	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

	const rows = await db.getAllAsync(
		`SELECT id, user_id, entity_type, operation, payload_json, attempts, last_error, created_at, updated_at
		 FROM pending_sync_queue
		 ${whereSql}
		 ORDER BY datetime(created_at) ASC, id ASC
		 LIMIT ?;`,
		...params,
		effectiveLimit
	);

	return rows.map((row) => {
		let payload = null;
		if (row.payload_json) {
			try {
				payload = JSON.parse(row.payload_json);
			} catch {
				payload = null;
			}
		}

		return {
			id: Number(row.id),
			user_id: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
			entity_type: String(row.entity_type || ''),
			operation: String(row.operation || ''),
			payload,
			attempts: Number(row.attempts || 0),
			last_error: row.last_error || null,
			created_at: row.created_at || null,
			updated_at: row.updated_at || null,
		};
	});
};

export const markPendingSyncItemDone = async (id) => {
	const normalizedId = Number(id);
	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		throw new Error('Valid pending sync id is required.');
	}

	const result = await db.runAsync(`DELETE FROM pending_sync_queue WHERE id = ?;`, normalizedId);
	return Number(result?.changes || 0);
};

export const markPendingSyncItemFailed = async ({ id, errorMessage = null } = {}) => {
	const normalizedId = Number(id);
	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		throw new Error('Valid pending sync id is required.');
	}

	const result = await db.runAsync(
		`UPDATE pending_sync_queue
		 SET attempts = COALESCE(attempts, 0) + 1,
			 last_error = ?,
			 updated_at = datetime('now')
		 WHERE id = ?;`,
		errorMessage ? String(errorMessage) : null,
		normalizedId
	);

	return Number(result?.changes || 0);
};

export const getLastSyncAt = async ({ userId = null } = {}) => {
	const effectiveUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : await getActiveScopedUserId();
	const row = await db.getFirstAsync(
		`SELECT last_sync_at
		 FROM sync_state
		 WHERE user_id = ?
		 LIMIT 1;`,
		effectiveUserId
	);

	return row?.last_sync_at || null;
};

export const setLastSyncAt = async ({ userId = null, lastSyncAt = null } = {}) => {
	const effectiveUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : await getActiveScopedUserId();
	const normalizedLastSyncAt = lastSyncAt ? String(lastSyncAt) : null;

	await db.runAsync(
		`INSERT INTO sync_state (user_id, last_sync_at, updated_at)
		 VALUES (?, ?, datetime('now'))
		 ON CONFLICT(user_id)
		 DO UPDATE SET
			last_sync_at = excluded.last_sync_at,
			updated_at = datetime('now');`,
		effectiveUserId,
		normalizedLastSyncAt
	);

	return normalizedLastSyncAt;
};

const SQLITE_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BACKUP_EXCLUDED_TABLES = new Set(['auth_sessions']);

const isSafeSqlIdentifier = (value) => SQLITE_IDENTIFIER_REGEX.test(String(value || ''));

const listBackupTableNames = async () => {
	const rows = await db.getAllAsync(
		`SELECT name
		 FROM sqlite_master
		 WHERE type = 'table'
			AND name NOT LIKE 'sqlite_%'
		 ORDER BY name ASC;`
	);

	return (rows || [])
		.map((row) => String(row?.name || '').trim())
		.filter((name) => isSafeSqlIdentifier(name))
		.filter((name) => !BACKUP_EXCLUDED_TABLES.has(name));
};

const getTableColumnsMeta = async (tableName) => {
	if (!isSafeSqlIdentifier(tableName)) {
		return [];
	}

	const rows = await db.getAllAsync(`PRAGMA table_info(${tableName});`);
	return Array.isArray(rows) ? rows : [];
};

export const createLocalBackupSnapshot = async ({ includeTables = null, includeGlobalTables = true } = {}) => {
	const userId = await getActiveScopedUserId();
	const allTables = await listBackupTableNames();
	const selectedSet = Array.isArray(includeTables) && includeTables.length
		? new Set(includeTables.map((row) => String(row || '').trim()).filter((row) => isSafeSqlIdentifier(row)))
		: null;

	const tables = {};
	const meta = {};

	for (const tableName of allTables) {
		if (selectedSet && !selectedSet.has(tableName)) {
			continue;
		}

		const columnMeta = await getTableColumnsMeta(tableName);
		const columnNames = columnMeta.map((row) => String(row?.name || '').trim()).filter(Boolean);
		const hasUserId = columnNames.includes('user_id');

		let rows = [];
		if (hasUserId) {
			rows = await db.getAllAsync(`SELECT * FROM ${tableName} WHERE user_id = ?;`, userId);
		} else if (tableName === 'users') {
			rows = await db.getAllAsync(`SELECT * FROM users WHERE id = ?;`, userId);
		} else if (includeGlobalTables) {
			rows = await db.getAllAsync(`SELECT * FROM ${tableName};`);
		}

		tables[tableName] = Array.isArray(rows) ? rows : [];
		meta[tableName] = {
			columns: columnNames,
			hasUserId,
			rows: Array.isArray(rows) ? rows.length : 0,
		};
	}

	const snapshot = {
		schemaVersion: 'local-sqlite-v1',
		generatedAt: new Date().toISOString(),
		userId,
		meta,
		tables,
	};

	const serialized = JSON.stringify(snapshot);

	return {
		snapshot,
		sizeBytes: serialized.length,
		tablesCount: Object.keys(tables).length,
	};
};

export const restoreLocalBackupSnapshot = async ({ snapshot, strategy = 'replace' } = {}) => {
	if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		throw new Error('A valid snapshot object is required for restore.');
	}

	const tables = snapshot.tables;
	if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
		throw new Error('Snapshot must include a tables object.');
	}

	const userId = await getActiveScopedUserId();
	const normalizedStrategy = String(strategy || 'replace').trim().toLowerCase() === 'merge' ? 'merge' : 'replace';
	const tableNames = Object.keys(tables).filter((name) => isSafeSqlIdentifier(name));
	const restored = [];

	await db.execAsync('PRAGMA foreign_keys = OFF;');
	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		for (const tableName of tableNames) {
			const rawRows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
			const columnMeta = await getTableColumnsMeta(tableName);
			const columnNames = columnMeta.map((row) => String(row?.name || '').trim()).filter(Boolean);
			if (!columnNames.length) {
				continue;
			}

			const hasUserId = columnNames.includes('user_id');

			if (normalizedStrategy === 'replace') {
				if (hasUserId) {
					await db.runAsync(`DELETE FROM ${tableName} WHERE user_id = ?;`, userId);
				} else if (tableName === 'users') {
					await db.runAsync(`DELETE FROM users WHERE id = ?;`, userId);
				} else {
					await db.execAsync(`DELETE FROM ${tableName};`);
				}
			}

			let inserted = 0;
			for (const row of rawRows) {
				if (!row || typeof row !== 'object' || Array.isArray(row)) {
					continue;
				}

				const filteredColumns = columnNames.filter((columnName) => Object.prototype.hasOwnProperty.call(row, columnName));
				if (!filteredColumns.length) {
					continue;
				}

				const values = filteredColumns.map((columnName) => {
					if (hasUserId && columnName === 'user_id') {
						return userId;
					}

					if (tableName === 'users' && columnName === 'id') {
						return userId;
					}

					return row[columnName];
				});

				const placeholders = filteredColumns.map(() => '?').join(', ');
				await db.runAsync(
					`INSERT OR REPLACE INTO ${tableName} (${filteredColumns.join(', ')}) VALUES (${placeholders});`,
					...values
				);
				inserted += 1;
			}

			restored.push({
				table: tableName,
				inserted,
				hasUserId,
			});
		}

		await db.execAsync('COMMIT;');
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	} finally {
		await db.execAsync('PRAGMA foreign_keys = ON;');
	}

	return {
		restoredAt: new Date().toISOString(),
		strategy: normalizedStrategy,
		tables: restored,
	};
};

const normalizeServerUserPayload = (userPayload) => {
	const email = normalizeAuthEmail(userPayload?.email);
	if (!email) {
		throw new Error('Authenticated server user email is required.');
	}

	return {
		email,
		name: String(userPayload?.name || '').trim() || null,
		profileImageUri: String(
			userPayload?.profile_image_uri
			|| userPayload?.profileImageUri
			|| userPayload?.profileImageUrl
			|| ''
		).trim() || null,
		createdAt: userPayload?.createdAt ? String(userPayload.createdAt) : null,
	};
};

export const saveAuthenticatedUserSession = async ({
	user,
	rememberMe = false,
	serverTokens = null,
	authMode = 'hybrid',
	serverStatus = 'ok',
	syncPending = false,
} = {}) => {
	const normalizedUser = normalizeServerUserPayload(user || {});

	const existing = await db.getFirstAsync(
		`SELECT id FROM users WHERE email = ? LIMIT 1;`,
		normalizedUser.email
	);

	let userId = Number(existing?.id || 0);
	if (!Number.isInteger(userId) || userId <= 0) {
		const inserted = await db.runAsync(
			`INSERT INTO users (email, name, profile_image_uri, created_at, updated_at, last_login_at)
			 VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), datetime('now'), datetime('now'));`,
			normalizedUser.email,
			normalizedUser.name,
			normalizedUser.profileImageUri,
			normalizedUser.createdAt
		);
		userId = Number(inserted?.lastInsertRowId || 0);
	}

	if (!Number.isInteger(userId) || userId <= 0) {
		throw new Error('Unable to persist authenticated user session.');
	}

	await db.runAsync(
		`UPDATE users
		 SET email = ?,
			 name = ?,
			 profile_image_uri = ?,
			 updated_at = datetime('now'),
			 last_login_at = datetime('now')
		 WHERE id = ?;`,
		normalizedUser.email,
		normalizedUser.name,
		normalizedUser.profileImageUri,
		userId
	);

	await db.runAsync(`DELETE FROM auth_sessions WHERE user_id = ?;`, userId);

	const nextAuthMode = serverTokens?.accessToken ? authMode : 'offline';
	const session = await createSessionForUser({
		userId,
		email: normalizedUser.email,
		rememberMe,
		serverTokens,
		authMode: nextAuthMode,
		syncPending,
	});

	await updateSessionServerStatus({
		sessionToken: session.token,
		serverStatus,
	});

	await setAuthDeviceProfile({
		preferredEmail: normalizedUser.email,
	});

	const userRow = await db.getFirstAsync(
		`SELECT id, email, name, profile_image_uri, created_at, updated_at, last_login_at
		 FROM users
		 WHERE id = ?
		 LIMIT 1;`,
		userId
	);

	return {
		user: sanitizeAuthUser(userRow),
		session,
	};
};

export const getCurrentUser = async () => {
	await cleanupExpiredSessions();

	const row = await db.getFirstAsync(
		`SELECT
			u.id,
			u.email,
			u.name,
			u.profile_image_uri,
			u.created_at,
			u.updated_at,
			u.last_login_at,
			s.token,
			s.expires_at,
			s.remember_me,
			s.access_token,
			s.refresh_token,
			s.access_expires_at,
			s.refresh_expires_at,
			s.auth_mode,
			s.last_server_check_at,
			s.last_server_status,
			s.server_sync_pending
		 FROM auth_sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.revoked_at IS NULL
			AND datetime(s.expires_at) > datetime('now')
		 ORDER BY datetime(s.created_at) DESC, s.id DESC
		 LIMIT 1;`
	);

	if (!row) {
		return null;
	}

	return {
		user: sanitizeAuthUser(row),
		session: sanitizeAuthSession(row),
	};
};

export const updateAuthenticatedUserProfileLocal = async ({ userId, name, profileImageUri } = {}) => {
	const normalizedUserId = Number(userId);
	if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
		throw new Error('Valid userId is required to update profile.');
	}

	const normalizedName = String(name || '').trim() || null;
	const normalizedProfileImageUri = String(profileImageUri || '').trim() || null;

	await db.runAsync(
		`UPDATE users
		 SET name = ?,
			 profile_image_uri = ?,
			 updated_at = datetime('now')
		 WHERE id = ?;`,
		normalizedName,
		normalizedProfileImageUri,
		normalizedUserId
	);

	const row = await db.getFirstAsync(
		`SELECT id, email, name, profile_image_uri, created_at, updated_at, last_login_at
		 FROM users
		 WHERE id = ?
		 LIMIT 1;`,
		normalizedUserId
	);

	return sanitizeAuthUser(row);
};

export const logoutCurrentUser = async ({ sessionToken } = {}) => {
	await cleanupExpiredSessions();
	const normalizedSessionToken = String(sessionToken || '').trim();

	if (normalizedSessionToken) {
		const directResult = await db.runAsync(`DELETE FROM auth_sessions WHERE token = ?;`, normalizedSessionToken);
		return {
			success: true,
			cleared: Number(directResult?.changes || 0),
		};
	}

	const latest = await db.getFirstAsync(
		`SELECT id
		 FROM auth_sessions
		 WHERE revoked_at IS NULL
		 ORDER BY datetime(created_at) DESC, id DESC
		 LIMIT 1;`
	);

	if (!latest?.id) {
		return { success: true, cleared: 0 };
	}

	const result = await db.runAsync(`DELETE FROM auth_sessions WHERE id = ?;`, Number(latest.id));

	return {
		success: true,
		cleared: Number(result?.changes || 0),
	};
};

export const insertProduct = ({ name, quantity, price, expiryDate = null, lowStockThreshold = 5 }) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const syncUpdatedAt = new Date().toISOString();
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedQuantity = Number(quantity);
	const normalizedPrice = Number(price);
	const normalizedLowStockThreshold = Number(lowStockThreshold);
	const normalizedExpiryDate = normalizeExpiryDate(expiryDate);

	if (!normalizedName) {
		return Promise.reject(new Error('Product name is required.'));
	}

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
		return Promise.reject(new Error('Quantity must be a non-negative integer.'));
	}

	if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
		return Promise.reject(new Error('Price must be a non-negative number.'));
	}

	if (!Number.isInteger(normalizedLowStockThreshold) || normalizedLowStockThreshold < 0) {
		return Promise.reject(new Error('Low stock threshold must be a non-negative integer.'));
	}

		const result = await db.runAsync(
			`INSERT INTO products (
				user_id,
				name,
				quantity,
				price,
				expiry_date,
				low_stock_threshold,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at
			)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
			userId,
			normalizedName,
			normalizedQuantity,
			normalizedPrice,
			normalizedExpiryDate,
			normalizedLowStockThreshold,
			null,
			1,
			syncUpdatedAt
		);

		const localId = Number(result.lastInsertRowId);
		const clientRefId = buildLocalClientRefId({ entityType: 'product', localId });
		await db.runAsync(`UPDATE products SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

		await enqueueEntitySyncChange({
			entityType: 'product',
			operation: 'upsert',
			localId,
			clientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				name: normalizedName,
				quantity: normalizedQuantity,
				price: normalizedPrice,
				lowStockThreshold: normalizedLowStockThreshold,
				expiryDate: normalizedExpiryDate,
				deletedAt: null,
			},
		});

		void logAudit({
			userId,
			entityType: 'product',
			entityId: result.lastInsertRowId,
			action: 'create',
			metadata: {
				new: {
					name: normalizedName,
					quantity: normalizedQuantity,
					price: normalizedPrice,
					expiry_date: normalizedExpiryDate,
					low_stock_threshold: normalizedLowStockThreshold,
				},
			},
			notes: 'Product created',
		});

		return {
			id: localId,
			name: normalizedName,
			quantity: normalizedQuantity,
			price: normalizedPrice,
			expiry_date: normalizedExpiryDate,
			low_stock_threshold: normalizedLowStockThreshold,
		};
	};

	return run();
};

export const updateProduct = async ({ id, name, quantity, price, expiryDate = null, lowStockThreshold = 5 }) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();
	const normalizedId = Number(id);
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedPrice = Number(price);
	const normalizedLowStockThreshold = Number(lowStockThreshold);
	const normalizedExpiryDate = normalizeExpiryDate(expiryDate);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid product id is required.'));
	}

	if (!normalizedName) {
		return Promise.reject(new Error('Product name is required.'));
	}

	if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
		throw new Error('Price must be a non-negative number.');
	}

	if (!Number.isInteger(normalizedLowStockThreshold) || normalizedLowStockThreshold < 0) {
		throw new Error('Low stock threshold must be a non-negative integer.');
	}

	const existing = await db.getFirstAsync(
		`SELECT quantity, name, price, expiry_date, low_stock_threshold, client_ref_id, server_id, sync_version
		 FROM products
		 WHERE id = ? AND user_id = ?;`,
		normalizedId,
		userId
	);
	if (!existing) {
		throw new Error('Product not found.');
	}

	const currentQuantity = Number(existing.quantity);
	const normalizedQuantity =
		quantity === undefined || quantity === null || quantity === ''
			? currentQuantity
			: Number(quantity);

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
		throw new Error('Quantity must be a non-negative integer.');
	}

	const nextSyncVersion = Number(existing.sync_version || 0) + 1;
	const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'product', localId: normalizedId });

	return db
		.runAsync(
			`UPDATE products
			 SET name = ?,
				 quantity = ?,
				 price = ?,
				 expiry_date = ?,
				 low_stock_threshold = ?,
				 client_ref_id = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 deleted_at = NULL
			 WHERE id = ? AND user_id = ?;`,
			normalizedName,
			normalizedQuantity,
			normalizedPrice,
			normalizedExpiryDate,
			normalizedLowStockThreshold,
			clientRefId,
			nextSyncVersion,
			syncUpdatedAt,
			normalizedId,
			userId
		)
		.then(async (result) => {
			if (!result.changes) {
				throw new Error('Product not found.');
			}

			await enqueueEntitySyncChange({
				entityType: 'product',
				operation: 'upsert',
				localId: normalizedId,
				clientRefId,
				serverId: existing.server_id || null,
				version: nextSyncVersion,
				updatedAt: syncUpdatedAt,
				data: {
					name: normalizedName,
					quantity: normalizedQuantity,
					price: normalizedPrice,
					lowStockThreshold: normalizedLowStockThreshold,
					expiryDate: normalizedExpiryDate,
					deletedAt: null,
				},
			});

			return {
				id: normalizedId,
				name: normalizedName,
				quantity: normalizedQuantity,
				price: normalizedPrice,
				expiry_date: normalizedExpiryDate,
				low_stock_threshold: normalizedLowStockThreshold,
			};
		});
};

export const deleteProduct = (id) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const syncUpdatedAt = new Date().toISOString();
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid product id is required.'));
	}

		const existing = await db.getFirstAsync(
			`SELECT id, server_id, client_ref_id, sync_version FROM products WHERE id = ? AND user_id = ?;`,
			normalizedId,
			userId
		);

		if (!existing) {
			throw new Error('Product not found.');
		}

		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'product', localId: normalizedId });
		const nextSyncVersion = Number(existing.sync_version || 0) + 1;

		return db.runAsync(`DELETE FROM products WHERE id = ? AND user_id = ?;`, normalizedId, userId).then(async (result) => {
		if (!result.changes) {
			throw new Error('Product not found.');
		}

		await enqueueEntitySyncChange({
			entityType: 'product',
			operation: 'delete',
			localId: normalizedId,
			clientRefId,
			serverId: existing.server_id || null,
			version: nextSyncVersion,
			updatedAt: syncUpdatedAt,
			data: {
				deletedAt: syncUpdatedAt,
			},
		});

		void logAudit({
			userId,
			entityType: 'product',
			entityId: normalizedId,
			action: 'delete',
			notes: 'Product deleted',
		});

		return { id: normalizedId };
	});
	};

	return run();
};

export const getProducts = () =>
	getActiveScopedUserId().then((userId) =>
		db.getAllAsync(
			`SELECT id, name, quantity, price, expiry_date, low_stock_threshold, created_at
			 FROM products
			 WHERE user_id = ?
			 ORDER BY id DESC;`,
			userId
		)
	);

export const fetchProducts = () => getProducts();

export const getExpiringSoonProducts = async (days = 7) => {
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) >= 0 ? Number(days) : 7;
	const products = await getProducts();

	const todayUtc = toUtcStartOfDay(new Date());
	const lastDayUtc = todayUtc + normalizedDays * 24 * 60 * 60 * 1000;

	return products
		.filter((product) => {
			if (!product.expiry_date) {
				return false;
			}

			const expiryUtc = toUtcStartOfDay(product.expiry_date);
			if (expiryUtc === null) {
				return false;
			}

			return expiryUtc >= todayUtc && expiryUtc <= lastDayUtc;
		})
		.sort((a, b) => {
			const aUtc = toUtcStartOfDay(a.expiry_date) ?? Number.MAX_SAFE_INTEGER;
			const bUtc = toUtcStartOfDay(b.expiry_date) ?? Number.MAX_SAFE_INTEGER;
			return aUtc - bUtc;
		});
};

export const getExpiredProducts = async () => {
	const products = await getProducts();
	const todayUtc = toUtcStartOfDay(new Date());

	return products
		.filter((product) => {
			if (!product.expiry_date) {
				return false;
			}

			const expiryUtc = toUtcStartOfDay(product.expiry_date);
			if (expiryUtc === null) {
				return false;
			}

			return expiryUtc < todayUtc;
		})
		.sort((a, b) => {
			const aUtc = toUtcStartOfDay(a.expiry_date) ?? Number.MAX_SAFE_INTEGER;
			const bUtc = toUtcStartOfDay(b.expiry_date) ?? Number.MAX_SAFE_INTEGER;
			return aUtc - bUtc;
		});
};

export const getLowStockProducts = async () => {
	const products = await getProducts();

	return products
		.filter((product) => {
			const quantity = Number(product.quantity);
			const thresholdRaw = Number(product.low_stock_threshold);

			if (!Number.isFinite(quantity)) {
				return false;
			}

			const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.trunc(thresholdRaw)) : 5;
			return quantity <= threshold;
		})
		.sort((a, b) => Number(a.quantity) - Number(b.quantity));
};

export const getInventoryBatches = async ({
	productId = null,
	includeDepleted = false,
	limit = 300,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 300;
	const normalizedProductId = Number(productId);
	const where = ['b.user_id = ?'];
	const params = [userId];

	if (!includeDepleted) {
		where.push('b.quantity > 0');
	}

	if (Number.isInteger(normalizedProductId) && normalizedProductId > 0) {
		where.push('b.product_id = ?');
		params.push(normalizedProductId);
	}

	const rows = await db.getAllAsync(
		`SELECT
			b.id,
			b.product_id,
			p.name AS product_name,
			b.batch_number,
			b.quantity,
			b.expiry_date,
			b.purchase_date,
			b.cost_price_cents,
			b.server_id,
			b.client_ref_id,
			b.updated_at
		 FROM inventory_batches b
		 JOIN products p ON p.id = b.product_id
		 WHERE ${where.join(' AND ')}
		 ORDER BY
			CASE
				WHEN b.expiry_date IS NULL OR trim(b.expiry_date) = '' THEN 1
				ELSE 0
			END ASC,
			datetime(b.expiry_date) ASC,
			datetime(b.purchase_date) ASC,
			b.id ASC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		product_id: Number(row.product_id),
		product_name: String(row.product_name || ''),
		batch_number: row.batch_number || null,
		quantity: Number(row.quantity || 0),
		expiry_date: row.expiry_date || null,
		purchase_date: row.purchase_date || null,
		cost_price: fromMoneyCents(Number(row.cost_price_cents || 0)),
		server_id: row.server_id || null,
		client_ref_id: row.client_ref_id || null,
		updated_at: row.updated_at || null,
	}));
};

export const selectBatchForSale = async (productId) => {
	const userId = await getActiveScopedUserId();
	const normalizedProductId = Number(productId);

	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		throw new Error('Valid productId is required.');
	}

	const rows = await loadOpenBatchesForProductTx({
		userId,
		productId: normalizedProductId,
	});

	const first = rows?.[0] || null;
	if (!first) {
		return null;
	}

	return {
		id: Number(first.id),
		product_id: normalizedProductId,
		batch_number: first.batch_number || null,
		quantity: Number(first.quantity || 0),
		expiry_date: first.expiry_date || null,
		purchase_date: first.purchase_date || null,
		cost_price: fromMoneyCents(Number(first.cost_price_cents || 0)),
	};
};

export const validateInventoryBatchConsistency = async ({ productId = null } = {}) => {
	const userId = await getActiveScopedUserId();
	return validateInventoryBatchConsistencyTx({ userId, productId });
};

export const getDeadStockProducts = async ({
	thresholdDays = DEFAULT_DEAD_STOCK_DAYS,
	limit = 200,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedDays = Number.isInteger(Number(thresholdDays)) && Number(thresholdDays) > 0
		? Number(thresholdDays)
		: DEFAULT_DEAD_STOCK_DAYS;
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;

	const rows = await db.getAllAsync(
		`WITH sales AS (
			SELECT
				si.product_id,
				MAX(sh.timestamp) AS last_sale_at
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			WHERE sh.user_id = ?
				AND sh.deleted_at IS NULL
				AND sh.status = 'posted'
			GROUP BY si.product_id
		)
		SELECT
			p.id,
			p.name,
			p.quantity,
			p.low_stock_threshold,
			s.last_sale_at,
			CAST((julianday('now') - julianday(s.last_sale_at)) AS INTEGER) AS days_since_sale
		FROM products p
		LEFT JOIN sales s ON s.product_id = p.id
		WHERE p.user_id = ?
			AND p.deleted_at IS NULL
			AND p.quantity > 0
			AND (
				s.last_sale_at IS NULL
				OR (julianday('now') - julianday(s.last_sale_at)) >= ?
			)
		ORDER BY
			CASE WHEN s.last_sale_at IS NULL THEN 0 ELSE 1 END ASC,
			datetime(s.last_sale_at) ASC,
			p.id ASC
		LIMIT ?;`,
		userId,
		userId,
		normalizedDays,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		name: String(row.name || ''),
		quantity: Number(row.quantity || 0),
		low_stock_threshold: Number(row.low_stock_threshold || 0),
		last_sale_date: row.last_sale_at || null,
		days_since_sale: row.last_sale_at ? Number(row.days_since_sale || 0) : null,
		dead_stock_flag: 1,
	}));
};

export const getInventoryAlerts = async ({
	alertType = null,
	severity = null,
	activeOnly = true,
	limit = 200,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedType = alertType ? normalizeAlertType(alertType) : null;
	const normalizedSeverity = severity ? normalizeAlertSeverity(severity) : null;
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;

	const where = ['a.user_id = ?'];
	const params = [userId];

	if (activeOnly) {
		where.push('a.is_active = 1');
	}

	if (normalizedType) {
		where.push('a.alert_type = ?');
		params.push(normalizedType);
	}

	if (normalizedSeverity) {
		where.push('a.severity = ?');
		params.push(normalizedSeverity);
	}

	const rows = await db.getAllAsync(
		`SELECT
			a.id,
			a.product_id,
			p.name AS product_name,
			a.alert_type,
			a.message,
			a.severity,
			a.is_active,
			a.resolved_at,
			a.created_at,
			a.updated_at
		 FROM alerts a
		 JOIN products p ON p.id = a.product_id
		 WHERE ${where.join(' AND ')}
		 ORDER BY
			CASE a.severity
				WHEN 'critical' THEN 4
				WHEN 'high' THEN 3
				WHEN 'medium' THEN 2
				ELSE 1
			END DESC,
			datetime(a.updated_at) DESC,
			a.id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		product_id: Number(row.product_id),
		product_name: String(row.product_name || ''),
		alert_type: String(row.alert_type || ''),
		message: String(row.message || ''),
		severity: String(row.severity || 'low'),
		is_active: Boolean(Number(row.is_active || 0)),
		resolved_at: row.resolved_at || null,
		created_at: row.created_at || null,
		updated_at: row.updated_at || null,
	}));
};

export const refreshInventoryAlerts = async ({
	expiryAlertDays = DEFAULT_EXPIRY_ALERT_DAYS,
	deadStockDays = DEFAULT_DEAD_STOCK_DAYS,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
	try {
		await refreshInventoryAlertsTx({
			userId,
			syncUpdatedAt,
			expiryAlertDays,
			deadStockDays,
		});
		await db.execAsync('COMMIT;');
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}

	return getInventoryAlerts({ activeOnly: true, limit: 300 });
};

export const getInventoryHealthInsights = async ({
	lookbackDays = 30,
	expiryAlertDays = DEFAULT_EXPIRY_ALERT_DAYS,
	deadStockDays = DEFAULT_DEAD_STOCK_DAYS,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLookbackDays = Number.isInteger(Number(lookbackDays)) && Number(lookbackDays) > 0
		? Number(lookbackDays)
		: 30;
	const normalizedExpiryDays = Number.isInteger(Number(expiryAlertDays)) && Number(expiryAlertDays) >= 0
		? Number(expiryAlertDays)
		: DEFAULT_EXPIRY_ALERT_DAYS;
	const normalizedDeadDays = Number.isInteger(Number(deadStockDays)) && Number(deadStockDays) > 0
		? Number(deadStockDays)
		: DEFAULT_DEAD_STOCK_DAYS;

	const products = await db.getAllAsync(
		`SELECT id, name, quantity, low_stock_threshold
		 FROM products
		 WHERE user_id = ?
			AND deleted_at IS NULL
		 ORDER BY name ASC, id ASC;`,
		userId
	);

	const salesRows = await db.getAllAsync(
		`SELECT
			si.product_id,
			MAX(sh.timestamp) AS last_sale_at,
			COALESCE(SUM(
				CASE
					WHEN datetime(sh.timestamp) >= datetime('now', ?) THEN si.quantity
					ELSE 0
				END
			), 0) AS units_sold
		 FROM sales_items si
		 JOIN sales_header sh ON sh.id = si.sales_header_id
		 WHERE sh.user_id = ?
			AND sh.deleted_at IS NULL
			AND sh.status = 'posted'
		 GROUP BY si.product_id;`,
		`-${normalizedLookbackDays} days`,
		userId
	);

	const batchRows = await db.getAllAsync(
		`SELECT
			product_id,
			COALESCE(SUM(quantity), 0) AS total_batch_qty,
			COALESCE(SUM(CASE
				WHEN expiry_date IS NOT NULL
					AND datetime(expiry_date) <= datetime('now', ?)
				THEN quantity
				ELSE 0
			END), 0) AS expiring_qty
		 FROM inventory_batches
		 WHERE user_id = ?
			AND deleted_at IS NULL
		 GROUP BY product_id;`,
		`+${normalizedExpiryDays} days`,
		userId
	);

	const salesMap = new Map((salesRows || []).map((row) => [Number(row.product_id), row]));
	const batchMap = new Map((batchRows || []).map((row) => [Number(row.product_id), row]));

	const rows = (products || []).map((product) => {
		const productId = Number(product.id);
		const quantity = Number(product.quantity || 0);
		const threshold = Math.max(0, Number(product.low_stock_threshold || 0));
		const sales = salesMap.get(productId);
		const batches = batchMap.get(productId);
		const unitsSold = Math.max(0, Number(sales?.units_sold || 0));
		const avgDailyDemand = unitsSold / normalizedLookbackDays;
		const averageInventory = Math.max(quantity + unitsSold / 2, 0);
		const turnoverRate = averageInventory > 0 ? unitsSold / averageInventory : 0;
		const daysOfInventory = avgDailyDemand > 0 ? quantity / avgDailyDemand : null;
		const totalBatchQty = Math.max(0, Number(batches?.total_batch_qty || 0));
		const expiringQty = Math.max(0, Number(batches?.expiring_qty || 0));
		const expiryRiskScore = totalBatchQty > 0 ? (expiringQty / totalBatchQty) * 100 : 0;

		let deadStockFlag = 0;
		const lastSaleDate = sales?.last_sale_at ? new Date(sales.last_sale_at) : null;
		if (quantity > 0) {
			if (!(lastSaleDate instanceof Date) || Number.isNaN(lastSaleDate.getTime())) {
				deadStockFlag = 1;
			} else {
				const ageMs = Date.now() - lastSaleDate.getTime();
				deadStockFlag = ageMs >= normalizedDeadDays * 24 * 60 * 60 * 1000 ? 1 : 0;
			}
		}

		const demandCapacity = Math.max(
			threshold * 4,
			Math.ceil(avgDailyDemand * OVERSTOCK_COVERAGE_DAYS)
		);

		return {
			product_id: productId,
			product_name: String(product.name || ''),
			quantity,
			units_sold: unitsSold,
			stock_turnover_rate: Number(turnoverRate.toFixed(4)),
			days_of_inventory: daysOfInventory === null ? null : Number(daysOfInventory.toFixed(2)),
			expiry_risk_score: Number(expiryRiskScore.toFixed(2)),
			expiring_qty: expiringQty,
			total_batch_qty: totalBatchQty,
			demand_capacity: demandCapacity,
			overstock_flag: demandCapacity > 0 && quantity > demandCapacity,
			dead_stock_flag: deadStockFlag,
			last_sale_date: sales?.last_sale_at || null,
		};
	});

	const summary = {
		products: rows.length,
		average_turnover_rate: rows.length
			? Number((rows.reduce((sum, row) => sum + Number(row.stock_turnover_rate || 0), 0) / rows.length).toFixed(4))
			: 0,
		average_expiry_risk_score: rows.length
			? Number((rows.reduce((sum, row) => sum + Number(row.expiry_risk_score || 0), 0) / rows.length).toFixed(2))
			: 0,
		dead_stock_count: rows.filter((row) => row.dead_stock_flag === 1).length,
		low_stock_count: rows.filter((row) => Number(row.quantity) <= Number(products.find((p) => Number(p.id) === Number(row.product_id))?.low_stock_threshold || 0)).length,
		overstock_count: rows.filter((row) => row.overstock_flag).length,
	};

	return {
		summary,
		rows,
	};
};

export const getCycleCounts = async ({ productId = null, limit = 120 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 120;
	const normalizedProductId = Number(productId);
	const where = ['cc.user_id = ?'];
	const params = [userId];

	if (Number.isInteger(normalizedProductId) && normalizedProductId > 0) {
		where.push('cc.product_id = ?');
		params.push(normalizedProductId);
	}

	const rows = await db.getAllAsync(
		`SELECT
			cc.id,
			cc.product_id,
			p.name AS product_name,
			cc.system_quantity,
			cc.physical_quantity,
			cc.variance,
			cc.timestamp,
			cc.note,
			cc.created_at
		 FROM cycle_counts cc
		 JOIN products p ON p.id = cc.product_id
		 WHERE ${where.join(' AND ')}
		 ORDER BY datetime(cc.timestamp) DESC, cc.id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		product_id: Number(row.product_id),
		product_name: String(row.product_name || ''),
		system_quantity: Number(row.system_quantity || 0),
		physical_quantity: Number(row.physical_quantity || 0),
		variance: Number(row.variance || 0),
		timestamp: row.timestamp || row.created_at || null,
		note: row.note || null,
	}));
};

export const fetchCycleCounts = (options = {}) => getCycleCounts(options);

export const recordCycleCount = async ({
	productId,
	physicalQuantity,
	note = null,
	timestamp = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedProductId = Number(productId);
	const normalizedPhysicalQuantity = Number(physicalQuantity);
	const countedAt = timestamp ? new Date(timestamp) : new Date();

	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		throw new Error('Valid productId is required.');
	}

	if (!Number.isInteger(normalizedPhysicalQuantity) || normalizedPhysicalQuantity < 0) {
		throw new Error('physicalQuantity must be a non-negative integer.');
	}

	if (Number.isNaN(countedAt.getTime())) {
		throw new Error('timestamp is invalid.');
	}

	const countedAtIso = countedAt.toISOString();

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
	try {
		const product = await db.getFirstAsync(
			`SELECT id, name, quantity, price, low_stock_threshold, expiry_date, server_id, client_ref_id, sync_version
			 FROM products
			 WHERE id = ? AND user_id = ?
			 LIMIT 1;`,
			normalizedProductId,
			userId
		);

		if (!product) {
			throw new Error('Product not found for cycle count.');
		}

		const systemQuantity = Number(product.quantity || 0);
		const variance = normalizedPhysicalQuantity - systemQuantity;

		const cycleInsert = await db.runAsync(
			`INSERT INTO cycle_counts (
				user_id,
				product_id,
				system_quantity,
				physical_quantity,
				variance,
				timestamp,
				note,
				server_id,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, NULL, ?);`,
			userId,
			normalizedProductId,
			systemQuantity,
			normalizedPhysicalQuantity,
			variance,
			countedAtIso,
			typeof note === 'string' ? note.trim() : null,
			countedAtIso,
			countedAtIso
		);

		const cycleCountId = Number(cycleInsert.lastInsertRowId);
		const cycleCountClientRefId = buildLocalClientRefId({ entityType: 'cycle_count', localId: cycleCountId });
		await db.runAsync(
			`UPDATE cycle_counts SET client_ref_id = ? WHERE id = ? AND user_id = ?;`,
			cycleCountClientRefId,
			cycleCountId,
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'cycle_count',
			operation: 'upsert',
			localId: cycleCountId,
			clientRefId: cycleCountClientRefId,
			version: 1,
			updatedAt: countedAtIso,
			data: {
				productId: normalizedProductId,
				productServerId: product.server_id || null,
				productClientRefId: product.client_ref_id || buildLocalClientRefId({ entityType: 'product', localId: normalizedProductId }),
				systemQuantity,
				physicalQuantity: normalizedPhysicalQuantity,
				variance,
				timestamp: countedAtIso,
				note: typeof note === 'string' ? note.trim() : null,
				deletedAt: null,
			},
		});

		let movementId = null;
		if (variance !== 0) {
			await db.runAsync(
				`UPDATE products
				 SET quantity = ?,
					 sync_version = COALESCE(sync_version, 0) + 1,
					 sync_updated_at = ?
				 WHERE id = ? AND user_id = ?;`,
				normalizedPhysicalQuantity,
				countedAtIso,
				normalizedProductId,
				userId
			);

			const productSyncRow = await db.getFirstAsync(
				`SELECT sync_version, server_id, quantity, price, low_stock_threshold, expiry_date, name
				 FROM products
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				normalizedProductId,
				userId
			);

			const movementInsert = await db.runAsync(
				`INSERT INTO stock_movements (
					user_id,
					product_id,
					movement_type,
					stock_out_reason,
					quantity_delta,
					quantity_before,
					quantity_after,
					source_event_type,
					source_event_id,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, 'adjust', NULL, ?, ?, ?, 'cycle_count', ?, ?, NULL, 1, ?, NULL, ?);`,
				userId,
				normalizedProductId,
				variance,
				systemQuantity,
				normalizedPhysicalQuantity,
				cycleCountId,
				typeof note === 'string' && note.trim() ? note.trim() : 'Cycle count adjustment',
				countedAtIso,
				countedAtIso
			);

			movementId = Number(movementInsert.lastInsertRowId);
			const movementClientRefId = buildLocalClientRefId({ entityType: 'inventory_movement', localId: movementId });
			await db.runAsync(`UPDATE stock_movements SET client_ref_id = ? WHERE id = ?;`, movementClientRefId, movementId);

			await enqueueEntitySyncChange({
				entityType: 'inventory_movement',
				operation: 'upsert',
				localId: movementId,
				clientRefId: movementClientRefId,
				version: 1,
				updatedAt: countedAtIso,
				data: {
					movementType: 'adjust',
					stockOutReason: null,
					quantityDelta: variance,
					quantityBefore: systemQuantity,
					quantityAfter: normalizedPhysicalQuantity,
					note: typeof note === 'string' && note.trim() ? note.trim() : 'Cycle count adjustment',
					sourceEventType: 'cycle_count',
					sourceEventId: cycleCountId,
					sourceEventClientRefId: cycleCountClientRefId,
					productId: normalizedProductId,
					productServerId: product.server_id || null,
					productClientRefId: product.client_ref_id || buildLocalClientRefId({ entityType: 'product', localId: normalizedProductId }),
					occurredAt: countedAtIso,
					deletedAt: null,
				},
			});

			if (variance < 0) {
				await consumeInventoryBatchesTx({
					userId,
					productId: normalizedProductId,
					quantity: Math.abs(variance),
					syncUpdatedAt: countedAtIso,
					sourceEventType: 'cycle_count',
					sourceEventId: cycleCountId,
					sourceEventClientRefId: cycleCountClientRefId,
				});
			} else {
				await createInventoryBatchTx({
					userId,
					productId: normalizedProductId,
					quantity: variance,
					batchNumber: buildInventoryBatchNumber({ productId: normalizedProductId, prefix: 'CYCLE' }),
					expiryDate: product.expiry_date || null,
					purchaseDate: countedAtIso,
					costPriceCents: toMoneyCents(productSyncRow?.price || product.price || 0) || 0,
					syncUpdatedAt: countedAtIso,
					sourceEventType: 'cycle_count',
					sourceEventId: cycleCountId,
					sourceEventClientRefId: cycleCountClientRefId,
				});
			}

			await enqueueEntitySyncChange({
				entityType: 'product',
				operation: 'upsert',
				localId: normalizedProductId,
				clientRefId: product.client_ref_id || buildLocalClientRefId({ entityType: 'product', localId: normalizedProductId }),
				serverId: productSyncRow?.server_id || product.server_id || null,
				version: Number(productSyncRow?.sync_version || 1),
				updatedAt: countedAtIso,
				data: {
					name: String(productSyncRow?.name || product.name || ''),
					quantity: Number(productSyncRow?.quantity || normalizedPhysicalQuantity),
					price: Number(productSyncRow?.price || product.price || 0),
					lowStockThreshold: Number(productSyncRow?.low_stock_threshold || product.low_stock_threshold || 5),
					expiryDate: productSyncRow?.expiry_date || product.expiry_date || null,
					deletedAt: null,
				},
			});
		}

		const consistency = await validateInventoryBatchConsistencyTx({ userId, productId: normalizedProductId });
		if (!consistency.is_consistent) {
			throw new Error('Batch quantity mismatch detected during cycle count reconciliation.');
		}

		await refreshInventoryAlertsTx({ userId, syncUpdatedAt: countedAtIso });

		await db.execAsync('COMMIT;');

		return {
			id: cycleCountId,
			product_id: normalizedProductId,
			product_name: String(product.name || ''),
			system_quantity: systemQuantity,
			physical_quantity: normalizedPhysicalQuantity,
			variance,
			timestamp: countedAtIso,
			note: typeof note === 'string' ? note.trim() : null,
			adjustment_movement_id: movementId,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const createStockMovement = async ({
	productId,
	movementType,
	quantity,
	note = null,
	stockOutReason = null,
	batchNumber = null,
	expiryDate = null,
	purchaseDate = null,
	costPrice = null,
	sourceEventType = null,
	sourceEventId = null,
	sourceEventClientRefId = null,
	enforceManualRules = true,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();
	const normalizedProductId = Number(productId);
	const normalizedMovementType = normalizeMovementType(movementType);
	const normalizedQuantity = Number(quantity);
	const normalizedNote = typeof note === 'string' ? note.trim() : null;
	const normalizedSourceEventType = String(sourceEventType || '').trim().toLowerCase() || null;
	const normalizedSourceEventId = Number(sourceEventId);
	const normalizedBatchNumber = typeof batchNumber === 'string' ? batchNumber.trim() : '';
	const normalizedBatchExpiryDate = normalizeExpiryDate(expiryDate);
	const normalizedCostPriceCents = costPrice === null || costPrice === undefined || costPrice === ''
		? null
		: toMoneyCents(costPrice);
	const normalizedPurchaseDate = purchaseDate ? new Date(purchaseDate) : null;
	const normalizedStockOutReason = normalizedMovementType === 'out'
		? normalizeStockOutReason(stockOutReason)
		: null;

	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		throw new Error('Valid productId is required.');
	}

	if (!normalizedMovementType) {
		throw new Error("movementType must be one of: in, out, adjust.");
	}

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity === 0) {
		throw new Error('Quantity must be a non-zero integer.');
	}

	if ((normalizedMovementType === 'in' || normalizedMovementType === 'out') && normalizedQuantity < 0) {
		throw new Error('Quantity must be positive for movementType in/out.');
	}

	if (normalizedMovementType === 'out' && !normalizedStockOutReason) {
		throw new Error('stockOutReason is required for stock-out movements.');
	}

	if (
		normalizedMovementType === 'out'
		&& normalizedStockOutReason === 'SALE'
		&& enforceManualRules
	) {
		throw new Error('SALE stock-out must be created from the sale event flow.');
	}

	if (
		normalizedMovementType === 'out'
		&& enforceManualRules
		&& normalizedStockOutReason
		&& !MANUAL_STOCK_OUT_REASONS.has(normalizedStockOutReason)
	) {
		throw new Error('Manual stock-out reason must be one of: DAMAGE, EXPIRY, ADJUSTMENT.');
	}

	if (
		normalizedPurchaseDate
		&& Number.isNaN(normalizedPurchaseDate.getTime())
	) {
		throw new Error('purchaseDate is invalid.');
	}

	if (normalizedCostPriceCents !== null && (!Number.isInteger(normalizedCostPriceCents) || normalizedCostPriceCents < 0)) {
		throw new Error('costPrice must be a non-negative number.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const existing = await db.getFirstAsync(
			`SELECT id, name, quantity, price, expiry_date, low_stock_threshold, server_id, client_ref_id
			 FROM products
			 WHERE id = ? AND user_id = ?;`,
			normalizedProductId,
			userId
		);

		if (!existing) {
			throw new Error('Product not found.');
		}

		const currentQuantity = Number(existing.quantity);
		let quantityDelta = normalizedQuantity;

		if (normalizedMovementType === 'out') {
			quantityDelta = -normalizedQuantity;
		}

		const nextQuantity = currentQuantity + quantityDelta;
		if (nextQuantity < 0) {
			throw new Error('Insufficient stock. Movement would make quantity negative.');
		}

		const insertResult = await db.runAsync(
			`INSERT INTO stock_movements (
				user_id,
				product_id,
				movement_type,
				stock_out_reason,
				quantity_delta,
				quantity_before,
				quantity_after,
				source_event_type,
				source_event_id,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
			userId,
			normalizedProductId,
			normalizedMovementType,
			normalizedStockOutReason,
			quantityDelta,
			currentQuantity,
			nextQuantity,
			normalizedSourceEventType,
			Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0 ? normalizedSourceEventId : null,
			normalizedNote || null,
			null,
			1,
			syncUpdatedAt
		);

		const movementLocalId = Number(insertResult.lastInsertRowId);
		const movementClientRefId = buildLocalClientRefId({ entityType: 'inventory_movement', localId: movementLocalId });
		await db.runAsync(`UPDATE stock_movements SET client_ref_id = ? WHERE id = ?;`, movementClientRefId, movementLocalId);

		const productClientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'product', localId: normalizedProductId });
		await db.runAsync(
			`UPDATE products
			 SET quantity = ?,
				 client_ref_id = ?,
				 sync_version = COALESCE(sync_version, 0) + 1,
				 sync_updated_at = ?
			 WHERE id = ? AND user_id = ?;`,
			nextQuantity,
			productClientRefId,
			syncUpdatedAt,
			normalizedProductId,
			userId
		);

		const productRow = await db.getFirstAsync(
			`SELECT server_id, sync_version FROM products WHERE id = ? AND user_id = ?;`,
			normalizedProductId,
			userId
		);

		let batchAllocations = [];
		let createdBatch = null;

		if (quantityDelta < 0) {
			batchAllocations = await consumeInventoryBatchesTx({
				userId,
				productId: normalizedProductId,
				quantity: Math.abs(quantityDelta),
				syncUpdatedAt,
				sourceEventType: normalizedSourceEventType,
				sourceEventId: Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0 ? normalizedSourceEventId : null,
				sourceEventClientRefId: String(sourceEventClientRefId || '').trim() || null,
			});
		}

		if (quantityDelta > 0) {
			const defaultCostPriceCents = toMoneyCents(existing.price) || 0;
			createdBatch = await createInventoryBatchTx({
				userId,
				productId: normalizedProductId,
				quantity: quantityDelta,
				batchNumber: normalizedBatchNumber || null,
				expiryDate: normalizedBatchExpiryDate || existing.expiry_date || null,
				purchaseDate: normalizedPurchaseDate ? normalizedPurchaseDate.toISOString() : syncUpdatedAt,
				costPriceCents: normalizedCostPriceCents === null ? defaultCostPriceCents : normalizedCostPriceCents,
				syncUpdatedAt,
				sourceEventType: normalizedSourceEventType,
				sourceEventId: Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0 ? normalizedSourceEventId : null,
				sourceEventClientRefId: String(sourceEventClientRefId || '').trim() || null,
			});
		}

		const batchConsistency = await validateInventoryBatchConsistencyTx({
			userId,
			productId: normalizedProductId,
		});
		if (!batchConsistency.is_consistent) {
			throw new Error('Batch quantity mismatch detected after stock movement.');
		}

		await refreshInventoryAlertsTx({ userId, syncUpdatedAt });

		await enqueueEntitySyncChange({
			entityType: 'inventory_movement',
			operation: 'upsert',
			localId: movementLocalId,
			clientRefId: movementClientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				movementType: normalizedMovementType,
				stockOutReason: normalizedStockOutReason,
				quantityDelta,
				quantityBefore: currentQuantity,
				quantityAfter: nextQuantity,
				note: normalizedNote || null,
				sourceEventType: normalizedSourceEventType,
				sourceEventId: Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0
					? normalizedSourceEventId
					: null,
				sourceEventClientRefId: String(sourceEventClientRefId || '').trim() || null,
				productId: normalizedProductId,
				productServerId: existing.server_id || null,
				productClientRefId,
				occurredAt: syncUpdatedAt,
				deletedAt: null,
			},
		});

		await enqueueEntitySyncChange({
			entityType: 'product',
			operation: 'upsert',
			localId: normalizedProductId,
			clientRefId: productClientRefId,
			serverId: productRow?.server_id || existing.server_id || null,
			version: Number(productRow?.sync_version || 1),
			updatedAt: syncUpdatedAt,
			data: {
				name: String(existing.name || ''),
				quantity: nextQuantity,
				price: Number(existing.price || 0),
				lowStockThreshold: Number(existing.low_stock_threshold || 5),
				expiryDate: existing.expiry_date || null,
			},
		});

		void logAudit({
			userId,
			entityType: 'stock_movement',
			entityId: insertResult.lastInsertRowId,
			action: 'create',
			metadata: {
				previous: { quantity: currentQuantity },
				new: {
					quantity: nextQuantity,
					movement_type: normalizedMovementType,
					stock_out_reason: normalizedStockOutReason,
					quantity_delta: quantityDelta,
					source_event_type: normalizedSourceEventType,
					source_event_id: Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0
						? normalizedSourceEventId
						: null,
				},
				notes: normalizedNote || null,
			},
			notes: 'Stock movement recorded',
		});

		await db.execAsync('COMMIT;');

		return {
			id: movementLocalId,
			user_id: userId,
			product_id: normalizedProductId,
			movement_type: normalizedMovementType,
			stock_out_reason: normalizedStockOutReason,
			quantity_delta: quantityDelta,
			quantity_before: currentQuantity,
			quantity_after: nextQuantity,
			source_event_type: normalizedSourceEventType,
			source_event_id: Number.isInteger(normalizedSourceEventId) && normalizedSourceEventId > 0
				? normalizedSourceEventId
				: null,
			note: normalizedNote || null,
			batch_allocations: batchAllocations,
			created_batch: createdBatch,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const addStockMovement = (payload) => createStockMovement(payload);

export const getStockMovements = ({ productId = null, limit = 100 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;

	if (productId === null || productId === undefined) {
		return db.getAllAsync(
			`SELECT m.id,
					m.product_id,
					p.name AS product_name,
					m.movement_type,
					m.stock_out_reason,
					m.quantity_delta,
					m.quantity_before,
					m.quantity_after,
					m.source_event_type,
					m.source_event_id,
					sh.receipt_id AS receipt_id,
					m.note,
					m.created_at
			 FROM stock_movements m
			 JOIN products p ON p.id = m.product_id
			 LEFT JOIN sales_header sh
				ON sh.id = m.source_event_id
				AND LOWER(COALESCE(m.source_event_type, '')) = 'sale'
			 WHERE m.user_id = ?
			 ORDER BY m.created_at DESC, m.id DESC
			 LIMIT ?;`,
			userId,
			normalizedLimit
		);
	}

	const normalizedProductId = Number(productId);
	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		return Promise.reject(new Error('Valid productId is required.'));
	}

	return db.getAllAsync(
		`SELECT m.id,
				m.product_id,
				p.name AS product_name,
				m.movement_type,
				m.stock_out_reason,
				m.quantity_delta,
				m.quantity_before,
				m.quantity_after,
				m.source_event_type,
				m.source_event_id,
				sh.receipt_id AS receipt_id,
				m.note,
				m.created_at
		 FROM stock_movements m
		 JOIN products p ON p.id = m.product_id
		 LEFT JOIN sales_header sh
			ON sh.id = m.source_event_id
			AND LOWER(COALESCE(m.source_event_type, '')) = 'sale'
		 WHERE m.product_id = ?
			AND m.user_id = ?
		 ORDER BY m.created_at DESC, m.id DESC
		 LIMIT ?;`,
		normalizedProductId,
		userId,
		normalizedLimit
	);
	};

	return run();
};

export const getProductSalesDailyAggregation = ({ days = 30, productId = null } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) > 0 ? Number(days) : 30;
	const fromModifier = `-${Math.max(0, normalizedDays - 1)} days`;

	if (productId === null || productId === undefined) {
		return db.getAllAsync(
			`SELECT
				si.product_id,
				DATE(sh.timestamp) AS sale_date,
				SUM(si.quantity) AS units_sold
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			WHERE sh.user_id = ?
				AND sh.deleted_at IS NULL
				AND sh.status = 'posted'
				AND DATE(sh.timestamp) >= DATE('now', ?)
			GROUP BY si.product_id, DATE(sh.timestamp)
			ORDER BY si.product_id ASC, sale_date ASC;`,
			userId,
			fromModifier
		);
	}

	const normalizedProductId = Number(productId);
	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		return Promise.reject(new Error('Valid productId is required.'));
	}

	return db.getAllAsync(
		`SELECT
			si.product_id,
			DATE(sh.timestamp) AS sale_date,
			SUM(si.quantity) AS units_sold
		 FROM sales_items si
		 JOIN sales_header sh ON sh.id = si.sales_header_id
		 WHERE sh.user_id = ?
			AND sh.deleted_at IS NULL
			AND sh.status = 'posted'
			AND DATE(sh.timestamp) >= DATE('now', ?)
			AND si.product_id = ?
		 GROUP BY si.product_id, DATE(sh.timestamp)
		 ORDER BY sale_date ASC;`,
		userId,
		fromModifier,
		normalizedProductId
	);
	};

	return run();
};

export const getProductSalesSummaryAggregation = ({ days = 30 } = {}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) > 0 ? Number(days) : 30;
	const fromModifier = `-${Math.max(0, normalizedDays - 1)} days`;

		return db.getAllAsync(
			`SELECT
				si.product_id,
				SUM(si.quantity) AS total_units_sold,
				COUNT(DISTINCT DATE(sh.timestamp)) AS sales_days
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			WHERE sh.user_id = ?
				AND sh.deleted_at IS NULL
				AND sh.status = 'posted'
				AND DATE(sh.timestamp) >= DATE('now', ?)
			GROUP BY si.product_id
			ORDER BY si.product_id ASC;`,
			userId,
			fromModifier
		);
	};

	return run();
};

const generateReceiptId = async ({ userId, at = null }) => {
	const dateToken = buildReceiptDateToken(at);
	const prefix = `HSB-SALE-${dateToken}`;
	const row = await db.getFirstAsync(
		`SELECT COUNT(1) AS total
		 FROM sales_header
		 WHERE user_id = ?
			AND receipt_id LIKE ?;`,
		userId,
		`${prefix}%`
	);

	const nextSequence = Math.max(1, Number(row?.total || 0) + 1);
	return `${prefix}-${String(nextSequence).padStart(5, '0')}`;
};

const normalizeSaleItems = (items = []) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error('At least one sale item is required.');
	}

	return items.map((item, index) => {
		const productId = Number(item?.productId ?? item?.product_id);
		const quantity = Number(item?.quantity);
		const unitPriceInput = item?.unitPrice ?? item?.unit_price;

		if (!Number.isInteger(productId) || productId <= 0) {
			throw new Error(`Invalid productId at item index ${index}.`);
		}

		if (!Number.isInteger(quantity) || quantity <= 0) {
			throw new Error(`Invalid quantity at item index ${index}.`);
		}

		const normalizedUnitPriceCents = unitPriceInput === undefined || unitPriceInput === null || unitPriceInput === ''
			? null
			: toMoneyCents(unitPriceInput);

		if (unitPriceInput !== undefined && unitPriceInput !== null && unitPriceInput !== '' && normalizedUnitPriceCents === null) {
			throw new Error(`Invalid unit price at item index ${index}.`);
		}

		return {
			productId,
			quantity,
			unitPriceCents: normalizedUnitPriceCents,
			note: typeof item?.note === 'string' ? item.note.trim() : null,
		};
	});
};

const normalizeSalePayments = ({ payments = [], fallbackMethod = 'CASH', totalAmountCents = 0 } = {}) => {
	if (!Array.isArray(payments) || payments.length === 0) {
		return [
			{
				amountCents: totalAmountCents,
				method: normalizePaymentMethod(fallbackMethod, 'CASH'),
				status: 'PAID',
				note: null,
			},
		];
	}

	const normalized = payments.map((item, index) => {
		const amountCents = toMoneyCents(item?.amount);
		if (amountCents === null || amountCents < 0) {
			throw new Error(`Invalid payment amount at payment index ${index}.`);
		}

		return {
			amountCents,
			method: normalizePaymentMethod(item?.method, fallbackMethod),
			status: normalizePaymentStatus(item?.status, 'PAID'),
			note: typeof item?.note === 'string' ? item.note.trim() : null,
		};
	});

	const totalPaidCents = normalized.reduce((sum, item) => sum + item.amountCents, 0);
	if (totalPaidCents !== totalAmountCents) {
		throw new Error('Sum of payment amounts must exactly match sale total amount.');
	}

	return normalized;
};

export const createSale = async ({
	customerId = null,
	items = [],
	payments = [],
	paymentMode = 'CASH',
	note = null,
	timestamp = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const saleAt = timestamp ? new Date(timestamp) : new Date();
	if (Number.isNaN(saleAt.getTime())) {
		throw new Error('Valid sale timestamp is required.');
	}

	const normalizedItems = normalizeSaleItems(items);
	const normalizedCustomerId = customerId === null || customerId === undefined || customerId === ''
		? null
		: Number(customerId);
	let resolvedCustomerServerId = null;
	let resolvedCustomerClientRefId = null;

	if (normalizedCustomerId !== null && (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0)) {
		throw new Error('Invalid customerId for sale.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		if (normalizedCustomerId !== null) {
			const customerRow = await db.getFirstAsync(
				`SELECT id, server_id, client_ref_id FROM customers WHERE id = ? AND user_id = ? LIMIT 1;`,
				normalizedCustomerId,
				userId
			);

			if (!customerRow) {
				throw new Error('Customer not found for sale.');
			}

			resolvedCustomerServerId = customerRow.server_id ? String(customerRow.server_id) : null;
			resolvedCustomerClientRefId = customerRow.client_ref_id ? String(customerRow.client_ref_id) : null;
		}

		const enrichedItems = [];
		for (const item of normalizedItems) {
			const product = await db.getFirstAsync(
				`SELECT id, name, quantity, price, low_stock_threshold, expiry_date, server_id, client_ref_id
				 FROM products
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				item.productId,
				userId
			);

			if (!product) {
				throw new Error(`Product ${item.productId} not found.`);
			}

			const currentQuantity = Number(product.quantity || 0);
			if (currentQuantity < item.quantity) {
				throw new Error(`Insufficient stock for ${String(product.name || `product-${item.productId}`)}.`);
			}

			const defaultUnitPriceCents = toMoneyCents(product.price);
			const unitPriceCents = item.unitPriceCents === null ? defaultUnitPriceCents : item.unitPriceCents;
			if (unitPriceCents === null || unitPriceCents < 0) {
				throw new Error(`Invalid unit price for product ${item.productId}.`);
			}

			enrichedItems.push({
				...item,
				product,
				quantityBefore: currentQuantity,
				quantityAfter: currentQuantity - item.quantity,
				unitPriceCents,
				subtotalCents: item.quantity * unitPriceCents,
			});
		}

		const totalAmountCents = enrichedItems.reduce((sum, item) => sum + item.subtotalCents, 0);
		const normalizedPayments = normalizeSalePayments({
			payments,
			fallbackMethod: paymentMode,
			totalAmountCents,
		});

		const distinctPaymentMethods = [...new Set(normalizedPayments.map((item) => item.method))];
		const resolvedPaymentMode = distinctPaymentMethods.length > 1
			? 'MIXED'
			: normalizePaymentMethod(paymentMode, distinctPaymentMethods[0] || 'CASH');

		const receiptId = await generateReceiptId({ userId, at: saleAt });
		const syncUpdatedAt = saleAt.toISOString();

		const headerInsert = await db.runAsync(
			`INSERT INTO sales_header (
				user_id,
				receipt_id,
				customer_id,
				timestamp,
				total_amount_cents,
				payment_mode,
				status,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, 1, ?, NULL, ?, ?);`,
			userId,
			receiptId,
			normalizedCustomerId,
			syncUpdatedAt,
			totalAmountCents,
			resolvedPaymentMode,
			typeof note === 'string' ? note.trim() : null,
			null,
			syncUpdatedAt,
			syncUpdatedAt,
			syncUpdatedAt
		);

		const salesHeaderId = Number(headerInsert.lastInsertRowId);
		const salesHeaderClientRefId = buildLocalClientRefId({ entityType: 'sales_header', localId: salesHeaderId });
		await db.runAsync(`UPDATE sales_header SET client_ref_id = ? WHERE id = ?;`, salesHeaderClientRefId, salesHeaderId);

		await enqueueEntitySyncChange({
			entityType: 'sales_header',
			operation: 'upsert',
			localId: salesHeaderId,
			clientRefId: salesHeaderClientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				receiptId,
				customerId: normalizedCustomerId,
				customerServerId: resolvedCustomerServerId,
				customerClientRefId: resolvedCustomerClientRefId,
				timestamp: syncUpdatedAt,
				totalAmount: fromMoneyCents(totalAmountCents),
				paymentMode: resolvedPaymentMode,
				status: 'posted',
				note: typeof note === 'string' ? note.trim() : null,
				deletedAt: null,
			},
		});

		const itemRows = [];
		const touchedProductIds = new Set();
		for (const item of enrichedItems) {
			touchedProductIds.add(Number(item.productId));

			const batchAllocations = await consumeInventoryBatchesTx({
				userId,
				productId: Number(item.productId),
				quantity: Number(item.quantity),
				syncUpdatedAt,
				sourceEventType: 'sale',
				sourceEventId: salesHeaderId,
				sourceEventClientRefId: salesHeaderClientRefId,
			});

			const itemInsert = await db.runAsync(
				`INSERT INTO sales_items (
					user_id,
					sales_header_id,
					product_id,
					quantity,
					unit_price_cents,
					subtotal_cents,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?);`,
				userId,
				salesHeaderId,
				item.productId,
				item.quantity,
				item.unitPriceCents,
				item.subtotalCents,
				item.note || null,
				null,
				syncUpdatedAt,
				syncUpdatedAt
			);

			const salesItemId = Number(itemInsert.lastInsertRowId);
			const salesItemClientRefId = buildLocalClientRefId({ entityType: 'sales_item', localId: salesItemId });
			await db.runAsync(`UPDATE sales_items SET client_ref_id = ? WHERE id = ?;`, salesItemClientRefId, salesItemId);

			await enqueueEntitySyncChange({
				entityType: 'sales_item',
				operation: 'upsert',
				localId: salesItemId,
				clientRefId: salesItemClientRefId,
				version: 1,
				updatedAt: syncUpdatedAt,
				data: {
					salesHeaderId,
					salesHeaderClientRefId,
					productId: item.productId,
					productServerId: item.product.server_id || null,
					productClientRefId: item.product.client_ref_id || buildLocalClientRefId({ entityType: 'product', localId: item.productId }),
					quantity: item.quantity,
					unitPrice: fromMoneyCents(item.unitPriceCents),
					subtotal: fromMoneyCents(item.subtotalCents),
					note: item.note || null,
					deletedAt: null,
				},
			});

			const productClientRefId = String(item.product.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'product', localId: item.productId });
			await db.runAsync(
				`UPDATE products
				 SET quantity = ?,
					 client_ref_id = ?,
					 sync_version = COALESCE(sync_version, 0) + 1,
					 sync_updated_at = ?
				 WHERE id = ? AND user_id = ?;`,
				item.quantityAfter,
				productClientRefId,
				syncUpdatedAt,
				item.productId,
				userId
			);

			const productRow = await db.getFirstAsync(
				`SELECT id, name, quantity, price, low_stock_threshold, expiry_date, server_id, sync_version
				 FROM products
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				item.productId,
				userId
			);

			const movementInsert = await db.runAsync(
				`INSERT INTO stock_movements (
					user_id,
					product_id,
					movement_type,
					stock_out_reason,
					quantity_delta,
					quantity_before,
					quantity_after,
					source_event_type,
					source_event_id,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, 'out', 'SALE', ?, ?, ?, 'sale', ?, ?, ?, 1, ?, NULL, ?);`,
				userId,
				item.productId,
				-item.quantity,
				item.quantityBefore,
				item.quantityAfter,
				salesHeaderId,
				item.note || `Sale ${receiptId}`,
				null,
				syncUpdatedAt,
				syncUpdatedAt
			);

			const movementId = Number(movementInsert.lastInsertRowId);
			const movementClientRefId = buildLocalClientRefId({ entityType: 'inventory_movement', localId: movementId });
			await db.runAsync(`UPDATE stock_movements SET client_ref_id = ? WHERE id = ?;`, movementClientRefId, movementId);

			await enqueueEntitySyncChange({
				entityType: 'inventory_movement',
				operation: 'upsert',
				localId: movementId,
				clientRefId: movementClientRefId,
				version: 1,
				updatedAt: syncUpdatedAt,
				data: {
					movementType: 'out',
					stockOutReason: 'SALE',
					quantityDelta: -item.quantity,
					quantityBefore: item.quantityBefore,
					quantityAfter: item.quantityAfter,
					note: item.note || `Sale ${receiptId}`,
					sourceEventType: 'sale',
					sourceEventId: salesHeaderId,
					sourceEventClientRefId: salesHeaderClientRefId,
					productId: item.productId,
					productServerId: item.product.server_id || null,
					productClientRefId,
					occurredAt: syncUpdatedAt,
					deletedAt: null,
				},
			});

			await enqueueEntitySyncChange({
				entityType: 'product',
				operation: 'upsert',
				localId: item.productId,
				clientRefId: productClientRefId,
				serverId: productRow?.server_id || item.product.server_id || null,
				version: Number(productRow?.sync_version || 1),
				updatedAt: syncUpdatedAt,
				data: {
					name: String(productRow?.name || item.product.name || ''),
					quantity: Number(productRow?.quantity || item.quantityAfter),
					price: Number(productRow?.price || item.product.price || 0),
					lowStockThreshold: Number(productRow?.low_stock_threshold || item.product.low_stock_threshold || 5),
					expiryDate: productRow?.expiry_date || item.product.expiry_date || null,
					deletedAt: null,
				},
			});

			itemRows.push({
				id: salesItemId,
				product_id: item.productId,
				product_name: String(item.product.name || ''),
				quantity: item.quantity,
				unit_price: fromMoneyCents(item.unitPriceCents),
				subtotal: fromMoneyCents(item.subtotalCents),
				note: item.note || null,
				movement_id: movementId,
				batch_allocations: batchAllocations,
			});
		}

		const paymentRows = [];
		for (const payment of normalizedPayments) {
			const paymentInsert = await db.runAsync(
				`INSERT INTO payments (
					user_id,
					sales_header_id,
					amount_cents,
					method,
					status,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?);`,
				userId,
				salesHeaderId,
				payment.amountCents,
				payment.method,
				payment.status,
				payment.note || null,
				null,
				syncUpdatedAt,
				syncUpdatedAt
			);

			const paymentId = Number(paymentInsert.lastInsertRowId);
			const paymentClientRefId = buildLocalClientRefId({ entityType: 'payment', localId: paymentId });
			await db.runAsync(`UPDATE payments SET client_ref_id = ? WHERE id = ?;`, paymentClientRefId, paymentId);

			await enqueueEntitySyncChange({
				entityType: 'payment',
				operation: 'upsert',
				localId: paymentId,
				clientRefId: paymentClientRefId,
				version: 1,
				updatedAt: syncUpdatedAt,
				data: {
					salesHeaderId,
					salesHeaderClientRefId,
					amount: fromMoneyCents(payment.amountCents),
					method: payment.method,
					status: payment.status,
					note: payment.note || null,
					deletedAt: null,
				},
			});

			if (String(payment.status || '').trim().toUpperCase() === 'PAID' && payment.amountCents > 0) {
				await insertCashbookEntryTx({
					userId,
					entryType: 'IN',
					amountCents: payment.amountCents,
					paymentMethod: payment.method,
					category: 'SALE',
					referenceType: 'sale_payment',
					referenceLocalId: paymentId,
					referenceClientRefId: paymentClientRefId,
					note: payment.note || `Sale payment for ${receiptId}`,
					occurredAt: syncUpdatedAt,
					syncUpdatedAt,
				});
			}

			paymentRows.push({
				id: paymentId,
				amount: fromMoneyCents(payment.amountCents),
				method: payment.method,
				status: payment.status,
				note: payment.note || null,
			});
		}

		let generatedCreditEntry = null;
		const pendingCreditCents = normalizedPayments.reduce((sum, payment) => {
			const statusToken = String(payment.status || '').trim().toUpperCase();
			return statusToken === 'PAID' ? sum : sum + Number(payment.amountCents || 0);
		}, 0);

		if (normalizedCustomerId !== null && pendingCreditCents > 0) {
			const customerLedger = await db.getFirstAsync(
				`SELECT credit_limit, due_terms_days
				 FROM customers
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				normalizedCustomerId,
				userId
			);

			if (!customerLedger) {
				throw new Error('Customer not found for credit sale posting.');
			}

			const dueRow = await db.getFirstAsync(
				`SELECT COALESCE(SUM(
					CASE
						WHEN type = 'credit' THEN amount_cents
						WHEN type = 'payment' THEN -amount_cents
						ELSE 0
					END
				), 0) AS total_due_cents
				 FROM baki_transactions
				 WHERE customer_id = ? AND user_id = ?;`,
				normalizedCustomerId,
				userId
			);

			const activeDueCents = Math.max(0, Number(dueRow?.total_due_cents || 0));
			const creditLimitCents = toMoneyCents(customerLedger.credit_limit || 0) || 0;
			if (creditLimitCents > 0 && activeDueCents + pendingCreditCents > creditLimitCents) {
				const remaining = Math.max(0, creditLimitCents - activeDueCents);
				throw new Error(`Credit limit exceeded. Remaining customer credit is ৳${fromMoneyCents(remaining).toFixed(2)}.`);
			}

			const resolvedDueTermsDays = Number.isInteger(Number(customerLedger.due_terms_days)) && Number(customerLedger.due_terms_days) > 0
				? Number(customerLedger.due_terms_days)
				: 30;
			const dueDate = new Date(syncUpdatedAt);
			dueDate.setUTCDate(dueDate.getUTCDate() + resolvedDueTermsDays);
			const dueDateIso = dueDate.toISOString();

			const bakiInsert = await db.runAsync(
				`INSERT INTO baki_transactions (
					user_id,
					customer_id,
					type,
					amount_cents,
					due_date,
					status,
					reference_id,
					reminder_sent_at,
					resolved_at,
					note,
					payment_method,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, 'credit', ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, 1, ?, NULL, ?);`,
				userId,
				normalizedCustomerId,
				pendingCreditCents,
				dueDateIso,
				dueDate.getTime() < Date.now() ? 'overdue' : 'open',
				`sale:${receiptId}`,
				`Credit created from sale ${receiptId}`,
				null,
				syncUpdatedAt,
				syncUpdatedAt
			);

			const bakiLocalId = Number(bakiInsert.lastInsertRowId);
			const bakiClientRefId = buildLocalClientRefId({ entityType: 'baki_entry', localId: bakiLocalId });
			await db.runAsync(`UPDATE baki_transactions SET client_ref_id = ? WHERE id = ?;`, bakiClientRefId, bakiLocalId);

			await enqueueEntitySyncChange({
				entityType: 'baki_entry',
				operation: 'upsert',
				localId: bakiLocalId,
				clientRefId: bakiClientRefId,
				version: 1,
				updatedAt: syncUpdatedAt,
				data: {
					type: 'credit',
					amount: fromMoneyCents(pendingCreditCents),
					note: `Credit created from sale ${receiptId}`,
					paymentMethod: null,
					dueDate: dueDateIso,
					status: dueDate.getTime() < Date.now() ? 'overdue' : 'open',
					referenceId: `sale:${receiptId}`,
					reminderSentAt: null,
					resolvedAt: null,
					customerId: normalizedCustomerId,
					customerServerId: resolvedCustomerServerId,
					customerClientRefId: resolvedCustomerClientRefId,
					occurredAt: syncUpdatedAt,
					deletedAt: null,
				},
			});

			const nextDueCents = activeDueCents + pendingCreditCents;
			const nextRisk = nextDueCents > 1000000 ? 'high' : nextDueCents > 300000 ? 'medium' : 'low';
			await db.runAsync(
				`UPDATE customers
				 SET current_balance = ?,
					 risk_level = ?,
					 updated_at = datetime('now')
				 WHERE id = ? AND user_id = ?;`,
				fromMoneyCents(nextDueCents),
				nextRisk,
				normalizedCustomerId,
				userId
			);

			generatedCreditEntry = {
				id: bakiLocalId,
				amount: fromMoneyCents(pendingCreditCents),
				due_date: dueDateIso,
				status: dueDate.getTime() < Date.now() ? 'overdue' : 'open',
				reference_id: `sale:${receiptId}`,
			};
		}

		for (const touchedProductId of touchedProductIds) {
			const consistency = await validateInventoryBatchConsistencyTx({
				userId,
				productId: touchedProductId,
			});

			if (!consistency.is_consistent) {
				throw new Error('Batch quantity mismatch detected during sale posting.');
			}
		}

		await refreshInventoryAlertsTx({ userId, syncUpdatedAt });

		void logAudit({
			userId,
			entityType: 'sale',
			entityId: salesHeaderId,
			action: 'create',
			metadata: {
				receipt_id: receiptId,
				total_amount_cents: totalAmountCents,
				item_count: itemRows.length,
				payment_count: paymentRows.length,
			},
			notes: 'Sale recorded with event-driven stock movement',
		});

		await db.execAsync('COMMIT;');

		return {
			id: salesHeaderId,
			receipt_id: receiptId,
			customer_id: normalizedCustomerId,
			timestamp: syncUpdatedAt,
			total_amount: fromMoneyCents(totalAmountCents),
			payment_mode: resolvedPaymentMode,
			status: 'posted',
			note: typeof note === 'string' ? note.trim() : null,
			items: itemRows,
			payments: paymentRows,
			generated_credit_entry: generatedCreditEntry,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const getSalesHistory = async ({
	limit = 100,
	fromDateIso = null,
	toDateIso = null,
	customerId = null,
	productId = null,
	paymentMode = null,
	searchText = '',
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
	const where = ['sh.user_id = ?'];
	const params = [userId];
	const normalizedCustomerId = Number(customerId);
	const normalizedProductId = Number(productId);
	const normalizedSearchText = typeof searchText === 'string' ? searchText.trim().toLowerCase() : '';
	const normalizedPaymentMode = String(paymentMode || '').trim().toUpperCase();

	if (fromDateIso) {
		where.push('datetime(sh.timestamp) >= datetime(?)');
		params.push(String(fromDateIso));
	}

	if (toDateIso) {
		where.push('datetime(sh.timestamp) <= datetime(?)');
		params.push(String(toDateIso));
	}

	if (Number.isInteger(normalizedCustomerId) && normalizedCustomerId > 0) {
		where.push('sh.customer_id = ?');
		params.push(normalizedCustomerId);
	}

	if (Number.isInteger(normalizedProductId) && normalizedProductId > 0) {
		where.push(`EXISTS (
			SELECT 1
			FROM sales_items sx
			WHERE sx.sales_header_id = sh.id
				AND sx.user_id = sh.user_id
				AND sx.product_id = ?
		)`);
		params.push(normalizedProductId);
	}

	if (normalizedPaymentMode) {
		where.push(`EXISTS (
			SELECT 1
			FROM payments py
			WHERE py.sales_header_id = sh.id
				AND py.user_id = sh.user_id
				AND UPPER(COALESCE(py.method, '')) = ?
		)`);
		params.push(normalizedPaymentMode);
	}

	if (normalizedSearchText) {
		where.push(`(
			LOWER(COALESCE(sh.receipt_id, '')) LIKE ?
			OR LOWER(COALESCE(c.name, '')) LIKE ?
			OR LOWER(COALESCE(sh.note, '')) LIKE ?
		)`);
		params.push(`%${normalizedSearchText}%`, `%${normalizedSearchText}%`, `%${normalizedSearchText}%`);
	}

	const rows = await db.getAllAsync(
		`SELECT
			sh.id,
			sh.receipt_id,
			sh.customer_id,
			c.name AS customer_name,
			sh.timestamp,
			sh.total_amount_cents,
			sh.payment_mode,
			sh.status,
			sh.note,
			COUNT(si.id) AS item_count
		 FROM sales_header sh
		 LEFT JOIN customers c ON c.id = sh.customer_id
		 LEFT JOIN sales_items si ON si.sales_header_id = sh.id
		 WHERE ${where.join(' AND ')}
		 GROUP BY sh.id
		 ORDER BY datetime(sh.timestamp) DESC, sh.id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		receipt_id: String(row.receipt_id || ''),
		customer_id: row.customer_id === null || row.customer_id === undefined ? null : Number(row.customer_id),
		customer_name: row.customer_name || null,
		timestamp: row.timestamp || null,
		total_amount: fromMoneyCents(Number(row.total_amount_cents || 0)),
		payment_mode: String(row.payment_mode || '').trim().toUpperCase() || 'CASH',
		status: String(row.status || '').trim().toLowerCase() || 'posted',
		note: row.note || null,
		item_count: Number(row.item_count || 0),
	}));
};

export const getRecentSoldProducts = async ({ limit = 12 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 12;

	const rows = await db.getAllAsync(
		`SELECT
			si.product_id,
			p.name AS product_name,
			si.unit_price_cents,
			sh.timestamp AS last_sold_at
		 FROM sales_items si
		 JOIN sales_header sh ON sh.id = si.sales_header_id
		 JOIN products p ON p.id = si.product_id
		 WHERE si.user_id = ?
			AND sh.user_id = ?
			AND sh.status = 'posted'
			AND si.id = (
				SELECT si2.id
				FROM sales_items si2
				JOIN sales_header sh2 ON sh2.id = si2.sales_header_id
				WHERE si2.user_id = ?
					AND sh2.user_id = ?
					AND sh2.status = 'posted'
					AND si2.product_id = si.product_id
				ORDER BY datetime(sh2.timestamp) DESC, si2.id DESC
				LIMIT 1
			)
		 ORDER BY datetime(sh.timestamp) DESC, si.id DESC
		 LIMIT ?;`,
		userId,
		userId,
		userId,
		userId,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		product_id: Number(row.product_id),
		product_name: String(row.product_name || ''),
		last_unit_price: fromMoneyCents(Number(row.unit_price_cents || 0)),
		last_sold_at: row.last_sold_at || null,
	}));
};

export const getSaleReceipt = async ({ saleId = null, receiptId = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedSaleId = Number(saleId);
	const normalizedReceiptId = String(receiptId || '').trim();

	if ((!Number.isInteger(normalizedSaleId) || normalizedSaleId <= 0) && !normalizedReceiptId) {
		throw new Error('saleId or receiptId is required to fetch receipt.');
	}

	const header = await db.getFirstAsync(
		`SELECT
			sh.id,
			sh.receipt_id,
			sh.customer_id,
			c.name AS customer_name,
			sh.timestamp,
			sh.total_amount_cents,
			sh.payment_mode,
			sh.status,
			sh.note
		 FROM sales_header sh
		 LEFT JOIN customers c ON c.id = sh.customer_id
		 WHERE sh.user_id = ?
			AND (
				(? > 0 AND sh.id = ?)
				OR (? != '' AND sh.receipt_id = ?)
			)
		 LIMIT 1;`,
		userId,
		Number.isInteger(normalizedSaleId) ? normalizedSaleId : 0,
		Number.isInteger(normalizedSaleId) ? normalizedSaleId : 0,
		normalizedReceiptId,
		normalizedReceiptId
	);

	if (!header) {
		throw new Error('Sale receipt not found.');
	}

	const items = await db.getAllAsync(
		`SELECT
			si.id,
			si.product_id,
			p.name AS product_name,
			si.quantity,
			si.unit_price_cents,
			si.subtotal_cents,
			si.note
		 FROM sales_items si
		 JOIN products p ON p.id = si.product_id
		 WHERE si.user_id = ?
			AND si.sales_header_id = ?
		 ORDER BY si.id ASC;`,
		userId,
		Number(header.id)
	);

	const payments = await db.getAllAsync(
		`SELECT id, amount_cents, method, status, note, created_at
		 FROM payments
		 WHERE user_id = ?
			AND sales_header_id = ?
		 ORDER BY id ASC;`,
		userId,
		Number(header.id)
	);

	return {
		id: Number(header.id),
		receipt_id: String(header.receipt_id || ''),
		customer_id: header.customer_id === null || header.customer_id === undefined ? null : Number(header.customer_id),
		customer_name: header.customer_name || null,
		timestamp: header.timestamp || null,
		total_amount: fromMoneyCents(Number(header.total_amount_cents || 0)),
		payment_mode: String(header.payment_mode || '').trim().toUpperCase() || 'CASH',
		status: String(header.status || '').trim().toLowerCase() || 'posted',
		note: header.note || null,
		items: (items || []).map((item) => ({
			id: Number(item.id),
			product_id: Number(item.product_id),
			product_name: item.product_name || '',
			quantity: Number(item.quantity || 0),
			unit_price: fromMoneyCents(Number(item.unit_price_cents || 0)),
			subtotal: fromMoneyCents(Number(item.subtotal_cents || 0)),
			note: item.note || null,
		})),
		payments: (payments || []).map((payment) => ({
			id: Number(payment.id),
			amount: fromMoneyCents(Number(payment.amount_cents || 0)),
			method: String(payment.method || '').trim().toUpperCase() || 'CASH',
			status: String(payment.status || '').trim().toUpperCase() || 'PAID',
			note: payment.note || null,
			created_at: payment.created_at || null,
		})),
	};
};

export const validateSalesMovementConsistency = async ({ dateIso = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedDate = dateIso ? String(dateIso).slice(0, 10) : new Date().toISOString().slice(0, 10);

	const row = await db.getFirstAsync(
		`WITH sales_qty AS (
			SELECT COALESCE(SUM(si.quantity), 0) AS qty
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			WHERE sh.user_id = ?
				AND sh.status = 'posted'
				AND sh.deleted_at IS NULL
				AND DATE(sh.timestamp) = DATE(?)
		),
		movement_qty AS (
			SELECT COALESCE(SUM(ABS(quantity_delta)), 0) AS qty
			FROM stock_movements
			WHERE user_id = ?
				AND movement_type = 'out'
				AND stock_out_reason = 'SALE'
				AND DATE(created_at) = DATE(?)
		)
		SELECT
			(SELECT qty FROM sales_qty) AS sales_qty,
			(SELECT qty FROM movement_qty) AS movement_qty;`,
		userId,
		normalizedDate,
		userId,
		normalizedDate
	);

	const salesQty = Number(row?.sales_qty || 0);
	const movementQty = Number(row?.movement_qty || 0);

	return {
		date: normalizedDate,
		sales_quantity: salesQty,
		movement_sale_out_quantity: movementQty,
		is_consistent: salesQty === movementQty,
		difference: salesQty - movementQty,
	};
};

const generatePurchaseCode = async ({ userId, at = null }) => {
	const dateToken = buildReceiptDateToken(at);
	const prefix = `HSB-PO-${dateToken}`;
	const row = await db.getFirstAsync(
		`SELECT COUNT(1) AS total
		 FROM purchase_orders
		 WHERE user_id = ?
			AND purchase_code LIKE ?;`,
		userId,
		`${prefix}%`
	);

	const nextSequence = Math.max(1, Number(row?.total || 0) + 1);
	return `${prefix}-${String(nextSequence).padStart(5, '0')}`;
};

const normalizePurchaseItemsInput = (items = []) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error('At least one purchase item is required.');
	}

	return items.map((item, index) => {
		const productId = Number(item?.productId ?? item?.product_id);
		const orderedQty = Number(item?.orderedQty ?? item?.ordered_qty ?? item?.quantity);
		const unitCostCents = toMoneyCents(item?.unitCost ?? item?.unit_cost ?? item?.price);

		if (!Number.isInteger(productId) || productId <= 0) {
			throw new Error(`Invalid productId at purchase item index ${index}.`);
		}

		if (!Number.isInteger(orderedQty) || orderedQty <= 0) {
			throw new Error(`Invalid ordered quantity at purchase item index ${index}.`);
		}

		if (unitCostCents === null || unitCostCents < 0) {
			throw new Error(`Invalid unit cost at purchase item index ${index}.`);
		}

		return {
			productId,
			orderedQty,
			unitCostCents,
			subtotalCents: orderedQty * unitCostCents,
			note: typeof item?.note === 'string' ? item.note.trim() : null,
		};
	});
};

const normalizePurchaseReceiveInput = (items = []) => {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error('At least one receive item is required.');
	}

	return items.map((item, index) => {
		const purchaseItemId = Number(item?.purchaseItemId ?? item?.purchase_item_id ?? 0);
		const productId = Number(item?.productId ?? item?.product_id ?? 0);
		const quantity = Number(item?.quantity ?? item?.receivedQty ?? item?.received_qty);

		if ((!Number.isInteger(purchaseItemId) || purchaseItemId <= 0) && (!Number.isInteger(productId) || productId <= 0)) {
			throw new Error(`purchaseItemId or productId is required at receive item index ${index}.`);
		}

		if (!Number.isInteger(quantity) || quantity <= 0) {
			throw new Error(`Invalid receive quantity at index ${index}.`);
		}

		return {
			purchaseItemId: Number.isInteger(purchaseItemId) && purchaseItemId > 0 ? purchaseItemId : null,
			productId: Number.isInteger(productId) && productId > 0 ? productId : null,
			quantity,
		};
	});
};

const toPurchaseItemStatus = ({ orderedQty, receivedQty }) => {
	if (receivedQty <= 0) {
		return 'pending';
	}

	if (receivedQty >= orderedQty) {
		return 'received';
	}

	return 'partial';
};

export const listSuppliers = async ({ searchText = '', limit = 200 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
	const normalizedSearch = typeof searchText === 'string' ? searchText.trim().toLowerCase() : '';

	const params = [userId];
	let whereSql = 'WHERE user_id = ?';
	if (normalizedSearch) {
		whereSql += ` AND (
			LOWER(COALESCE(name, '')) LIKE ?
			OR LOWER(COALESCE(phone, '')) LIKE ?
			OR LOWER(COALESCE(address, '')) LIKE ?
		)`;
		params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`, `%${normalizedSearch}%`);
	}

	const rows = await db.getAllAsync(
		`SELECT id, name, phone, address, due_amount_cents, created_at, updated_at
		 FROM suppliers
		 ${whereSql}
		 ORDER BY due_amount_cents DESC, id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		name: String(row.name || ''),
		phone: row.phone || null,
		address: row.address || null,
		due_amount: fromMoneyCents(Number(row.due_amount_cents || 0)),
		created_at: row.created_at || null,
		updated_at: row.updated_at || null,
	}));
};

export const fetchSuppliers = (options = {}) => listSuppliers(options);

export const addSupplier = async ({ name, phone = null, address = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedName = String(name || '').trim();
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;
	const syncUpdatedAt = new Date().toISOString();

	if (!normalizedName) {
		throw new Error('Supplier name is required.');
	}

	const result = await db.runAsync(
		`INSERT INTO suppliers (
			user_id,
			name,
			phone,
			address,
			due_amount_cents,
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, 0, ?, 1, ?, NULL, ?, ?);`,
		userId,
		normalizedName,
		normalizedPhone || null,
		normalizedAddress || null,
		null,
		syncUpdatedAt,
		syncUpdatedAt,
		syncUpdatedAt
	);

	const localId = Number(result.lastInsertRowId);
	const clientRefId = buildLocalClientRefId({ entityType: 'supplier', localId });
	await db.runAsync(`UPDATE suppliers SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

	await enqueueEntitySyncChange({
		entityType: 'supplier',
		operation: 'upsert',
		localId,
		clientRefId,
		version: 1,
		updatedAt: syncUpdatedAt,
		data: {
			name: normalizedName,
			phone: normalizedPhone || null,
			address: normalizedAddress || null,
			dueAmount: 0,
			deletedAt: null,
		},
	});

	void logAudit({
		userId,
		entityType: 'supplier',
		entityId: localId,
		action: 'create',
		metadata: {
			new: {
				name: normalizedName,
				phone: normalizedPhone || null,
				address: normalizedAddress || null,
			},
		},
		notes: 'Supplier created',
	});

	return {
		id: localId,
		name: normalizedName,
		phone: normalizedPhone || null,
		address: normalizedAddress || null,
		due_amount: 0,
	};
};

export const updateSupplier = async ({ id, name, phone = null, address = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedId = Number(id);
	const normalizedName = String(name || '').trim();
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;
	const syncUpdatedAt = new Date().toISOString();

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		throw new Error('Valid supplier id is required.');
	}

	if (!normalizedName) {
		throw new Error('Supplier name is required.');
	}

	const existing = await db.getFirstAsync(
		`SELECT id, server_id, client_ref_id, sync_version, due_amount_cents
		 FROM suppliers
		 WHERE id = ? AND user_id = ?
		 LIMIT 1;`,
		normalizedId,
		userId
	);

	if (!existing) {
		throw new Error('Supplier not found.');
	}

	const nextSyncVersion = Number(existing.sync_version || 0) + 1;
	const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedId });

	await db.runAsync(
		`UPDATE suppliers
		 SET name = ?,
			 phone = ?,
			 address = ?,
			 client_ref_id = ?,
			 sync_version = ?,
			 sync_updated_at = ?,
			 deleted_at = NULL,
			 updated_at = ?
		 WHERE id = ? AND user_id = ?;`,
		normalizedName,
		normalizedPhone || null,
		normalizedAddress || null,
		clientRefId,
		nextSyncVersion,
		syncUpdatedAt,
		syncUpdatedAt,
		normalizedId,
		userId
	);

	await enqueueEntitySyncChange({
		entityType: 'supplier',
		operation: 'upsert',
		localId: normalizedId,
		clientRefId,
		serverId: existing.server_id || null,
		version: nextSyncVersion,
		updatedAt: syncUpdatedAt,
		data: {
			name: normalizedName,
			phone: normalizedPhone || null,
			address: normalizedAddress || null,
			dueAmount: fromMoneyCents(Number(existing.due_amount_cents || 0)),
			deletedAt: null,
		},
	});

	return {
		id: normalizedId,
		name: normalizedName,
		phone: normalizedPhone || null,
		address: normalizedAddress || null,
		due_amount: fromMoneyCents(Number(existing.due_amount_cents || 0)),
	};
};

export const deleteSupplier = async (id) => {
	const userId = await getActiveScopedUserId();
	const normalizedId = Number(id);
	const syncUpdatedAt = new Date().toISOString();

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		throw new Error('Valid supplier id is required.');
	}

	const existing = await db.getFirstAsync(
		`SELECT id, name, due_amount_cents, server_id, client_ref_id, sync_version
		 FROM suppliers
		 WHERE id = ? AND user_id = ?
		 LIMIT 1;`,
		normalizedId,
		userId
	);

	if (!existing) {
		throw new Error('Supplier not found.');
	}

	if (Number(existing.due_amount_cents || 0) > 0) {
		throw new Error('Supplier has unpaid due and cannot be deleted.');
	}

	const openOrder = await db.getFirstAsync(
		`SELECT id
		 FROM purchase_orders
		 WHERE user_id = ?
			AND supplier_id = ?
			AND status IN ('pending', 'partial')
		 LIMIT 1;`,
		userId,
		normalizedId
	);

	if (openOrder?.id) {
		throw new Error('Supplier has open purchase orders and cannot be deleted.');
	}

	const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedId });
	const nextSyncVersion = Number(existing.sync_version || 0) + 1;

	await db.runAsync(`DELETE FROM suppliers WHERE id = ? AND user_id = ?;`, normalizedId, userId);

	await enqueueEntitySyncChange({
		entityType: 'supplier',
		operation: 'delete',
		localId: normalizedId,
		clientRefId,
		serverId: existing.server_id || null,
		version: nextSyncVersion,
		updatedAt: syncUpdatedAt,
		data: {
			deletedAt: syncUpdatedAt,
		},
	});

	void logAudit({
		userId,
		entityType: 'supplier',
		entityId: normalizedId,
		action: 'delete',
		notes: `Supplier deleted: ${String(existing.name || '')}`,
	});

	return { id: normalizedId };
};

export const createPurchaseOrder = async ({
	supplierId,
	items = [],
	note = null,
	purchaseDate = null,
	paidAmount = 0,
	paymentMethod = 'CASH',
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedSupplierId = Number(supplierId);
	const normalizedItems = normalizePurchaseItemsInput(items);
	const normalizedPurchaseDate = purchaseDate ? new Date(purchaseDate) : new Date();
	const paidAmountCents = toMoneyCents(paidAmount);

	if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) {
		throw new Error('Valid supplierId is required.');
	}

	if (Number.isNaN(normalizedPurchaseDate.getTime())) {
		throw new Error('Valid purchaseDate is required.');
	}

	if (paidAmountCents === null || paidAmountCents < 0) {
		throw new Error('Valid paidAmount is required.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const supplier = await db.getFirstAsync(
			`SELECT id, name, phone, address, due_amount_cents, server_id, client_ref_id, sync_version
			 FROM suppliers
			 WHERE id = ? AND user_id = ?
			 LIMIT 1;`,
			normalizedSupplierId,
			userId
		);

		if (!supplier) {
			throw new Error('Supplier not found.');
		}

		const enrichedItems = [];
		for (const item of normalizedItems) {
			const product = await db.getFirstAsync(
				`SELECT id, name, quantity, price, expiry_date, low_stock_threshold, server_id, client_ref_id
				 FROM products
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				item.productId,
				userId
			);

			if (!product) {
				throw new Error(`Product ${item.productId} not found for purchase order.`);
			}

			enrichedItems.push({
				...item,
				product,
			});
		}

		const totalAmountCents = enrichedItems.reduce((sum, item) => sum + item.subtotalCents, 0);
		if (paidAmountCents > totalAmountCents) {
			throw new Error('paidAmount cannot exceed purchase total.');
		}

		const dueAmountCents = totalAmountCents - paidAmountCents;
		const purchaseAtIso = normalizedPurchaseDate.toISOString();
		const purchaseCode = await generatePurchaseCode({ userId, at: normalizedPurchaseDate });

		const orderInsert = await db.runAsync(
			`INSERT INTO purchase_orders (
				user_id,
				supplier_id,
				purchase_code,
				purchase_date,
				total_amount_cents,
				paid_amount_cents,
				due_amount_cents,
				status,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1, ?, NULL, ?, ?);`,
			userId,
			normalizedSupplierId,
			purchaseCode,
			purchaseAtIso,
			totalAmountCents,
			paidAmountCents,
			dueAmountCents,
			typeof note === 'string' ? note.trim() : null,
			null,
			purchaseAtIso,
			purchaseAtIso,
			purchaseAtIso
		);

		const purchaseOrderId = Number(orderInsert.lastInsertRowId);
		const purchaseOrderClientRefId = buildLocalClientRefId({ entityType: 'purchase_order', localId: purchaseOrderId });
		await db.runAsync(
			`UPDATE purchase_orders SET client_ref_id = ? WHERE id = ?;`,
			purchaseOrderClientRefId,
			purchaseOrderId
		);

		await enqueueEntitySyncChange({
			entityType: 'purchase_order',
			operation: 'upsert',
			localId: purchaseOrderId,
			clientRefId: purchaseOrderClientRefId,
			version: 1,
			updatedAt: purchaseAtIso,
			data: {
				supplierId: normalizedSupplierId,
				supplierServerId: supplier.server_id || null,
				supplierClientRefId: supplier.client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId }),
				purchaseCode,
				purchaseDate: purchaseAtIso,
				totalAmount: fromMoneyCents(totalAmountCents),
				paidAmount: fromMoneyCents(paidAmountCents),
				dueAmount: fromMoneyCents(dueAmountCents),
				status: 'pending',
				note: typeof note === 'string' ? note.trim() : null,
				deletedAt: null,
			},
		});

		const createdItems = [];
		for (const item of enrichedItems) {
			const itemInsert = await db.runAsync(
				`INSERT INTO purchase_items (
					user_id,
					purchase_order_id,
					product_id,
					ordered_qty,
					received_qty,
					pending_qty,
					unit_cost_cents,
					subtotal_cents,
					status,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'pending', ?, ?, 1, ?, NULL, ?, ?);`,
				userId,
				purchaseOrderId,
				item.productId,
				item.orderedQty,
				item.orderedQty,
				item.unitCostCents,
				item.subtotalCents,
				item.note || null,
				null,
				purchaseAtIso,
				purchaseAtIso,
				purchaseAtIso
			);

			const purchaseItemId = Number(itemInsert.lastInsertRowId);
			const purchaseItemClientRefId = buildLocalClientRefId({ entityType: 'purchase_item', localId: purchaseItemId });
			await db.runAsync(`UPDATE purchase_items SET client_ref_id = ? WHERE id = ?;`, purchaseItemClientRefId, purchaseItemId);

			await enqueueEntitySyncChange({
				entityType: 'purchase_item',
				operation: 'upsert',
				localId: purchaseItemId,
				clientRefId: purchaseItemClientRefId,
				version: 1,
				updatedAt: purchaseAtIso,
				data: {
					purchaseOrderId,
					purchaseOrderClientRefId,
					productId: item.productId,
					productServerId: item.product.server_id || null,
					productClientRefId: item.product.client_ref_id || buildLocalClientRefId({ entityType: 'product', localId: item.productId }),
					orderedQty: item.orderedQty,
					receivedQty: 0,
					pendingQty: item.orderedQty,
					unitCost: fromMoneyCents(item.unitCostCents),
					subtotal: fromMoneyCents(item.subtotalCents),
					status: 'pending',
					note: item.note || null,
					deletedAt: null,
				},
			});

			createdItems.push({
				id: purchaseItemId,
				product_id: item.productId,
				product_name: String(item.product.name || ''),
				ordered_qty: item.orderedQty,
				received_qty: 0,
				pending_qty: item.orderedQty,
				unit_cost: fromMoneyCents(item.unitCostCents),
				subtotal: fromMoneyCents(item.subtotalCents),
			});
		}

		const supplierDueBefore = Number(supplier.due_amount_cents || 0);
		const creditRunningDue = supplierDueBefore + totalAmountCents;
		const creditInsert = await db.runAsync(
			`INSERT INTO supplier_payables (
				user_id,
				supplier_id,
				purchase_order_id,
				entry_type,
				amount_cents,
				running_due_cents,
				payment_method,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at
			)
			VALUES (?, ?, ?, 'credit', ?, ?, NULL, ?, ?, 1, ?, NULL, ?);`,
			userId,
			normalizedSupplierId,
			purchaseOrderId,
			totalAmountCents,
			creditRunningDue,
			`PO ${purchaseCode}`,
			null,
			purchaseAtIso,
			purchaseAtIso
		);

		const creditPayableId = Number(creditInsert.lastInsertRowId);
		const creditClientRefId = buildLocalClientRefId({ entityType: 'supplier_payable', localId: creditPayableId });
		await db.runAsync(`UPDATE supplier_payables SET client_ref_id = ? WHERE id = ?;`, creditClientRefId, creditPayableId);

		await enqueueEntitySyncChange({
			entityType: 'supplier_payable',
			operation: 'upsert',
			localId: creditPayableId,
			clientRefId: creditClientRefId,
			version: 1,
			updatedAt: purchaseAtIso,
			data: {
				supplierId: normalizedSupplierId,
				supplierServerId: supplier.server_id || null,
				supplierClientRefId: supplier.client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId }),
				purchaseOrderId,
				purchaseOrderClientRefId,
				entryType: 'credit',
				amount: fromMoneyCents(totalAmountCents),
				runningDue: fromMoneyCents(creditRunningDue),
				paymentMethod: null,
				note: `PO ${purchaseCode}`,
				occurredAt: purchaseAtIso,
				deletedAt: null,
			},
		});

		let supplierDueAfter = creditRunningDue;
		if (paidAmountCents > 0) {
			supplierDueAfter = creditRunningDue - paidAmountCents;
			const paymentInsert = await db.runAsync(
				`INSERT INTO supplier_payables (
					user_id,
					supplier_id,
					purchase_order_id,
					entry_type,
					amount_cents,
					running_due_cents,
					payment_method,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, 1, ?, NULL, ?);`,
				userId,
				normalizedSupplierId,
				purchaseOrderId,
				paidAmountCents,
				supplierDueAfter,
				normalizePaymentMethod(paymentMethod, 'CASH'),
				`Advance payment for ${purchaseCode}`,
				null,
				purchaseAtIso,
				purchaseAtIso
			);

			const paymentPayableId = Number(paymentInsert.lastInsertRowId);
			const paymentClientRefId = buildLocalClientRefId({ entityType: 'supplier_payable', localId: paymentPayableId });
			await db.runAsync(`UPDATE supplier_payables SET client_ref_id = ? WHERE id = ?;`, paymentClientRefId, paymentPayableId);

			await enqueueEntitySyncChange({
				entityType: 'supplier_payable',
				operation: 'upsert',
				localId: paymentPayableId,
				clientRefId: paymentClientRefId,
				version: 1,
				updatedAt: purchaseAtIso,
				data: {
					supplierId: normalizedSupplierId,
					supplierServerId: supplier.server_id || null,
					supplierClientRefId: supplier.client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId }),
					purchaseOrderId,
					purchaseOrderClientRefId,
					entryType: 'payment',
					amount: fromMoneyCents(paidAmountCents),
					runningDue: fromMoneyCents(supplierDueAfter),
					paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
					note: `Advance payment for ${purchaseCode}`,
					occurredAt: purchaseAtIso,
					deletedAt: null,
				},
			});

			await insertCashbookEntryTx({
				userId,
				entryType: 'OUT',
				amountCents: paidAmountCents,
				paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
				category: 'PURCHASE_PAYMENT',
				referenceType: 'supplier_payable',
				referenceLocalId: paymentPayableId,
				referenceClientRefId: paymentClientRefId,
				note: `Advance payment for ${purchaseCode}`,
				occurredAt: purchaseAtIso,
				syncUpdatedAt: purchaseAtIso,
			});
		}

		const supplierClientRefId = String(supplier.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId });
		await db.runAsync(
			`UPDATE suppliers
			 SET due_amount_cents = ?,
				 client_ref_id = ?,
				 sync_version = COALESCE(sync_version, 0) + 1,
				 sync_updated_at = ?,
				 updated_at = ?
			 WHERE id = ? AND user_id = ?;`,
			supplierDueAfter,
			supplierClientRefId,
			purchaseAtIso,
			purchaseAtIso,
			normalizedSupplierId,
			userId
		);

		const supplierSyncRow = await db.getFirstAsync(
			`SELECT sync_version FROM suppliers WHERE id = ? AND user_id = ? LIMIT 1;`,
			normalizedSupplierId,
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'supplier',
			operation: 'upsert',
			localId: normalizedSupplierId,
			clientRefId: supplierClientRefId,
			serverId: supplier.server_id || null,
			version: Number(supplierSyncRow?.sync_version || 1),
			updatedAt: purchaseAtIso,
			data: {
				name: String(supplier.name || ''),
				phone: supplier.phone || null,
				address: supplier.address || null,
				dueAmount: fromMoneyCents(supplierDueAfter),
				deletedAt: null,
			},
		});

		void logAudit({
			userId,
			entityType: 'purchase_order',
			entityId: purchaseOrderId,
			action: 'create',
			metadata: {
				purchase_code: purchaseCode,
				total_amount_cents: totalAmountCents,
				paid_amount_cents: paidAmountCents,
				item_count: createdItems.length,
			},
			notes: 'Purchase order created',
		});

		await db.execAsync('COMMIT;');

		return {
			id: purchaseOrderId,
			purchase_code: purchaseCode,
			supplier_id: normalizedSupplierId,
			purchase_date: purchaseAtIso,
			total_amount: fromMoneyCents(totalAmountCents),
			paid_amount: fromMoneyCents(paidAmountCents),
			due_amount: fromMoneyCents(dueAmountCents),
			status: 'pending',
			items: createdItems,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const getPurchaseHistory = async ({
	limit = 100,
	fromDateIso = null,
	toDateIso = null,
	supplierId = null,
	status = null,
	searchText = '',
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
	const normalizedSupplierId = Number(supplierId);
	const normalizedStatus = String(status || '').trim().toLowerCase();
	const normalizedSearchText = String(searchText || '').trim().toLowerCase();

	const where = ['po.user_id = ?'];
	const params = [userId];

	if (fromDateIso) {
		where.push('datetime(po.purchase_date) >= datetime(?)');
		params.push(String(fromDateIso));
	}

	if (toDateIso) {
		where.push('datetime(po.purchase_date) <= datetime(?)');
		params.push(String(toDateIso));
	}

	if (Number.isInteger(normalizedSupplierId) && normalizedSupplierId > 0) {
		where.push('po.supplier_id = ?');
		params.push(normalizedSupplierId);
	}

	if (normalizedStatus === 'open') {
		where.push(`po.status IN ('pending', 'partial')`);
	} else if (normalizedStatus && PURCHASE_STATUSES.has(normalizedStatus)) {
		where.push('po.status = ?');
		params.push(normalizedStatus);
	}

	if (normalizedSearchText) {
		where.push(`(
			LOWER(COALESCE(po.purchase_code, '')) LIKE ?
			OR LOWER(COALESCE(po.note, '')) LIKE ?
			OR LOWER(COALESCE(s.name, '')) LIKE ?
		)`);
		params.push(`%${normalizedSearchText}%`, `%${normalizedSearchText}%`, `%${normalizedSearchText}%`);
	}

	const rows = await db.getAllAsync(
		`SELECT
			po.id,
			po.purchase_code,
			po.supplier_id,
			s.name AS supplier_name,
			po.purchase_date,
			po.total_amount_cents,
			po.paid_amount_cents,
			po.due_amount_cents,
			po.status,
			po.note,
			COUNT(pi.id) AS item_count,
			COALESCE(SUM(pi.ordered_qty), 0) AS ordered_qty_total,
			COALESCE(SUM(pi.received_qty), 0) AS received_qty_total
		 FROM purchase_orders po
		 JOIN suppliers s ON s.id = po.supplier_id
		 LEFT JOIN purchase_items pi ON pi.purchase_order_id = po.id
		 WHERE ${where.join(' AND ')}
		 GROUP BY po.id
		 ORDER BY datetime(po.purchase_date) DESC, po.id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		purchase_code: String(row.purchase_code || ''),
		supplier_id: Number(row.supplier_id),
		supplier_name: String(row.supplier_name || ''),
		purchase_date: row.purchase_date || null,
		total_amount: fromMoneyCents(Number(row.total_amount_cents || 0)),
		paid_amount: fromMoneyCents(Number(row.paid_amount_cents || 0)),
		due_amount: fromMoneyCents(Number(row.due_amount_cents || 0)),
		status: normalizePurchaseStatus(row.status, 'pending'),
		note: row.note || null,
		item_count: Number(row.item_count || 0),
		ordered_qty_total: Number(row.ordered_qty_total || 0),
		received_qty_total: Number(row.received_qty_total || 0),
	}));
};

export const getOpenPurchaseOrders = async ({ limit = 100 } = {}) => {
	return getPurchaseHistory({
		limit,
		status: 'open',
	});
};

export const getPurchaseOrderDetails = async ({ purchaseOrderId }) => {
	const userId = await getActiveScopedUserId();
	const normalizedPurchaseOrderId = Number(purchaseOrderId);

	if (!Number.isInteger(normalizedPurchaseOrderId) || normalizedPurchaseOrderId <= 0) {
		throw new Error('Valid purchaseOrderId is required.');
	}

	const header = await db.getFirstAsync(
		`SELECT
			po.id,
			po.purchase_code,
			po.supplier_id,
			s.name AS supplier_name,
			s.phone AS supplier_phone,
			s.address AS supplier_address,
			po.purchase_date,
			po.total_amount_cents,
			po.paid_amount_cents,
			po.due_amount_cents,
			po.status,
			po.note,
			po.client_ref_id,
			po.server_id
		 FROM purchase_orders po
		 JOIN suppliers s ON s.id = po.supplier_id
		 WHERE po.id = ? AND po.user_id = ?
		 LIMIT 1;`,
		normalizedPurchaseOrderId,
		userId
	);

	if (!header) {
		throw new Error('Purchase order not found.');
	}

	const items = await db.getAllAsync(
		`SELECT
			pi.id,
			pi.product_id,
			p.name AS product_name,
			pi.ordered_qty,
			pi.received_qty,
			pi.pending_qty,
			pi.unit_cost_cents,
			pi.subtotal_cents,
			pi.status,
			pi.note,
			pi.client_ref_id,
			pi.server_id
		 FROM purchase_items pi
		 JOIN products p ON p.id = pi.product_id
		 WHERE pi.user_id = ?
			AND pi.purchase_order_id = ?
		 ORDER BY pi.id ASC;`,
		userId,
		normalizedPurchaseOrderId
	);

	return {
		id: Number(header.id),
		purchase_code: String(header.purchase_code || ''),
		supplier_id: Number(header.supplier_id),
		supplier_name: String(header.supplier_name || ''),
		supplier_phone: header.supplier_phone || null,
		supplier_address: header.supplier_address || null,
		purchase_date: header.purchase_date || null,
		total_amount: fromMoneyCents(Number(header.total_amount_cents || 0)),
		paid_amount: fromMoneyCents(Number(header.paid_amount_cents || 0)),
		due_amount: fromMoneyCents(Number(header.due_amount_cents || 0)),
		status: normalizePurchaseStatus(header.status, 'pending'),
		note: header.note || null,
		client_ref_id: header.client_ref_id || null,
		server_id: header.server_id || null,
		items: (items || []).map((item) => ({
			id: Number(item.id),
			product_id: Number(item.product_id),
			product_name: String(item.product_name || ''),
			ordered_qty: Number(item.ordered_qty || 0),
			received_qty: Number(item.received_qty || 0),
			pending_qty: Number(item.pending_qty || 0),
			unit_cost: fromMoneyCents(Number(item.unit_cost_cents || 0)),
			subtotal: fromMoneyCents(Number(item.subtotal_cents || 0)),
			status: String(item.status || 'pending'),
			note: item.note || null,
			client_ref_id: item.client_ref_id || null,
			server_id: item.server_id || null,
		})),
	};
};

export const receivePurchaseItems = async ({
	purchaseOrderId,
	items = [],
	note = null,
	receivedAt = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedPurchaseOrderId = Number(purchaseOrderId);
	const normalizedItems = normalizePurchaseReceiveInput(items);
	const receiveAt = receivedAt ? new Date(receivedAt) : new Date();

	if (!Number.isInteger(normalizedPurchaseOrderId) || normalizedPurchaseOrderId <= 0) {
		throw new Error('Valid purchaseOrderId is required.');
	}

	if (Number.isNaN(receiveAt.getTime())) {
		throw new Error('Valid receivedAt is required.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const orderRow = await db.getFirstAsync(
			`SELECT
				po.id,
				po.purchase_code,
				po.supplier_id,
				po.purchase_date,
				po.total_amount_cents,
				po.paid_amount_cents,
				po.due_amount_cents,
				po.status,
				po.note,
				po.client_ref_id,
				po.server_id,
				po.sync_version,
				s.server_id AS supplier_server_id,
				s.client_ref_id AS supplier_client_ref_id
			 FROM purchase_orders po
			 JOIN suppliers s ON s.id = po.supplier_id
			 WHERE po.id = ? AND po.user_id = ?
			 LIMIT 1;`,
			normalizedPurchaseOrderId,
			userId
		);

		if (!orderRow) {
			throw new Error('Purchase order not found.');
		}

		if (String(orderRow.status || '').trim().toLowerCase() === 'cancelled') {
			throw new Error('Cancelled purchase order cannot receive stock.');
		}

		const orderItems = await db.getAllAsync(
			`SELECT
				pi.id,
				pi.product_id,
				pi.ordered_qty,
				pi.received_qty,
				pi.pending_qty,
				pi.unit_cost_cents,
				pi.subtotal_cents,
				pi.status,
				pi.note,
				pi.server_id,
				pi.client_ref_id,
				pi.sync_version,
				p.name AS product_name,
				p.quantity AS product_quantity,
				p.price AS product_price,
				p.low_stock_threshold,
				p.expiry_date,
				p.server_id AS product_server_id,
				p.client_ref_id AS product_client_ref_id,
				p.sync_version AS product_sync_version
			 FROM purchase_items pi
			 JOIN products p ON p.id = pi.product_id
			 WHERE pi.user_id = ?
				AND pi.purchase_order_id = ?
			 ORDER BY pi.id ASC;`,
			userId,
			normalizedPurchaseOrderId
		);

		if (!orderItems.length) {
			throw new Error('Purchase order has no items.');
		}

		const byId = new Map(orderItems.map((row) => [Number(row.id), row]));
		const byProductId = new Map(orderItems.map((row) => [Number(row.product_id), row]));
		const receiveAtIso = receiveAt.toISOString();
		const updatedItems = [];
		const touchedProductIds = new Set();

		for (const incoming of normalizedItems) {
			const matched = incoming.purchaseItemId
				? byId.get(Number(incoming.purchaseItemId))
				: byProductId.get(Number(incoming.productId));

			if (!matched) {
				throw new Error('Receive item does not match this purchase order.');
			}

			const currentOrdered = Number(matched.ordered_qty || 0);
			const currentReceived = Number(matched.received_qty || 0);
			const currentPending = Number(matched.pending_qty || 0);

			if (currentPending <= 0) {
				continue;
			}

			if (incoming.quantity > currentPending) {
				throw new Error(`Received quantity exceeds pending quantity for ${String(matched.product_name || 'item')}.`);
			}

			const nextReceived = currentReceived + incoming.quantity;
			const nextPending = currentOrdered - nextReceived;
			const nextStatus = toPurchaseItemStatus({ orderedQty: currentOrdered, receivedQty: nextReceived });
			const nextItemVersion = Number(matched.sync_version || 0) + 1;

			await db.runAsync(
				`UPDATE purchase_items
				 SET received_qty = ?,
					 pending_qty = ?,
					 status = ?,
					 sync_version = ?,
					 sync_updated_at = ?,
					 updated_at = ?
				 WHERE id = ? AND user_id = ?;`,
				nextReceived,
				nextPending,
				nextStatus,
				nextItemVersion,
				receiveAtIso,
				receiveAtIso,
				Number(matched.id),
				userId
			);

			const productLocalId = Number(matched.product_id);
			const productQuantityBefore = Number(matched.product_quantity || 0);
			const productQuantityAfter = productQuantityBefore + incoming.quantity;
			const productClientRefId = String(matched.product_client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'product', localId: productLocalId });

			await db.runAsync(
				`UPDATE products
				 SET quantity = ?,
					 client_ref_id = ?,
					 sync_version = COALESCE(sync_version, 0) + 1,
					 sync_updated_at = ?
				 WHERE id = ? AND user_id = ?;`,
				productQuantityAfter,
				productClientRefId,
				receiveAtIso,
				productLocalId,
				userId
			);

			const productSyncRow = await db.getFirstAsync(
				`SELECT sync_version, server_id, price, low_stock_threshold, expiry_date, name
				 FROM products
				 WHERE id = ? AND user_id = ?
				 LIMIT 1;`,
				productLocalId,
				userId
			);

			await createInventoryBatchTx({
				userId,
				productId: productLocalId,
				quantity: incoming.quantity,
				batchNumber: null,
				expiryDate: matched.expiry_date || null,
				purchaseDate: receiveAtIso,
				costPriceCents: Number(matched.unit_cost_cents || 0),
				syncUpdatedAt: receiveAtIso,
				sourceEventType: 'purchase',
				sourceEventId: normalizedPurchaseOrderId,
				sourceEventClientRefId: orderRow.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_order', localId: normalizedPurchaseOrderId }),
			});

			touchedProductIds.add(productLocalId);

			const movementInsert = await db.runAsync(
				`INSERT INTO stock_movements (
					user_id,
					product_id,
					movement_type,
					stock_out_reason,
					quantity_delta,
					quantity_before,
					quantity_after,
					source_event_type,
					source_event_id,
					note,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at
				)
				VALUES (?, ?, 'in', NULL, ?, ?, ?, 'purchase', ?, ?, ?, 1, ?, NULL, ?);`,
				userId,
				productLocalId,
				incoming.quantity,
				productQuantityBefore,
				productQuantityAfter,
				normalizedPurchaseOrderId,
				typeof note === 'string' && note.trim()
					? note.trim()
					: `PURCHASE ${String(orderRow.purchase_code || '')}`,
				null,
				receiveAtIso,
				receiveAtIso
			);

			const movementId = Number(movementInsert.lastInsertRowId);
			const movementClientRefId = buildLocalClientRefId({ entityType: 'inventory_movement', localId: movementId });
			await db.runAsync(`UPDATE stock_movements SET client_ref_id = ? WHERE id = ?;`, movementClientRefId, movementId);

			await enqueueEntitySyncChange({
				entityType: 'inventory_movement',
				operation: 'upsert',
				localId: movementId,
				clientRefId: movementClientRefId,
				version: 1,
				updatedAt: receiveAtIso,
				data: {
					movementType: 'in',
					stockOutReason: null,
					quantityDelta: incoming.quantity,
					quantityBefore: productQuantityBefore,
					quantityAfter: productQuantityAfter,
					note: typeof note === 'string' && note.trim()
						? note.trim()
						: `PURCHASE ${String(orderRow.purchase_code || '')}`,
					sourceEventType: 'purchase',
					sourceEventId: normalizedPurchaseOrderId,
					sourceEventClientRefId: orderRow.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_order', localId: normalizedPurchaseOrderId }),
					productId: productLocalId,
					productServerId: matched.product_server_id || null,
					productClientRefId,
					occurredAt: receiveAtIso,
					deletedAt: null,
				},
			});

			await enqueueEntitySyncChange({
				entityType: 'product',
				operation: 'upsert',
				localId: productLocalId,
				clientRefId: productClientRefId,
				serverId: productSyncRow?.server_id || matched.product_server_id || null,
				version: Number(productSyncRow?.sync_version || 1),
				updatedAt: receiveAtIso,
				data: {
					name: String(productSyncRow?.name || matched.product_name || ''),
					quantity: productQuantityAfter,
					price: Number(productSyncRow?.price || matched.product_price || 0),
					lowStockThreshold: Number(productSyncRow?.low_stock_threshold || matched.low_stock_threshold || 5),
					expiryDate: productSyncRow?.expiry_date || matched.expiry_date || null,
					deletedAt: null,
				},
			});

			await enqueueEntitySyncChange({
				entityType: 'purchase_item',
				operation: 'upsert',
				localId: Number(matched.id),
				clientRefId: matched.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_item', localId: Number(matched.id) }),
				serverId: matched.server_id || null,
				version: nextItemVersion,
				updatedAt: receiveAtIso,
				data: {
					purchaseOrderId: normalizedPurchaseOrderId,
					purchaseOrderServerId: orderRow.server_id || null,
					purchaseOrderClientRefId: orderRow.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_order', localId: normalizedPurchaseOrderId }),
					productId: productLocalId,
					productServerId: matched.product_server_id || null,
					productClientRefId,
					orderedQty: currentOrdered,
					receivedQty: nextReceived,
					pendingQty: nextPending,
					unitCost: fromMoneyCents(Number(matched.unit_cost_cents || 0)),
					subtotal: fromMoneyCents(Number(matched.subtotal_cents || 0)),
					status: nextStatus,
					note: matched.note || null,
					deletedAt: null,
				},
			});

			updatedItems.push({
				id: Number(matched.id),
				product_id: productLocalId,
				product_name: String(matched.product_name || ''),
				received_now: incoming.quantity,
				received_qty: nextReceived,
				pending_qty: nextPending,
			});
		}

		if (!updatedItems.length) {
			throw new Error('No pending quantity left to receive for selected items.');
		}

		const totals = await db.getFirstAsync(
			`SELECT
				COALESCE(SUM(ordered_qty), 0) AS ordered_qty,
				COALESCE(SUM(received_qty), 0) AS received_qty
			 FROM purchase_items
			 WHERE user_id = ?
				AND purchase_order_id = ?;`,
			userId,
			normalizedPurchaseOrderId
		);

		const orderedQtyTotal = Number(totals?.ordered_qty || 0);
		const receivedQtyTotal = Number(totals?.received_qty || 0);
		const nextOrderStatus = receivedQtyTotal <= 0
			? 'pending'
			: receivedQtyTotal >= orderedQtyTotal
				? 'received'
				: 'partial';
		const nextOrderVersion = Number(orderRow.sync_version || 0) + 1;

		await db.runAsync(
			`UPDATE purchase_orders
			 SET status = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 updated_at = ?
			 WHERE id = ? AND user_id = ?;`,
			nextOrderStatus,
			nextOrderVersion,
			receiveAtIso,
			receiveAtIso,
			normalizedPurchaseOrderId,
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'purchase_order',
			operation: 'upsert',
			localId: normalizedPurchaseOrderId,
			clientRefId: orderRow.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_order', localId: normalizedPurchaseOrderId }),
			serverId: orderRow.server_id || null,
			version: nextOrderVersion,
			updatedAt: receiveAtIso,
			data: {
				supplierId: Number(orderRow.supplier_id),
				supplierServerId: orderRow.supplier_server_id || null,
				supplierClientRefId: orderRow.supplier_client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: Number(orderRow.supplier_id) }),
				purchaseCode: String(orderRow.purchase_code || ''),
				purchaseDate: orderRow.purchase_date || receiveAtIso,
				totalAmount: fromMoneyCents(Number(orderRow.total_amount_cents || 0)),
				paidAmount: fromMoneyCents(Number(orderRow.paid_amount_cents || 0)),
				dueAmount: fromMoneyCents(Number(orderRow.due_amount_cents || 0)),
				status: nextOrderStatus,
				note: orderRow.note || null,
				deletedAt: null,
			},
		});

		for (const touchedProductId of touchedProductIds) {
			const consistency = await validateInventoryBatchConsistencyTx({
				userId,
				productId: touchedProductId,
			});

			if (!consistency.is_consistent) {
				throw new Error('Batch quantity mismatch detected during goods receiving.');
			}
		}

		await refreshInventoryAlertsTx({ userId, syncUpdatedAt: receiveAtIso });

		void logAudit({
			userId,
			entityType: 'purchase_receive',
			entityId: normalizedPurchaseOrderId,
			action: 'create',
			metadata: {
				purchase_code: String(orderRow.purchase_code || ''),
				received_items: updatedItems.length,
				received_total_qty: updatedItems.reduce((sum, row) => sum + Number(row.received_now || 0), 0),
			},
			notes: 'Goods received and stock moved in',
		});

		await db.execAsync('COMMIT;');

		return {
			purchase_order_id: normalizedPurchaseOrderId,
			purchase_code: String(orderRow.purchase_code || ''),
			status: nextOrderStatus,
			updated_items: updatedItems,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const recordSupplierPayment = async ({
	supplierId,
	amount,
	purchaseOrderId = null,
	paymentMethod = 'CASH',
	note = null,
	paidAt = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedSupplierId = Number(supplierId);
	const normalizedPurchaseOrderId = purchaseOrderId === null || purchaseOrderId === undefined || purchaseOrderId === ''
		? null
		: Number(purchaseOrderId);
	const amountCents = toMoneyCents(amount);
	const paidDate = paidAt ? new Date(paidAt) : new Date();

	if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) {
		throw new Error('Valid supplierId is required.');
	}

	if (amountCents === null || amountCents <= 0) {
		throw new Error('Valid payment amount is required.');
	}

	if (normalizedPurchaseOrderId !== null && (!Number.isInteger(normalizedPurchaseOrderId) || normalizedPurchaseOrderId <= 0)) {
		throw new Error('purchaseOrderId must be a positive integer when provided.');
	}

	if (Number.isNaN(paidDate.getTime())) {
		throw new Error('Valid paidAt timestamp is required.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const supplier = await db.getFirstAsync(
			`SELECT id, name, phone, address, due_amount_cents, server_id, client_ref_id, sync_version
			 FROM suppliers
			 WHERE id = ? AND user_id = ?
			 LIMIT 1;`,
			normalizedSupplierId,
			userId
		);

		if (!supplier) {
			throw new Error('Supplier not found.');
		}

		const supplierDueBefore = Number(supplier.due_amount_cents || 0);
		if (supplierDueBefore <= 0) {
			throw new Error('Supplier has no due to pay.');
		}

		if (amountCents > supplierDueBefore) {
			throw new Error('Payment amount exceeds supplier outstanding due.');
		}

		let purchaseOrder = null;
		if (normalizedPurchaseOrderId !== null) {
			purchaseOrder = await db.getFirstAsync(
				`SELECT
					id,
					purchase_code,
					total_amount_cents,
					paid_amount_cents,
					due_amount_cents,
					status,
					note,
					purchase_date,
					sync_version,
					server_id,
					client_ref_id
				 FROM purchase_orders
				 WHERE id = ?
					AND supplier_id = ?
					AND user_id = ?
				 LIMIT 1;`,
				normalizedPurchaseOrderId,
				normalizedSupplierId,
				userId
			);

			if (!purchaseOrder) {
				throw new Error('Referenced purchase order not found for supplier.');
			}

			if (String(purchaseOrder.status || '').trim().toLowerCase() === 'cancelled') {
				throw new Error('Cannot record payment against a cancelled purchase order.');
			}

			if (amountCents > Number(purchaseOrder.due_amount_cents || 0)) {
				throw new Error('Payment amount exceeds selected purchase order due.');
			}
		}

		const paidAtIso = paidDate.toISOString();
		const supplierDueAfter = supplierDueBefore - amountCents;
		const payableInsert = await db.runAsync(
			`INSERT INTO supplier_payables (
				user_id,
				supplier_id,
				purchase_order_id,
				entry_type,
				amount_cents,
				running_due_cents,
				payment_method,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at
			)
			VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, 1, ?, NULL, ?);`,
			userId,
			normalizedSupplierId,
			purchaseOrder ? Number(purchaseOrder.id) : null,
			amountCents,
			supplierDueAfter,
			normalizePaymentMethod(paymentMethod, 'CASH'),
			typeof note === 'string' ? note.trim() : null,
			null,
			paidAtIso,
			paidAtIso
		);

		const supplierPayableId = Number(payableInsert.lastInsertRowId);
		const supplierPayableClientRefId = buildLocalClientRefId({ entityType: 'supplier_payable', localId: supplierPayableId });
		await db.runAsync(
			`UPDATE supplier_payables SET client_ref_id = ? WHERE id = ?;`,
			supplierPayableClientRefId,
			supplierPayableId
		);

		await enqueueEntitySyncChange({
			entityType: 'supplier_payable',
			operation: 'upsert',
			localId: supplierPayableId,
			clientRefId: supplierPayableClientRefId,
			version: 1,
			updatedAt: paidAtIso,
			data: {
				supplierId: normalizedSupplierId,
				supplierServerId: supplier.server_id || null,
				supplierClientRefId: supplier.client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId }),
				purchaseOrderId: purchaseOrder ? Number(purchaseOrder.id) : null,
				purchaseOrderServerId: purchaseOrder?.server_id || null,
				purchaseOrderClientRefId: purchaseOrder?.client_ref_id || (purchaseOrder ? buildLocalClientRefId({ entityType: 'purchase_order', localId: Number(purchaseOrder.id) }) : null),
				entryType: normalizeSupplierPayableType('payment'),
				amount: fromMoneyCents(amountCents),
				runningDue: fromMoneyCents(supplierDueAfter),
				paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
				note: typeof note === 'string' ? note.trim() : null,
				occurredAt: paidAtIso,
				deletedAt: null,
			},
		});

		await insertCashbookEntryTx({
			userId,
			entryType: 'OUT',
			amountCents,
			paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
			category: 'PURCHASE_PAYMENT',
			referenceType: 'supplier_payable',
			referenceLocalId: supplierPayableId,
			referenceClientRefId: supplierPayableClientRefId,
			note: typeof note === 'string' ? note.trim() : `Supplier payment for #${normalizedSupplierId}`,
			occurredAt: paidAtIso,
			syncUpdatedAt: paidAtIso,
		});

		const supplierClientRefId = String(supplier.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId });
		await db.runAsync(
			`UPDATE suppliers
			 SET due_amount_cents = ?,
				 client_ref_id = ?,
				 sync_version = COALESCE(sync_version, 0) + 1,
				 sync_updated_at = ?,
				 updated_at = ?
			 WHERE id = ? AND user_id = ?;`,
			supplierDueAfter,
			supplierClientRefId,
			paidAtIso,
			paidAtIso,
			normalizedSupplierId,
			userId
		);

		const supplierSyncRow = await db.getFirstAsync(
			`SELECT sync_version FROM suppliers WHERE id = ? AND user_id = ? LIMIT 1;`,
			normalizedSupplierId,
			userId
		);

		await enqueueEntitySyncChange({
			entityType: 'supplier',
			operation: 'upsert',
			localId: normalizedSupplierId,
			clientRefId: supplierClientRefId,
			serverId: supplier.server_id || null,
			version: Number(supplierSyncRow?.sync_version || 1),
			updatedAt: paidAtIso,
			data: {
				name: String(supplier.name || ''),
				phone: supplier.phone || null,
				address: supplier.address || null,
				dueAmount: fromMoneyCents(supplierDueAfter),
				deletedAt: null,
			},
		});

		if (purchaseOrder) {
			const nextPaidAmountCents = Number(purchaseOrder.paid_amount_cents || 0) + amountCents;
			const nextDueAmountCents = Number(purchaseOrder.total_amount_cents || 0) - nextPaidAmountCents;
			const nextOrderVersion = Number(purchaseOrder.sync_version || 0) + 1;

			await db.runAsync(
				`UPDATE purchase_orders
				 SET paid_amount_cents = ?,
					 due_amount_cents = ?,
					 sync_version = ?,
					 sync_updated_at = ?,
					 updated_at = ?
				 WHERE id = ? AND user_id = ?;`,
				nextPaidAmountCents,
				nextDueAmountCents,
				nextOrderVersion,
				paidAtIso,
				paidAtIso,
				Number(purchaseOrder.id),
				userId
			);

			await enqueueEntitySyncChange({
				entityType: 'purchase_order',
				operation: 'upsert',
				localId: Number(purchaseOrder.id),
				clientRefId: purchaseOrder.client_ref_id || buildLocalClientRefId({ entityType: 'purchase_order', localId: Number(purchaseOrder.id) }),
				serverId: purchaseOrder.server_id || null,
				version: nextOrderVersion,
				updatedAt: paidAtIso,
				data: {
					supplierId: normalizedSupplierId,
					supplierServerId: supplier.server_id || null,
					supplierClientRefId: supplier.client_ref_id || buildLocalClientRefId({ entityType: 'supplier', localId: normalizedSupplierId }),
					purchaseCode: String(purchaseOrder.purchase_code || ''),
					purchaseDate: purchaseOrder.purchase_date || paidAtIso,
					totalAmount: fromMoneyCents(Number(purchaseOrder.total_amount_cents || 0)),
					paidAmount: fromMoneyCents(nextPaidAmountCents),
					dueAmount: fromMoneyCents(nextDueAmountCents),
					status: normalizePurchaseStatus(purchaseOrder.status, 'pending'),
					note: purchaseOrder.note || null,
					deletedAt: null,
				},
			});
		}

		void logAudit({
			userId,
			entityType: 'supplier_payment',
			entityId: supplierPayableId,
			action: 'create',
			metadata: {
				supplier_id: normalizedSupplierId,
				purchase_order_id: purchaseOrder ? Number(purchaseOrder.id) : null,
				amount_cents: amountCents,
			},
			notes: 'Supplier payment recorded',
		});

		await db.execAsync('COMMIT;');

		return {
			id: supplierPayableId,
			supplier_id: normalizedSupplierId,
			purchase_order_id: purchaseOrder ? Number(purchaseOrder.id) : null,
			amount: fromMoneyCents(amountCents),
			running_due: fromMoneyCents(supplierDueAfter),
			payment_method: normalizePaymentMethod(paymentMethod, 'CASH'),
			created_at: paidAtIso,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const getSupplierPayables = async ({ supplierId = null, limit = 120 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 120;
	const normalizedSupplierId = Number(supplierId);

	const where = ['sp.user_id = ?'];
	const params = [userId];

	if (Number.isInteger(normalizedSupplierId) && normalizedSupplierId > 0) {
		where.push('sp.supplier_id = ?');
		params.push(normalizedSupplierId);
	}

	const rows = await db.getAllAsync(
		`SELECT
			sp.id,
			sp.supplier_id,
			s.name AS supplier_name,
			sp.purchase_order_id,
			po.purchase_code,
			sp.entry_type,
			sp.amount_cents,
			sp.running_due_cents,
			sp.payment_method,
			sp.note,
			sp.created_at
		 FROM supplier_payables sp
		 JOIN suppliers s ON s.id = sp.supplier_id
		 LEFT JOIN purchase_orders po ON po.id = sp.purchase_order_id
		 WHERE ${where.join(' AND ')}
		 ORDER BY datetime(sp.created_at) DESC, sp.id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	let summary = {
		supplier_id: null,
		supplier_name: null,
		outstanding_due: 0,
	};

	if (Number.isInteger(normalizedSupplierId) && normalizedSupplierId > 0) {
		const supplier = await db.getFirstAsync(
			`SELECT id, name, due_amount_cents
			 FROM suppliers
			 WHERE id = ? AND user_id = ?
			 LIMIT 1;`,
			normalizedSupplierId,
			userId
		);

		if (supplier) {
			summary = {
				supplier_id: Number(supplier.id),
				supplier_name: String(supplier.name || ''),
				outstanding_due: fromMoneyCents(Number(supplier.due_amount_cents || 0)),
			};
		}
	}

	return {
		summary,
		rows: (rows || []).map((row) => ({
			id: Number(row.id),
			supplier_id: Number(row.supplier_id),
			supplier_name: String(row.supplier_name || ''),
			purchase_order_id: row.purchase_order_id === null || row.purchase_order_id === undefined ? null : Number(row.purchase_order_id),
			purchase_code: row.purchase_code || null,
			entry_type: normalizeSupplierPayableType(row.entry_type, 'credit'),
			amount: fromMoneyCents(Number(row.amount_cents || 0)),
			running_due: fromMoneyCents(Number(row.running_due_cents || 0)),
			payment_method: row.payment_method ? String(row.payment_method).toUpperCase() : null,
			note: row.note || null,
			created_at: row.created_at || null,
		})),
	};
};

export const validatePurchaseMovementConsistency = async ({ dateIso = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedDate = dateIso ? String(dateIso).slice(0, 10) : null;

	const row = await db.getFirstAsync(
		`WITH purchase_qty AS (
			SELECT COALESCE(SUM(pi.received_qty), 0) AS qty
			FROM purchase_items pi
			JOIN purchase_orders po ON po.id = pi.purchase_order_id
			WHERE po.user_id = ?
				AND (? IS NULL OR DATE(po.purchase_date) = DATE(?))
		),
		movement_qty AS (
			SELECT COALESCE(SUM(quantity_delta), 0) AS qty
			FROM stock_movements
			WHERE user_id = ?
				AND movement_type = 'in'
				AND LOWER(COALESCE(source_event_type, '')) = 'purchase'
				AND (? IS NULL OR DATE(created_at) = DATE(?))
		)
		SELECT
			(SELECT qty FROM purchase_qty) AS purchase_qty,
			(SELECT qty FROM movement_qty) AS movement_qty;`,
		userId,
		normalizedDate,
		normalizedDate,
		userId,
		normalizedDate,
		normalizedDate
	);

	const purchaseQty = Number(row?.purchase_qty || 0);
	const movementQty = Number(row?.movement_qty || 0);

	return {
		date: normalizedDate,
		purchase_received_quantity: purchaseQty,
		movement_purchase_in_quantity: movementQty,
		is_consistent: purchaseQty === movementQty,
		difference: purchaseQty - movementQty,
	};
};

const resolveFinanceRange = ({ fromDateIso = null, toDateIso = null, days = 30 } = {}) => {
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) > 0 ? Number(days) : 30;
	const end = toDateIso ? new Date(toDateIso) : new Date();

	if (Number.isNaN(end.getTime())) {
		throw new Error('Valid toDateIso is required.');
	}

	const start = fromDateIso ? new Date(fromDateIso) : new Date(end.getTime() - (normalizedDays - 1) * 24 * 60 * 60 * 1000);
	if (Number.isNaN(start.getTime())) {
		throw new Error('Valid fromDateIso is required.');
	}

	return {
		fromIso: start.toISOString(),
		toIso: end.toISOString(),
	};
};

export const createExpense = async ({
	title,
	amount,
	category = 'GENERAL',
	paymentMethod = 'CASH',
	note = null,
	expenseDate = null,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedTitle = String(title || '').trim();
	const amountCents = toMoneyCents(amount);
	const effectiveDate = expenseDate ? new Date(expenseDate) : new Date();

	if (!normalizedTitle) {
		throw new Error('Expense title is required.');
	}

	if (!Number.isInteger(amountCents) || amountCents <= 0) {
		throw new Error('Expense amount must be greater than zero.');
	}

	if (Number.isNaN(effectiveDate.getTime())) {
		throw new Error('Valid expenseDate is required.');
	}

	const expenseAtIso = effectiveDate.toISOString();
	const normalizedCategory = normalizeFinanceCategory(category, 'GENERAL');

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const insert = await db.runAsync(
			`INSERT INTO expenses (
				user_id,
				expense_date,
				category,
				title,
				amount_cents,
				payment_method,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?);`,
			userId,
			expenseAtIso,
			normalizedCategory,
			normalizedTitle,
			amountCents,
			normalizePaymentMethod(paymentMethod, 'CASH'),
			typeof note === 'string' ? note.trim() : null,
			null,
			expenseAtIso,
			expenseAtIso,
			expenseAtIso
		);

		const expenseId = Number(insert.lastInsertRowId);
		const expenseClientRefId = buildLocalClientRefId({ entityType: 'expense_entry', localId: expenseId });
		await db.runAsync(`UPDATE expenses SET client_ref_id = ? WHERE id = ?;`, expenseClientRefId, expenseId);

		await enqueueEntitySyncChange({
			entityType: 'expense_entry',
			operation: 'upsert',
			localId: expenseId,
			clientRefId: expenseClientRefId,
			version: 1,
			updatedAt: expenseAtIso,
			data: {
				expenseDate: expenseAtIso,
				category: normalizedCategory,
				title: normalizedTitle,
				amount: fromMoneyCents(amountCents),
				paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
				note: typeof note === 'string' ? note.trim() : null,
				deletedAt: null,
			},
		});

		await insertCashbookEntryTx({
			userId,
			entryType: 'OUT',
			amountCents,
			paymentMethod: normalizePaymentMethod(paymentMethod, 'CASH'),
			category: normalizedCategory,
			referenceType: 'expense_entry',
			referenceLocalId: expenseId,
			referenceClientRefId: expenseClientRefId,
			note: typeof note === 'string' ? note.trim() : normalizedTitle,
			occurredAt: expenseAtIso,
			syncUpdatedAt: expenseAtIso,
		});

		void logAudit({
			userId,
			entityType: 'expense',
			entityId: expenseId,
			action: 'create',
			metadata: {
				category: normalizedCategory,
				amount_cents: amountCents,
				title: normalizedTitle,
			},
			notes: 'Expense recorded',
		});

		await db.execAsync('COMMIT;');

		return {
			id: expenseId,
			expense_date: expenseAtIso,
			category: normalizedCategory,
			title: normalizedTitle,
			amount: fromMoneyCents(amountCents),
			payment_method: normalizePaymentMethod(paymentMethod, 'CASH'),
			note: typeof note === 'string' ? note.trim() : null,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const getExpenses = async ({
	fromDateIso = null,
	toDateIso = null,
	category = null,
	searchText = '',
	limit = 150,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 150;
	const where = ['user_id = ?', 'deleted_at IS NULL'];
	const params = [userId];

	if (fromDateIso) {
		where.push('datetime(expense_date) >= datetime(?)');
		params.push(String(fromDateIso));
	}

	if (toDateIso) {
		where.push('datetime(expense_date) <= datetime(?)');
		params.push(String(toDateIso));
	}

	const normalizedCategory = String(category || '').trim().toUpperCase();
	if (normalizedCategory) {
		where.push('category = ?');
		params.push(normalizedCategory);
	}

	const normalizedSearch = String(searchText || '').trim().toLowerCase();
	if (normalizedSearch) {
		where.push(`(
			LOWER(COALESCE(title, '')) LIKE ?
			OR LOWER(COALESCE(note, '')) LIKE ?
		)`);
		params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
	}

	const rows = await db.getAllAsync(
		`SELECT
			id,
			expense_date,
			category,
			title,
			amount_cents,
			payment_method,
			note
		 FROM expenses
		 WHERE ${where.join(' AND ')}
		 ORDER BY datetime(expense_date) DESC, id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		expense_date: row.expense_date || null,
		category: String(row.category || 'GENERAL').toUpperCase(),
		title: String(row.title || ''),
		amount: fromMoneyCents(Number(row.amount_cents || 0)),
		payment_method: row.payment_method ? String(row.payment_method).toUpperCase() : null,
		note: row.note || null,
	}));
};

export const getCashbookEntries = async ({
	fromDateIso = null,
	toDateIso = null,
	entryType = null,
	paymentMethod = null,
	limit = 200,
} = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
	const where = ['user_id = ?', 'deleted_at IS NULL'];
	const params = [userId];

	if (fromDateIso) {
		where.push('datetime(occurred_at) >= datetime(?)');
		params.push(String(fromDateIso));
	}

	if (toDateIso) {
		where.push('datetime(occurred_at) <= datetime(?)');
		params.push(String(toDateIso));
	}

	const normalizedEntryType = String(entryType || '').trim().toUpperCase();
	if (normalizedEntryType && CASHBOOK_ENTRY_TYPES.has(normalizedEntryType)) {
		where.push('entry_type = ?');
		params.push(normalizedEntryType);
	}

	const normalizedPaymentMethod = String(paymentMethod || '').trim().toUpperCase();
	if (normalizedPaymentMethod) {
		where.push('payment_method = ?');
		params.push(normalizedPaymentMethod);
	}

	const rows = await db.getAllAsync(
		`SELECT
			id,
			entry_type,
			category,
			amount_cents,
			payment_method,
			reference_type,
			reference_local_id,
			note,
			occurred_at
		 FROM cashbook_entries
		 WHERE ${where.join(' AND ')}
		 ORDER BY datetime(occurred_at) DESC, id DESC
		 LIMIT ?;`,
		...params,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		entry_type: normalizeCashbookEntryType(row.entry_type, 'IN'),
		category: String(row.category || 'GENERAL').toUpperCase(),
		amount: fromMoneyCents(Number(row.amount_cents || 0)),
		payment_method: row.payment_method ? String(row.payment_method).toUpperCase() : null,
		reference_type: row.reference_type || null,
		reference_local_id: row.reference_local_id === null || row.reference_local_id === undefined ? null : Number(row.reference_local_id),
		note: row.note || null,
		occurred_at: row.occurred_at || null,
	}));
};

export const getCashflowSummary = async ({ fromDateIso = null, toDateIso = null, days = 30 } = {}) => {
	const userId = await getActiveScopedUserId();
	const { fromIso, toIso } = resolveFinanceRange({ fromDateIso, toDateIso, days });

	const totals = await db.getFirstAsync(
		`SELECT
			COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount_cents ELSE 0 END), 0) AS total_in_cents,
			COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount_cents ELSE 0 END), 0) AS total_out_cents
		 FROM cashbook_entries
		 WHERE user_id = ?
			AND deleted_at IS NULL
			AND datetime(occurred_at) >= datetime(?)
			AND datetime(occurred_at) <= datetime(?);`,
		userId,
		fromIso,
		toIso
	);

	const methodRows = await db.getAllAsync(
		`SELECT
			COALESCE(payment_method, 'UNSPECIFIED') AS payment_method,
			COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount_cents ELSE 0 END), 0) AS total_in_cents,
			COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount_cents ELSE 0 END), 0) AS total_out_cents
		 FROM cashbook_entries
		 WHERE user_id = ?
			AND deleted_at IS NULL
			AND datetime(occurred_at) >= datetime(?)
			AND datetime(occurred_at) <= datetime(?)
		 GROUP BY COALESCE(payment_method, 'UNSPECIFIED')
		 ORDER BY payment_method ASC;`,
		userId,
		fromIso,
		toIso
	);

	const totalInCents = Number(totals?.total_in_cents || 0);
	const totalOutCents = Number(totals?.total_out_cents || 0);

	return {
		from_date: fromIso,
		to_date: toIso,
		total_in: fromMoneyCents(totalInCents),
		total_out: fromMoneyCents(totalOutCents),
		net_cashflow: fromMoneyCents(totalInCents - totalOutCents),
		by_method: (methodRows || []).map((row) => ({
			payment_method: String(row.payment_method || 'UNSPECIFIED').toUpperCase(),
			total_in: fromMoneyCents(Number(row.total_in_cents || 0)),
			total_out: fromMoneyCents(Number(row.total_out_cents || 0)),
			net: fromMoneyCents(Number(row.total_in_cents || 0) - Number(row.total_out_cents || 0)),
		})),
	};
};

export const getProfitReport = async ({ fromDateIso = null, toDateIso = null, days = 30 } = {}) => {
	const userId = await getActiveScopedUserId();
	const { fromIso, toIso } = resolveFinanceRange({ fromDateIso, toDateIso, days });

	const summaryRow = await db.getFirstAsync(
		`WITH product_cost AS (
			SELECT
				product_id,
				CASE
					WHEN SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END) > 0
					THEN CAST(ROUND(
						SUM(unit_cost_cents * (CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END))
						* 1.0 /
						SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END)
					) AS INTEGER)
					ELSE 0
				END AS avg_cost_cents
			FROM purchase_items
			WHERE user_id = ?
			GROUP BY product_id
		),
		sales_agg AS (
			SELECT
				COALESCE(SUM(si.subtotal_cents), 0) AS revenue_cents,
				COALESCE(SUM(si.quantity * COALESCE(pc.avg_cost_cents, 0)), 0) AS cogs_cents
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			LEFT JOIN product_cost pc ON pc.product_id = si.product_id
			WHERE sh.user_id = ?
				AND sh.deleted_at IS NULL
				AND sh.status = 'posted'
				AND datetime(sh.timestamp) >= datetime(?)
				AND datetime(sh.timestamp) <= datetime(?)
		),
		expense_agg AS (
			SELECT COALESCE(SUM(amount_cents), 0) AS expenses_cents
			FROM expenses
			WHERE user_id = ?
				AND deleted_at IS NULL
				AND datetime(expense_date) >= datetime(?)
				AND datetime(expense_date) <= datetime(?)
		)
		SELECT
			sales_agg.revenue_cents,
			sales_agg.cogs_cents,
			expense_agg.expenses_cents
		FROM sales_agg, expense_agg;`,
		userId,
		userId,
		fromIso,
		toIso,
		userId,
		fromIso,
		toIso
	);

	const timelineRows = await db.getAllAsync(
		`WITH product_cost AS (
			SELECT
				product_id,
				CASE
					WHEN SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END) > 0
					THEN CAST(ROUND(
						SUM(unit_cost_cents * (CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END))
						* 1.0 /
						SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END)
					) AS INTEGER)
					ELSE 0
				END AS avg_cost_cents
			FROM purchase_items
			WHERE user_id = ?
			GROUP BY product_id
		),
		sales_daily AS (
			SELECT
				DATE(sh.timestamp) AS day_key,
				COALESCE(SUM(si.subtotal_cents), 0) AS revenue_cents,
				COALESCE(SUM(si.quantity * COALESCE(pc.avg_cost_cents, 0)), 0) AS cogs_cents
			FROM sales_items si
			JOIN sales_header sh ON sh.id = si.sales_header_id
			LEFT JOIN product_cost pc ON pc.product_id = si.product_id
			WHERE sh.user_id = ?
				AND sh.deleted_at IS NULL
				AND sh.status = 'posted'
				AND datetime(sh.timestamp) >= datetime(?)
				AND datetime(sh.timestamp) <= datetime(?)
			GROUP BY DATE(sh.timestamp)
		),
		expense_daily AS (
			SELECT
				DATE(expense_date) AS day_key,
				COALESCE(SUM(amount_cents), 0) AS expenses_cents
			FROM expenses
			WHERE user_id = ?
				AND deleted_at IS NULL
				AND datetime(expense_date) >= datetime(?)
				AND datetime(expense_date) <= datetime(?)
			GROUP BY DATE(expense_date)
		),
		day_keys AS (
			SELECT day_key FROM sales_daily
			UNION
			SELECT day_key FROM expense_daily
		)
		SELECT
			day_keys.day_key,
			COALESCE(sales_daily.revenue_cents, 0) AS revenue_cents,
			COALESCE(sales_daily.cogs_cents, 0) AS cogs_cents,
			COALESCE(expense_daily.expenses_cents, 0) AS expenses_cents
		FROM day_keys
		LEFT JOIN sales_daily ON sales_daily.day_key = day_keys.day_key
		LEFT JOIN expense_daily ON expense_daily.day_key = day_keys.day_key
		ORDER BY day_keys.day_key ASC;`,
		userId,
		userId,
		fromIso,
		toIso,
		userId,
		fromIso,
		toIso
	);

	const revenueCents = Number(summaryRow?.revenue_cents || 0);
	const cogsCents = Number(summaryRow?.cogs_cents || 0);
	const expensesCents = Number(summaryRow?.expenses_cents || 0);
	const grossProfitCents = revenueCents - cogsCents;
	const netProfitCents = grossProfitCents - expensesCents;

	return {
		from_date: fromIso,
		to_date: toIso,
		summary: {
			revenue: fromMoneyCents(revenueCents),
			cogs: fromMoneyCents(cogsCents),
			gross_profit: fromMoneyCents(grossProfitCents),
			expenses: fromMoneyCents(expensesCents),
			net_profit: fromMoneyCents(netProfitCents),
			net_margin_pct: revenueCents > 0 ? Number(((netProfitCents / revenueCents) * 100).toFixed(2)) : 0,
		},
		timeline: (timelineRows || []).map((row) => {
			const dayRevenue = Number(row.revenue_cents || 0);
			const dayCogs = Number(row.cogs_cents || 0);
			const dayExpenses = Number(row.expenses_cents || 0);
			const dayNet = dayRevenue - dayCogs - dayExpenses;

			return {
				date: row.day_key,
				revenue: fromMoneyCents(dayRevenue),
				cogs: fromMoneyCents(dayCogs),
				expenses: fromMoneyCents(dayExpenses),
				net_profit: fromMoneyCents(dayNet),
			};
		}),
	};
};

export const getProductMarginReport = async ({ fromDateIso = null, toDateIso = null, days = 30, limit = 100 } = {}) => {
	const userId = await getActiveScopedUserId();
	const { fromIso, toIso } = resolveFinanceRange({ fromDateIso, toDateIso, days });
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;

	const rows = await db.getAllAsync(
		`WITH product_cost AS (
			SELECT
				product_id,
				CASE
					WHEN SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END) > 0
					THEN CAST(ROUND(
						SUM(unit_cost_cents * (CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END))
						* 1.0 /
						SUM(CASE WHEN COALESCE(received_qty, 0) > 0 THEN received_qty ELSE ordered_qty END)
					) AS INTEGER)
					ELSE 0
				END AS avg_cost_cents
			FROM purchase_items
			WHERE user_id = ?
			GROUP BY product_id
		)
		SELECT
			si.product_id,
			p.name AS product_name,
			COALESCE(SUM(si.quantity), 0) AS units_sold,
			COALESCE(SUM(si.subtotal_cents), 0) AS revenue_cents,
			COALESCE(SUM(si.quantity * COALESCE(pc.avg_cost_cents, 0)), 0) AS cogs_cents
		FROM sales_items si
		JOIN sales_header sh ON sh.id = si.sales_header_id
		JOIN products p ON p.id = si.product_id
		LEFT JOIN product_cost pc ON pc.product_id = si.product_id
		WHERE sh.user_id = ?
			AND sh.deleted_at IS NULL
			AND sh.status = 'posted'
			AND datetime(sh.timestamp) >= datetime(?)
			AND datetime(sh.timestamp) <= datetime(?)
		GROUP BY si.product_id, p.name
		ORDER BY revenue_cents DESC
		LIMIT ?;`,
		userId,
		userId,
		fromIso,
		toIso,
		normalizedLimit
	);

	return (rows || []).map((row) => {
		const revenueCents = Number(row.revenue_cents || 0);
		const cogsCents = Number(row.cogs_cents || 0);
		const grossProfitCents = revenueCents - cogsCents;

		return {
			product_id: Number(row.product_id),
			product_name: String(row.product_name || ''),
			units_sold: Number(row.units_sold || 0),
			revenue: fromMoneyCents(revenueCents),
			cogs: fromMoneyCents(cogsCents),
			gross_profit: fromMoneyCents(grossProfitCents),
			margin_pct: revenueCents > 0 ? Number(((grossProfitCents / revenueCents) * 100).toFixed(2)) : 0,
		};
	});
};

export const getDayCloseSnapshot = async ({ businessDate = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedBusinessDate = normalizeBusinessDate(businessDate);

	if (!normalizedBusinessDate) {
		throw new Error('Valid businessDate is required.');
	}

	const totals = await getBusinessDayFinanceSnapshotTx({
		userId,
		businessDate: normalizedBusinessDate,
	});

	const existing = await db.getFirstAsync(
		`SELECT
			id,
			business_date,
			opening_balance_cents,
			total_in_cents,
			total_out_cents,
			closing_balance_cents,
			cash_on_hand_cents,
			variance_cents,
			status,
			note,
			closed_at
		 FROM day_closes
		 WHERE user_id = ?
			AND business_date = ?
			AND deleted_at IS NULL
		 LIMIT 1;`,
		userId,
		normalizedBusinessDate
	);

	return {
		business_date: normalizedBusinessDate,
		opening_balance: fromMoneyCents(totals.opening_balance_cents),
		total_in: fromMoneyCents(totals.total_in_cents),
		total_out: fromMoneyCents(totals.total_out_cents),
		closing_balance: fromMoneyCents(totals.closing_balance_cents),
		existing_close: existing
			? {
				id: Number(existing.id),
				cash_on_hand: existing.cash_on_hand_cents === null || existing.cash_on_hand_cents === undefined
					? null
					: fromMoneyCents(Number(existing.cash_on_hand_cents || 0)),
				variance: existing.variance_cents === null || existing.variance_cents === undefined
					? null
					: fromMoneyCents(Number(existing.variance_cents || 0)),
				status: normalizeDayCloseStatus(existing.status, 'closed'),
				note: existing.note || null,
				closed_at: existing.closed_at || null,
			}
			: null,
	};
};

export const closeBusinessDay = async ({ businessDate = null, cashOnHand = null, note = null } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedBusinessDate = normalizeBusinessDate(businessDate);

	if (!normalizedBusinessDate) {
		throw new Error('Valid businessDate is required.');
	}

	const closedAtIso = new Date().toISOString();
	const cashOnHandCents = cashOnHand === null || cashOnHand === undefined || cashOnHand === ''
		? null
		: toMoneyCents(cashOnHand);

	if (cashOnHandCents !== null && (!Number.isInteger(cashOnHandCents) || cashOnHandCents < 0)) {
		throw new Error('cashOnHand must be a valid non-negative amount.');
	}

	await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');

	try {
		const totals = await getBusinessDayFinanceSnapshotTx({
			userId,
			businessDate: normalizedBusinessDate,
		});

		const effectiveCashOnHandCents = cashOnHandCents === null ? totals.closing_balance_cents : cashOnHandCents;
		const varianceCents = effectiveCashOnHandCents - totals.closing_balance_cents;

		const existing = await db.getFirstAsync(
			`SELECT id, client_ref_id, server_id, sync_version
			 FROM day_closes
			 WHERE user_id = ?
				AND business_date = ?
				AND deleted_at IS NULL
			 LIMIT 1;`,
			userId,
			normalizedBusinessDate
		);

		let localId;
		let clientRefId;
		let version;

		if (existing?.id) {
			localId = Number(existing.id);
			clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'day_close', localId });
			version = Number(existing.sync_version || 0) + 1;

			await db.runAsync(
				`UPDATE day_closes
				 SET opening_balance_cents = ?,
					 total_in_cents = ?,
					 total_out_cents = ?,
					 closing_balance_cents = ?,
					 cash_on_hand_cents = ?,
					 variance_cents = ?,
					 status = 'closed',
					 note = ?,
					 closed_at = ?,
					 client_ref_id = ?,
					 sync_version = ?,
					 sync_updated_at = ?,
					 updated_at = ?
				 WHERE id = ?
					AND user_id = ?;`,
				totals.opening_balance_cents,
				totals.total_in_cents,
				totals.total_out_cents,
				totals.closing_balance_cents,
				effectiveCashOnHandCents,
				varianceCents,
				typeof note === 'string' ? note.trim() : null,
				closedAtIso,
				clientRefId,
				version,
				closedAtIso,
				closedAtIso,
				localId,
				userId
			);
		} else {
			const insert = await db.runAsync(
				`INSERT INTO day_closes (
					user_id,
					business_date,
					opening_balance_cents,
					total_in_cents,
					total_out_cents,
					closing_balance_cents,
					cash_on_hand_cents,
					variance_cents,
					status,
					note,
					closed_at,
					client_ref_id,
					sync_version,
					sync_updated_at,
					deleted_at,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, 1, ?, NULL, ?, ?);`,
				userId,
				normalizedBusinessDate,
				totals.opening_balance_cents,
				totals.total_in_cents,
				totals.total_out_cents,
				totals.closing_balance_cents,
				effectiveCashOnHandCents,
				varianceCents,
				typeof note === 'string' ? note.trim() : null,
				closedAtIso,
				null,
				closedAtIso,
				closedAtIso,
				closedAtIso
			);

			localId = Number(insert.lastInsertRowId);
			clientRefId = buildLocalClientRefId({ entityType: 'day_close', localId });
			version = 1;
			await db.runAsync(`UPDATE day_closes SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);
		}

		await enqueueEntitySyncChange({
			entityType: 'day_close',
			operation: 'upsert',
			localId,
			clientRefId,
			version,
			updatedAt: closedAtIso,
			data: {
				businessDate: normalizedBusinessDate,
				openingBalance: fromMoneyCents(totals.opening_balance_cents),
				totalIn: fromMoneyCents(totals.total_in_cents),
				totalOut: fromMoneyCents(totals.total_out_cents),
				closingBalance: fromMoneyCents(totals.closing_balance_cents),
				cashOnHand: fromMoneyCents(effectiveCashOnHandCents),
				variance: fromMoneyCents(varianceCents),
				status: 'closed',
				note: typeof note === 'string' ? note.trim() : null,
				closedAt: closedAtIso,
				deletedAt: null,
			},
		});

		void logAudit({
			userId,
			entityType: 'day_close',
			entityId: localId,
			action: 'close',
			metadata: {
				business_date: normalizedBusinessDate,
				opening_balance_cents: totals.opening_balance_cents,
				total_in_cents: totals.total_in_cents,
				total_out_cents: totals.total_out_cents,
				closing_balance_cents: totals.closing_balance_cents,
				cash_on_hand_cents: effectiveCashOnHandCents,
				variance_cents: varianceCents,
			},
			notes: 'Business day closed',
		});

		await db.execAsync('COMMIT;');

		return {
			id: localId,
			business_date: normalizedBusinessDate,
			opening_balance: fromMoneyCents(totals.opening_balance_cents),
			total_in: fromMoneyCents(totals.total_in_cents),
			total_out: fromMoneyCents(totals.total_out_cents),
			closing_balance: fromMoneyCents(totals.closing_balance_cents),
			cash_on_hand: fromMoneyCents(effectiveCashOnHandCents),
			variance: fromMoneyCents(varianceCents),
			status: 'closed',
			note: typeof note === 'string' ? note.trim() : null,
			closed_at: closedAtIso,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const getDayCloseReports = async ({ limit = 60 } = {}) => {
	const userId = await getActiveScopedUserId();
	const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 60;

	const rows = await db.getAllAsync(
		`SELECT
			id,
			business_date,
			opening_balance_cents,
			total_in_cents,
			total_out_cents,
			closing_balance_cents,
			cash_on_hand_cents,
			variance_cents,
			status,
			note,
			closed_at
		 FROM day_closes
		 WHERE user_id = ?
			AND deleted_at IS NULL
		 ORDER BY business_date DESC, id DESC
		 LIMIT ?;`,
		userId,
		normalizedLimit
	);

	return (rows || []).map((row) => ({
		id: Number(row.id),
		business_date: row.business_date || null,
		opening_balance: fromMoneyCents(Number(row.opening_balance_cents || 0)),
		total_in: fromMoneyCents(Number(row.total_in_cents || 0)),
		total_out: fromMoneyCents(Number(row.total_out_cents || 0)),
		closing_balance: fromMoneyCents(Number(row.closing_balance_cents || 0)),
		cash_on_hand: row.cash_on_hand_cents === null || row.cash_on_hand_cents === undefined
			? null
			: fromMoneyCents(Number(row.cash_on_hand_cents || 0)),
		variance: row.variance_cents === null || row.variance_cents === undefined
			? null
			: fromMoneyCents(Number(row.variance_cents || 0)),
		status: normalizeDayCloseStatus(row.status, 'closed'),
		note: row.note || null,
		closed_at: row.closed_at || null,
	}));
};

export const updateCustomer = ({
	id,
	name,
	phone = null,
	address = null,
	creditLimit = undefined,
	dueTermsDays = undefined,
	riskLevel = undefined,
}) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const syncUpdatedAt = new Date().toISOString();
	const normalizedId = Number(id);
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid customer id is required.'));
	}

	if (!normalizedName) {
		return Promise.reject(new Error('Customer name is required.'));
	}

		const existing = await db.getFirstAsync(
			`SELECT server_id, client_ref_id, sync_version, credit_limit, current_balance, risk_level, due_terms_days, last_payment_date
			 FROM customers
			 WHERE id = ? AND user_id = ?;`,
			normalizedId,
			userId
		);

		if (!existing) {
			throw new Error('Customer not found.');
		}

		const nextSyncVersion = Number(existing.sync_version || 0) + 1;
		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'customer', localId: normalizedId });
		const normalizedCreditLimit = creditLimit === undefined
			? Number(existing.credit_limit || 0)
			: (Number.isFinite(Number(creditLimit)) && Number(creditLimit) >= 0 ? Number(Number(creditLimit).toFixed(2)) : NaN);
		const normalizedDueTermsDays = dueTermsDays === undefined
			? Math.min(365, Number(existing.due_terms_days || 30))
			: (Number.isInteger(Number(dueTermsDays)) && Number(dueTermsDays) > 0 ? Math.min(365, Number(dueTermsDays)) : NaN);
		const normalizedRiskLevel = riskLevel === undefined
			? String(existing.risk_level || 'low').toLowerCase()
			: String(riskLevel || '').trim().toLowerCase();

		if (!Number.isFinite(normalizedCreditLimit) || normalizedCreditLimit < 0) {
			throw new Error('creditLimit must be a non-negative number.');
		}

		if (!Number.isInteger(normalizedDueTermsDays) || normalizedDueTermsDays <= 0) {
			throw new Error('dueTermsDays must be a positive integer.');
		}

		if (!['low', 'medium', 'high'].includes(normalizedRiskLevel)) {
			throw new Error('riskLevel must be low, medium, or high.');
		}

		return db
		.runAsync(
			`UPDATE customers
			 SET name = ?,
				 phone = ?,
				 address = ?,
				 credit_limit = ?,
				 due_terms_days = ?,
				 risk_level = ?,
				 updated_at = datetime('now'),
				 client_ref_id = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 deleted_at = NULL
			 WHERE id = ? AND user_id = ?;`,
			normalizedName,
			normalizedPhone || null,
			normalizedAddress || null,
			normalizedCreditLimit,
			normalizedDueTermsDays,
			normalizedRiskLevel,
			clientRefId,
			nextSyncVersion,
			syncUpdatedAt,
			normalizedId,
			userId
		)
		.then(async (result) => {
			if (!result.changes) {
				throw new Error('Customer not found.');
			}

			await enqueueEntitySyncChange({
				entityType: 'customer',
				operation: 'upsert',
				localId: normalizedId,
				clientRefId,
				serverId: existing.server_id || null,
				version: nextSyncVersion,
				updatedAt: syncUpdatedAt,
				data: {
					name: normalizedName,
					phone: normalizedPhone || null,
					address: normalizedAddress || null,
					creditLimit: normalizedCreditLimit,
					currentBalance: Number(existing.current_balance || 0),
					riskLevel: normalizedRiskLevel,
					dueTermsDays: normalizedDueTermsDays,
					lastPaymentDate: existing.last_payment_date || null,
					deletedAt: null,
				},
			});

			return {
				id: normalizedId,
				name: normalizedName,
				phone: normalizedPhone || null,
				address: normalizedAddress || null,
				credit_limit: normalizedCreditLimit,
				current_balance: Number(existing.current_balance || 0),
				risk_level: normalizedRiskLevel,
				due_terms_days: normalizedDueTermsDays,
				last_payment_date: existing.last_payment_date || null,
			};
		});
	};

	return run();
};

export const deleteCustomer = (id) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const syncUpdatedAt = new Date().toISOString();
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid customer id is required.'));
	}

		const existing = await db.getFirstAsync(
			`SELECT id, server_id, client_ref_id, sync_version FROM customers WHERE id = ? AND user_id = ?;`,
			normalizedId,
			userId
		);

		if (!existing) {
			throw new Error('Customer not found.');
		}

		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'customer', localId: normalizedId });
		const nextSyncVersion = Number(existing.sync_version || 0) + 1;

		return db.runAsync(`DELETE FROM customers WHERE id = ? AND user_id = ?;`, normalizedId, userId).then(async (result) => {
		if (!result.changes) {
			throw new Error('Customer not found.');
		}

		await enqueueEntitySyncChange({
			entityType: 'customer',
			operation: 'delete',
			localId: normalizedId,
			clientRefId,
			serverId: existing.server_id || null,
			version: nextSyncVersion,
			updatedAt: syncUpdatedAt,
			data: {
				deletedAt: syncUpdatedAt,
			},
		});

		return { id: normalizedId };
	});
	};

	return run();
};

export const updateBakiStatus = ({ id, status, paidAmount }) => {
	void id;
	void status;
	void paidAmount;
	return Promise.reject(new Error('Status-based baki updates are deprecated. Use explicit addPayment flow instead.'));
};

export const deleteBaki = (id) => {
	const run = async () => {
		const userId = await getActiveScopedUserId();
		const syncUpdatedAt = new Date().toISOString();
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid baki id is required.'));
	}

		const existing = await db.getFirstAsync(
			`SELECT id, server_id, client_ref_id, sync_version FROM baki_transactions WHERE id = ? AND user_id = ?;`,
			normalizedId,
			userId
		);

		if (!existing) {
			throw new Error('Baki transaction not found.');
		}

		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'baki_entry', localId: normalizedId });
		const nextSyncVersion = Number(existing.sync_version || 0) + 1;

		return db.runAsync(`DELETE FROM baki_transactions WHERE id = ? AND user_id = ?;`, normalizedId, userId).then(async (result) => {
		if (!result.changes) {
			throw new Error('Baki transaction not found.');
		}

		await enqueueEntitySyncChange({
			entityType: 'baki_entry',
			operation: 'delete',
			localId: normalizedId,
			clientRefId,
			serverId: existing.server_id || null,
			version: nextSyncVersion,
			updatedAt: syncUpdatedAt,
			data: {
				deletedAt: syncUpdatedAt,
			},
		});

		void logAudit({
			userId,
			entityType: 'baki_transaction',
			entityId: normalizedId,
			action: 'delete',
			notes: 'Baki transaction deleted',
		});

		return { id: normalizedId };
	});
	};

	return run();
};

export default db;
