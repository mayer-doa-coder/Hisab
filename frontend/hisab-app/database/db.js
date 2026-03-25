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

const SALES_AGGREGATION_DAILY_SQL = `SELECT
	m.product_id,
	DATE(m.created_at) AS sale_date,
	ABS(SUM(m.quantity_delta)) AS units_sold
FROM stock_movements m
WHERE m.movement_type = 'out'
	AND m.quantity_delta < 0
	AND DATE(m.created_at) >= DATE('now', ?)
GROUP BY m.product_id, DATE(m.created_at)
ORDER BY m.product_id ASC, sale_date ASC;`;

const SALES_AGGREGATION_SUMMARY_SQL = `SELECT
	m.product_id,
	ABS(SUM(m.quantity_delta)) AS total_units_sold,
	COUNT(DISTINCT DATE(m.created_at)) AS sales_days
FROM stock_movements m
WHERE m.movement_type = 'out'
	AND m.quantity_delta < 0
	AND DATE(m.created_at) >= DATE('now', ?)
GROUP BY m.product_id
ORDER BY m.product_id ASC;`;

export const createTables = async () => {
	await db.execAsync(`CREATE TABLE IF NOT EXISTS products (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
		low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
		price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS customers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		phone TEXT,
		address TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS baki_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		customer_id INTEGER NOT NULL,
		amount REAL NOT NULL CHECK (amount > 0),
		paid_amount REAL NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
		status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
		note TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
		CHECK (paid_amount <= amount)
	);`);

	await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_movements (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		product_id INTEGER NOT NULL,
		movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust')),
		quantity_delta INTEGER NOT NULL,
		quantity_before INTEGER NOT NULL,
		quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
		note TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
	);`);

	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_customer_id ON baki_entries(customer_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_created_at ON baki_entries(created_at DESC);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);`);

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

	await ensureColumn('baki_entries', 'paid_amount', `ALTER TABLE baki_entries ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;`);
	await ensureColumn('baki_entries', 'status', `ALTER TABLE baki_entries ADD COLUMN status TEXT NOT NULL DEFAULT 'unpaid';`);
	await ensureColumn('baki_entries', 'note', `ALTER TABLE baki_entries ADD COLUMN note TEXT;`);
	await ensureColumn('baki_entries', 'created_at', `ALTER TABLE baki_entries ADD COLUMN created_at DATETIME;`);
	await ensureColumn('baki_entries', 'updated_at', `ALTER TABLE baki_entries ADD COLUMN updated_at DATETIME;`);

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

	await db.execAsync(`UPDATE baki_entries
		SET created_at = COALESCE(created_at, datetime('now')),
			updated_at = COALESCE(updated_at, datetime('now')),
			status = COALESCE(status, 'unpaid'),
			paid_amount = COALESCE(paid_amount, 0)
		WHERE created_at IS NULL
			OR updated_at IS NULL
			OR status IS NULL
			OR paid_amount IS NULL;`);
};

export const insertCustomer = ({ name, phone = null, address = null }) => {
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedPhone = typeof phone === 'string' ? phone.trim() : null;
	const normalizedAddress = typeof address === 'string' ? address.trim() : null;

	if (!normalizedName) {
		return Promise.reject(new Error('Customer name is required.'));
	}

	return db
		.runAsync(
			`INSERT INTO customers (name, phone, address)
			 VALUES (?, ?, ?);`,
			normalizedName,
			normalizedPhone || null,
			normalizedAddress || null
		)
		.then((result) => ({
			id: result.lastInsertRowId,
			name: normalizedName,
			phone: normalizedPhone || null,
			address: normalizedAddress || null,
		}));
};

export const addCustomer = (payload) => insertCustomer(payload);

export const getCustomers = () =>
	db.getAllAsync(
		`SELECT c.id,
				c.name,
				c.phone,
				c.address,
				c.created_at,
				c.updated_at,
				COALESCE(SUM(b.amount - b.paid_amount), 0) AS total_due
		 FROM customers c
		 LEFT JOIN baki_entries b ON b.customer_id = c.id
		 GROUP BY c.id
		 ORDER BY c.id DESC;`
	);

export const fetchCustomers = () => getCustomers();

export const insertBakiEntry = ({ customerId, amount, note = null, status = 'unpaid' }) => {
	const normalizedCustomerId = Number(customerId);
	const normalizedAmount = Number(amount);
	const normalizedNote = typeof note === 'string' ? note.trim() : null;
	const allowedStatuses = new Set(['unpaid', 'partial', 'paid']);
	const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : 'unpaid';

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
		return Promise.reject(new Error('Amount must be a positive number.'));
	}

	if (!allowedStatuses.has(normalizedStatus)) {
		return Promise.reject(new Error("Status must be one of: unpaid, partial, paid."));
	}

	return db
		.runAsync(
			`INSERT INTO baki_entries (customer_id, amount, status, note)
			 VALUES (?, ?, ?, ?);`,
			normalizedCustomerId,
			normalizedAmount,
			normalizedStatus,
			normalizedNote || null
		)
		.then((result) => ({
			id: result.lastInsertRowId,
			customer_id: normalizedCustomerId,
			amount: normalizedAmount,
			status: normalizedStatus,
			note: normalizedNote || null,
		}));
};

export const addBaki = (payload) => insertBakiEntry(payload);

export const getBakiHistory = ({ customerId = null } = {}) => {
	if (customerId === null || customerId === undefined) {
		return db.getAllAsync(
			`SELECT b.id,
					b.customer_id,
					c.name AS customer_name,
					c.phone AS customer_phone,
					b.amount,
					b.paid_amount,
					(b.amount - b.paid_amount) AS due_amount,
					b.status,
					b.note,
					b.created_at,
					b.updated_at
			 FROM baki_entries b
			 JOIN customers c ON c.id = b.customer_id
			 ORDER BY b.created_at DESC, b.id DESC;`
		);
	}

	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT b.id,
				b.customer_id,
				c.name AS customer_name,
				c.phone AS customer_phone,
				b.amount,
				b.paid_amount,
				(b.amount - b.paid_amount) AS due_amount,
				b.status,
				b.note,
				b.created_at,
				b.updated_at
		 FROM baki_entries b
		 JOIN customers c ON c.id = b.customer_id
		 WHERE b.customer_id = ?
		 ORDER BY b.created_at DESC, b.id DESC;`,
		normalizedCustomerId
	);
};

export const fetchBakiWithCustomer = (options = {}) => getBakiHistory(options);

export const getBakiHistoryByCustomer = (customerId) => {
	const normalizedCustomerId = Number(customerId);

	if (!Number.isInteger(normalizedCustomerId) || normalizedCustomerId <= 0) {
		return Promise.reject(new Error('Valid customerId is required.'));
	}

	return db.getAllAsync(
		`SELECT * FROM (
			SELECT b.id,
					b.customer_id,
					c.name AS customer_name,
					c.phone AS customer_phone,
					b.amount,
					b.paid_amount,
					(b.amount - b.paid_amount) AS due_amount,
					b.status,
					b.note,
					b.created_at,
					b.updated_at
			FROM baki_entries b
			JOIN customers c ON c.id = b.customer_id
			WHERE b.customer_id = ?
		)
		ORDER BY created_at DESC, id DESC;`,
		normalizedCustomerId
	);
};

export const insertProduct = ({ name, quantity, price, expiryDate = null, lowStockThreshold = 5 }) => {
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

	return db
		.runAsync(
			`INSERT INTO products (name, quantity, price, expiry_date, low_stock_threshold)
			 VALUES (?, ?, ?, ?, ?);`,
			normalizedName,
			normalizedQuantity,
			normalizedPrice,
			normalizedExpiryDate,
			normalizedLowStockThreshold
		)
		.then((result) => ({
			id: result.lastInsertRowId,
			name: normalizedName,
			quantity: normalizedQuantity,
			price: normalizedPrice,
			expiry_date: normalizedExpiryDate,
			low_stock_threshold: normalizedLowStockThreshold,
		}));
};

export const updateProduct = async ({ id, name, quantity, price, expiryDate = null, lowStockThreshold = 5 }) => {
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

	const existing = await db.getFirstAsync(`SELECT quantity FROM products WHERE id = ?;`, normalizedId);
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

	return db
		.runAsync(
			`UPDATE products
			 SET name = ?, quantity = ?, price = ?, expiry_date = ?, low_stock_threshold = ?
			 WHERE id = ?;`,
			normalizedName,
			normalizedQuantity,
			normalizedPrice,
			normalizedExpiryDate,
			normalizedLowStockThreshold,
			normalizedId
		)
		.then((result) => {
			if (!result.changes) {
				throw new Error('Product not found.');
			}

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
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid product id is required.'));
	}

	return db.runAsync(`DELETE FROM products WHERE id = ?;`, normalizedId).then((result) => {
		if (!result.changes) {
			throw new Error('Product not found.');
		}

		return { id: normalizedId };
	});
};

export const getProducts = () =>
	db.getAllAsync(
		`SELECT id, name, quantity, price, expiry_date, low_stock_threshold, created_at
		 FROM products
		 ORDER BY id DESC;`
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
			`SELECT id, quantity FROM products WHERE id = ?;`,
			normalizedProductId
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
				product_id,
				movement_type,
				quantity_delta,
				quantity_before,
				quantity_after,
				note
			)
			VALUES (?, ?, ?, ?, ?, ?);`,
			normalizedProductId,
			normalizedMovementType,
			quantityDelta,
			currentQuantity,
			nextQuantity,
			normalizedNote || null
		);

		await db.runAsync(`UPDATE products SET quantity = ? WHERE id = ?;`, nextQuantity, normalizedProductId);
		await db.execAsync('COMMIT;');

		return {
			id: insertResult.lastInsertRowId,
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
			 ORDER BY m.created_at DESC, m.id DESC
			 LIMIT ?;`,
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
		 ORDER BY m.created_at DESC, m.id DESC
		 LIMIT ?;`,
		normalizedProductId,
		normalizedLimit
	);
};

export const getProductSalesDailyAggregation = ({ days = 30, productId = null } = {}) => {
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) > 0 ? Number(days) : 30;
	const fromModifier = `-${Math.max(0, normalizedDays - 1)} days`;

	if (productId === null || productId === undefined) {
		return db.getAllAsync(SALES_AGGREGATION_DAILY_SQL, fromModifier);
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
			AND m.quantity_delta < 0
			AND DATE(m.created_at) >= DATE('now', ?)
			AND m.product_id = ?
		 GROUP BY m.product_id, DATE(m.created_at)
		 ORDER BY sale_date ASC;`,
		fromModifier,
		normalizedProductId
	);
};

export const getProductSalesSummaryAggregation = ({ days = 30 } = {}) => {
	const normalizedDays = Number.isInteger(Number(days)) && Number(days) > 0 ? Number(days) : 30;
	const fromModifier = `-${Math.max(0, normalizedDays - 1)} days`;

	return db.getAllAsync(SALES_AGGREGATION_SUMMARY_SQL, fromModifier);
};

export const updateCustomer = ({ id, name, phone = null, address = null }) => {
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

	return db
		.runAsync(
			`UPDATE customers
			 SET name = ?, phone = ?, address = ?, updated_at = datetime('now')
			 WHERE id = ?;`,
			normalizedName,
			normalizedPhone || null,
			normalizedAddress || null,
			normalizedId
		)
		.then((result) => {
			if (!result.changes) {
				throw new Error('Customer not found.');
			}

			return {
				id: normalizedId,
				name: normalizedName,
				phone: normalizedPhone || null,
				address: normalizedAddress || null,
			};
		});
};

export const deleteCustomer = (id) => {
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid customer id is required.'));
	}

	return db.runAsync(`DELETE FROM customers WHERE id = ?;`, normalizedId).then((result) => {
		if (!result.changes) {
			throw new Error('Customer not found.');
		}

		return { id: normalizedId };
	});
};

export const updateBakiStatus = ({ id, status, paidAmount }) => {
	const normalizedId = Number(id);
	const allowedStatuses = new Set(['unpaid', 'partial', 'paid']);
	const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid baki id is required.'));
	}

	if (!allowedStatuses.has(normalizedStatus)) {
		return Promise.reject(new Error("Status must be one of: unpaid, partial, paid."));
	}

	return db
		.getFirstAsync(`SELECT id, amount, paid_amount FROM baki_entries WHERE id = ?;`, normalizedId)
		.then((existing) => {
			if (!existing) {
				throw new Error('Baki entry not found.');
			}

			const amount = Number(existing.amount);
			let nextPaidAmount = Number(existing.paid_amount);

			if (normalizedStatus === 'paid') {
				nextPaidAmount = amount;
			} else if (normalizedStatus === 'unpaid') {
				nextPaidAmount = 0;
			} else if (paidAmount !== undefined && paidAmount !== null) {
				const normalizedPaidAmount = Number(paidAmount);
				if (!Number.isFinite(normalizedPaidAmount) || normalizedPaidAmount < 0 || normalizedPaidAmount > amount) {
					throw new Error('Paid amount must be between 0 and total amount.');
				}
				nextPaidAmount = normalizedPaidAmount;
			}

			return db.runAsync(
				`UPDATE baki_entries
				 SET status = ?, paid_amount = ?, updated_at = datetime('now')
				 WHERE id = ?;`,
				normalizedStatus,
				nextPaidAmount,
				normalizedId
			);
		})
		.then((result) => {
			if (!result.changes) {
				throw new Error('Baki entry not found.');
			}

			return { id: normalizedId, status: normalizedStatus };
		});
};

export const deleteBaki = (id) => {
	const normalizedId = Number(id);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid baki id is required.'));
	}

	return db.runAsync(`DELETE FROM baki_entries WHERE id = ?;`, normalizedId).then((result) => {
		if (!result.changes) {
			throw new Error('Baki entry not found.');
		}

		return { id: normalizedId };
	});
};

export default db;
