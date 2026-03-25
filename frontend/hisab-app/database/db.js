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

export const createTables = async () => {
	await db.execAsync(`CREATE TABLE IF NOT EXISTS products (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
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

	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_customer_id ON baki_entries(customer_id);`);
	await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_baki_created_at ON baki_entries(created_at DESC);`);

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
	await ensureColumn('products', 'created_at', `ALTER TABLE products ADD COLUMN created_at DATETIME;`);

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

export const insertProduct = ({ name, quantity, price }) => {
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedQuantity = Number(quantity);
	const normalizedPrice = Number(price);

	if (!normalizedName) {
		return Promise.reject(new Error('Product name is required.'));
	}

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
		return Promise.reject(new Error('Quantity must be a non-negative integer.'));
	}

	if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
		return Promise.reject(new Error('Price must be a non-negative number.'));
	}

	return db
		.runAsync(
			`INSERT INTO products (name, quantity, price)
			 VALUES (?, ?, ?);`,
			normalizedName,
			normalizedQuantity,
			normalizedPrice
		)
		.then((result) => ({
			id: result.lastInsertRowId,
			name: normalizedName,
			quantity: normalizedQuantity,
			price: normalizedPrice,
		}));
};

export const updateProduct = ({ id, name, quantity, price }) => {
	const normalizedId = Number(id);
	const normalizedName = typeof name === 'string' ? name.trim() : '';
	const normalizedQuantity = Number(quantity);
	const normalizedPrice = Number(price);

	if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
		return Promise.reject(new Error('Valid product id is required.'));
	}

	if (!normalizedName) {
		return Promise.reject(new Error('Product name is required.'));
	}

	if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
		return Promise.reject(new Error('Quantity must be a non-negative integer.'));
	}

	if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
		return Promise.reject(new Error('Price must be a non-negative number.'));
	}

	return db
		.runAsync(
			`UPDATE products
			 SET name = ?, quantity = ?, price = ?
			 WHERE id = ?;`,
			normalizedName,
			normalizedQuantity,
			normalizedPrice,
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
		`SELECT id, name, quantity, price, created_at
		 FROM products
		 ORDER BY id DESC;`
	);

export const fetchProducts = () => getProducts();

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
