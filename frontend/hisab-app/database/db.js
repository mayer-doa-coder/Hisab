import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('hisab.db');

export const createTables = async () => {
	await db.execAsync(`CREATE TABLE IF NOT EXISTS products (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL CHECK (length(trim(name)) > 0),
		quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
		price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`);

	const columns = await db.getAllAsync(`PRAGMA table_info(products);`);
	const columnNames = new Set(columns.map((column) => column.name));

	if (!columnNames.has('quantity')) {
		await db.execAsync(`ALTER TABLE products ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0;`);
	}

	if (!columnNames.has('price')) {
		await db.execAsync(`ALTER TABLE products ADD COLUMN price REAL NOT NULL DEFAULT 0;`);
	}

	if (!columnNames.has('created_at')) {
		await db.execAsync(`ALTER TABLE products ADD COLUMN created_at DATETIME;`);
	}

	await db.execAsync(`UPDATE products
		SET created_at = COALESCE(created_at, datetime('now'))
		WHERE created_at IS NULL;`);
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

export const getProducts = () =>
	db.getAllAsync(
		`SELECT id, name, quantity, price, created_at
		 FROM products
		 ORDER BY id DESC;`
	);

export const fetchProducts = () => getProducts();

export default db;
