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
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_login_at DATETIME
		);`);

		await db.execAsync(`INSERT INTO users_migrated (id, email, created_at, updated_at, last_login_at)
			SELECT id, email, COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP), last_login_at
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

	await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_movements (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust')),
		quantity_delta INTEGER NOT NULL,
		quantity_before INTEGER NOT NULL,
		quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
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

	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_customer_id ON baki_entries(customer_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_created_at ON baki_entries(created_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_customer_id ON baki_transactions(customer_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_created_at ON baki_transactions(created_at DESC);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_legacy ON baki_transactions(legacy_entry_id, legacy_kind);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_access_expires_at ON auth_sessions(access_expires_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_auth_device_profile_email ON auth_device_profile(preferred_email);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_pending_sync_queue_created_at ON pending_sync_queue(created_at ASC);`);

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

	await ensureColumn('users', 'last_login_at', `ALTER TABLE users ADD COLUMN last_login_at DATETIME;`);
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
	await ensureColumn('stock_movements', 'user_id', `ALTER TABLE stock_movements ADD COLUMN user_id INTEGER;`);
	await ensureColumn('stock_movements', 'server_id', `ALTER TABLE stock_movements ADD COLUMN server_id TEXT;`);
	await ensureColumn('stock_movements', 'client_ref_id', `ALTER TABLE stock_movements ADD COLUMN client_ref_id TEXT;`);
	await ensureColumn('stock_movements', 'sync_version', `ALTER TABLE stock_movements ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;`);
	await ensureColumn('stock_movements', 'sync_updated_at', `ALTER TABLE stock_movements ADD COLUMN sync_updated_at DATETIME;`);
	await ensureColumn('stock_movements', 'deleted_at', `ALTER TABLE stock_movements ADD COLUMN deleted_at DATETIME;`);
	await ensureColumn('pending_sync_queue', 'user_id', `ALTER TABLE pending_sync_queue ADD COLUMN user_id INTEGER;`);

	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_client_ref_id ON products(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_client_ref_id ON customers(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_user_client_ref_id ON baki_transactions(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_user_client_ref_id ON stock_movements(user_id, client_ref_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_server_id ON products(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_server_id ON customers(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_baki_transactions_user_server_id ON baki_transactions(user_id, server_id);`);
	await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_user_server_id ON stock_movements(user_id, server_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_entries_user_id ON baki_entries(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_transactions_user_id ON baki_transactions(user_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON stock_movements(user_id);`);
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

	await db.execAsync(`UPDATE customers
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now'))
		WHERE created_at IS NULL OR updated_at IS NULL;`);

	const fallbackUserId = await getFallbackUserId();
	if (fallbackUserId) {
		await db.execAsync(`UPDATE products SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE customers SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE baki_entries SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE baki_transactions SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);
		await db.execAsync(`UPDATE stock_movements SET user_id = ${fallbackUserId} WHERE user_id IS NULL;`);

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

		await db.execAsync(`UPDATE stock_movements
			SET user_id = (
				SELECT p.user_id
				FROM products p
				WHERE p.id = stock_movements.product_id
				LIMIT 1
			)
			WHERE user_id IS NULL;`);
	}

	await db.execAsync(`UPDATE baki_entries
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			status = COALESCE(status, 'unpaid'),
			paid_amount = COALESCE(paid_amount, 0)
		WHERE created_at IS NULL
			OR updated_at IS NULL
			OR status IS NULL
			OR paid_amount IS NULL;`);

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

export const insertCustomer = async ({ name, phone = null, address = null }) => {
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;
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
			client_ref_id,
			sync_version,
			sync_updated_at,
			deleted_at
		)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
		userId,
		normalizedName,
		normalizedPhone || null,
		normalizedAddress || null,
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
			},
		},
		notes: 'Customer created',
	});

	return {
		id: localId,
		name: normalizedName,
		phone: normalizedPhone || null,
		address: normalizedAddress || null,
	};
};

export const addCustomer = (payload) => insertCustomer(payload);

const CUSTOMER_WITH_DUE_BASE_SQL = `SELECT
	c.id,
	c.user_id,
	c.name,
	c.phone,
	c.address,
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

const insertBakiTransaction = async ({ customerId, type, amount, note = null, paymentMethod = null }) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();
	const normalizedCustomerId = Number(customerId);
	const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
	const normalizedNote = typeof note === 'string' ? note.trim() : null;
	const normalizedPaymentMethod = typeof paymentMethod === 'string' ? paymentMethod.trim().toLowerCase() : null;
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
			`SELECT id, server_id, client_ref_id FROM customers WHERE id = ? AND user_id = ?;`,
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

		if (normalizedType === 'payment') {
			if (dueCents <= 0) {
				throw new Error('No existing credit found for this customer. Payment is not allowed.');
			}

			if (amountCents > dueCents) {
				throw new Error(`Overpayment blocked. Max payable now is ৳${fromMoneyCents(dueCents).toFixed(2)}.`);
			}
		}

		const result = await db.runAsync(
			`INSERT INTO baki_transactions (
				user_id,
				customer_id,
				type,
				amount_cents,
				note,
				payment_method,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at
			)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
			userId,
			normalizedCustomerId,
			normalizedType,
			amountCents,
			normalizedNote || null,
			normalizedType === 'payment' ? normalizedPaymentMethod || 'cash' : null,
			null,
			1,
			syncUpdatedAt
		);

		const localId = Number(result.lastInsertRowId);
		const clientRefId = buildLocalClientRefId({ entityType: 'baki_entry', localId });
		await db.runAsync(`UPDATE baki_transactions SET client_ref_id = ? WHERE id = ?;`, clientRefId, localId);

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
				customerId: Number(customer.id),
				customerServerId: customer.server_id || null,
				customerClientRefId: customer.client_ref_id || buildLocalClientRefId({ entityType: 'customer', localId: Number(customer.id) }),
				occurredAt: syncUpdatedAt,
				deletedAt: null,
			},
		});

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
			note: normalizedNote || null,
			payment_method: normalizedType === 'payment' ? normalizedPaymentMethod || 'cash' : null,
		};
	} catch (error) {
		try {
			await db.execAsync('ROLLBACK;');
		} catch (_rollbackError) {
		}
		throw error;
	}
};

export const insertBakiEntry = ({ customerId, amount, note = null }) =>
	insertBakiTransaction({ customerId, type: 'credit', amount, note });

export const addBaki = (payload) => insertBakiEntry(payload);

export const addPayment = ({ customerId, amount, note = null, paymentMethod = 'cash' }) =>
	insertBakiTransaction({ customerId, type: 'payment', amount, note, paymentMethod });

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
				SUM(CASE WHEN t.type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
				SUM(CASE WHEN t.type = 'payment' THEN 1 ELSE 0 END) AS payment_count,
				MAX(t.created_at) AS last_activity_at
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
			SUM(CASE WHEN t.type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
			SUM(CASE WHEN t.type = 'payment' THEN 1 ELSE 0 END) AS payment_count,
			MAX(t.created_at) AS last_activity_at
		FROM customers c
		LEFT JOIN baki_transactions t ON t.customer_id = c.id
		WHERE c.id = ?
			AND c.user_id = ?
		GROUP BY c.id
		ORDER BY c.id DESC;`,
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
		`SELECT preferred_email, pin_enabled
		 FROM auth_device_profile
		 WHERE id = 1
		 LIMIT 1;`
	);

	return {
		deviceId,
		preferredEmail: String(row?.preferred_email || '').trim() || null,
		pinEnabled: Boolean(Number(row?.pin_enabled || 0)),
	};
};

export const setAuthDeviceProfile = async ({ preferredEmail, pinEnabled } = {}) => {
	await getOrCreateDeviceId();

	const shouldUpdateEmail = preferredEmail !== undefined;
	const normalizedEmail = shouldUpdateEmail ? normalizeAuthEmail(preferredEmail) : null;
	const shouldUpdatePinEnabled = pinEnabled !== undefined;

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
			updated_at = datetime('now')
		 WHERE id = 1;`,
		shouldUpdateEmail ? 1 : 0,
		normalizedEmail || null,
		shouldUpdatePinEnabled ? 1 : 0,
		shouldUpdatePinEnabled && pinEnabled ? 1 : 0
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

const normalizeServerUserPayload = (userPayload) => {
	const email = normalizeAuthEmail(userPayload?.email);
	if (!email) {
		throw new Error('Authenticated server user email is required.');
	}

	return {
		email,
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
			`INSERT INTO users (email, created_at, updated_at, last_login_at)
			 VALUES (?, COALESCE(?, CURRENT_TIMESTAMP), datetime('now'), datetime('now'));`,
			normalizedUser.email,
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
			 updated_at = datetime('now'),
			 last_login_at = datetime('now')
		 WHERE id = ?;`,
		normalizedUser.email,
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
		`SELECT id, email, created_at, updated_at, last_login_at
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

export const createStockMovement = async ({ productId, movementType, quantity, note = null }) => {
	const userId = await getActiveScopedUserId();
	const syncUpdatedAt = new Date().toISOString();
	const normalizedProductId = Number(productId);
	const normalizedMovementType = typeof movementType === 'string' ? movementType.trim().toLowerCase() : '';
	const normalizedQuantity = Number(quantity);
	const normalizedNote = typeof note === 'string' ? note.trim() : null;

	if (!Number.isInteger(normalizedProductId) || normalizedProductId <= 0) {
		throw new Error('Valid productId is required.');
	}

	if (!MOVEMENT_TYPES.has(normalizedMovementType)) {
		throw new Error("movementType must be one of: in, out, adjust.");
	}

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity === 0) {
		throw new Error('Quantity must be a non-zero integer.');
	}

	if ((normalizedMovementType === 'in' || normalizedMovementType === 'out') && normalizedQuantity < 0) {
		throw new Error('Quantity must be positive for movementType in/out.');
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
				quantity_delta,
				quantity_before,
				quantity_after,
				note,
				client_ref_id,
				sync_version,
				sync_updated_at,
				deleted_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
			userId,
			normalizedProductId,
			normalizedMovementType,
			quantityDelta,
			currentQuantity,
			nextQuantity,
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

		await enqueueEntitySyncChange({
			entityType: 'inventory_movement',
			operation: 'upsert',
			localId: movementLocalId,
			clientRefId: movementClientRefId,
			version: 1,
			updatedAt: syncUpdatedAt,
			data: {
				movementType: normalizedMovementType,
				quantityDelta,
				quantityBefore: currentQuantity,
				quantityAfter: nextQuantity,
				note: normalizedNote || null,
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
				new: { quantity: nextQuantity, movement_type: normalizedMovementType, quantity_delta: quantityDelta },
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
			quantity_delta: quantityDelta,
			quantity_before: currentQuantity,
			quantity_after: nextQuantity,
			note: normalizedNote || null,
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
					m.quantity_delta,
					m.quantity_before,
					m.quantity_after,
					m.note,
					m.created_at
			 FROM stock_movements m
			 JOIN products p ON p.id = m.product_id
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
				m.quantity_delta,
				m.quantity_before,
				m.quantity_after,
				m.note,
				m.created_at
		 FROM stock_movements m
		 JOIN products p ON p.id = m.product_id
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
				m.product_id,
				DATE(m.created_at) AS sale_date,
				ABS(SUM(m.quantity_delta)) AS units_sold
			FROM stock_movements m
			WHERE m.user_id = ?
				AND m.movement_type = 'out'
				AND m.quantity_delta < 0
				AND DATE(m.created_at) >= DATE('now', ?)
			GROUP BY m.product_id, DATE(m.created_at)
			ORDER BY m.product_id ASC, sale_date ASC;`,
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
			m.product_id,
			DATE(m.created_at) AS sale_date,
			ABS(SUM(m.quantity_delta)) AS units_sold
		 FROM stock_movements m
		 WHERE m.movement_type = 'out'
			AND m.user_id = ?
			AND m.quantity_delta < 0
			AND DATE(m.created_at) >= DATE('now', ?)
			AND m.product_id = ?
		 GROUP BY m.product_id, DATE(m.created_at)
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
				m.product_id,
				ABS(SUM(m.quantity_delta)) AS total_units_sold,
				COUNT(DISTINCT DATE(m.created_at)) AS sales_days
			FROM stock_movements m
			WHERE m.user_id = ?
				AND m.movement_type = 'out'
				AND m.quantity_delta < 0
				AND DATE(m.created_at) >= DATE('now', ?)
			GROUP BY m.product_id
			ORDER BY m.product_id ASC;`,
			userId,
			fromModifier
		);
	};

	return run();
};

export const updateCustomer = ({ id, name, phone = null, address = null }) => {
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
			`SELECT server_id, client_ref_id, sync_version FROM customers WHERE id = ? AND user_id = ?;`,
			normalizedId,
			userId
		);

		if (!existing) {
			throw new Error('Customer not found.');
		}

		const nextSyncVersion = Number(existing.sync_version || 0) + 1;
		const clientRefId = String(existing.client_ref_id || '').trim() || buildLocalClientRefId({ entityType: 'customer', localId: normalizedId });

		return db
		.runAsync(
			`UPDATE customers
			 SET name = ?,
				 phone = ?,
				 address = ?,
				 updated_at = datetime('now'),
				 client_ref_id = ?,
				 sync_version = ?,
				 sync_updated_at = ?,
				 deleted_at = NULL
			 WHERE id = ? AND user_id = ?;`,
			normalizedName,
			normalizedPhone || null,
			normalizedAddress || null,
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
					deletedAt: null,
				},
			});

			return {
				id: normalizedId,
				name: normalizedName,
				phone: normalizedPhone || null,
				address: normalizedAddress || null,
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
