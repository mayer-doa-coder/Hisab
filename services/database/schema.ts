import { db } from ".";

// ── Schema versioning ────────────────────────────────────────────────────────
//
// Bump CURRENT_VERSION whenever you add or alter a table.
// Each migration function is idempotent (uses IF NOT EXISTS / safe ALTER).
//
// Version history:
//   1 → initial schema (customers, transactions, products, sales,
//                        sale_items, weekly_sales)
//
const CURRENT_VERSION = 2;

/** Read user_version pragma (SQLite built-in, always 0 on a fresh DB) */
const getVersion = (): number => {
  const row = db.getFirstSync<{ user_version: number }>("PRAGMA user_version;");
  return row?.user_version ?? 0;
};

/** Apply all pending migrations in order */
const runMigrations = (fromVersion: number): void => {
  if (fromVersion < 1) {
    createV1Tables();
    db.execSync(`PRAGMA user_version = 1;`);
    console.log("[db] Migrated to schema v1");
  }
  if (fromVersion < 2) {
    createV2Indexes();
    db.execSync(`PRAGMA user_version = 2;`);
    console.log("[db] Migrated to schema v2 (indexes)");
  }
  // future: if (fromVersion < 3) { ... }
};

/**
 * Entry point — call once at app startup (before any query).
 * Safe to call on every launch; version guard prevents duplicate migrations.
 */
export const createTables = (): void => {
  const version = getVersion();
  if (version < CURRENT_VERSION) {
    runMigrations(version);
  } else {
    console.log(`[db] Schema up-to-date (v${version})`);
  }
};

/**
 * V2 migration — add covering indexes for the two hottest query paths:
 *   1. getTransactions()  → WHERE customer_id = ?  (most frequent read)
 *   2. getAll()           → ORDER BY name ASC      (startup + every focus)
 */
const createV2Indexes = (): void => {
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
      ON transactions(customer_id);

    CREATE INDEX IF NOT EXISTS idx_customers_name
      ON customers(name);
  `);
};

/**
 * Creates all V1 tables.
 *
 * Tables (from HISAB_Project_Workflow):
 *  - customers      : credit-ledger contacts
 *  - transactions   : individual baki / payment records
 *  - products       : inventory catalogue
 *  - sales          : sales header (cash or baki)
 *  - sale_items     : line items for each sale
 *  - weekly_sales   : aggregated weekly data for Markov prediction
 */
const createV1Tables = (): void => {
  db.execSync(`
    -- ── Customers ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS customers (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      name          TEXT     NOT NULL,
      phone         TEXT,
      nickname      TEXT,
      total_baki    REAL     DEFAULT 0,
      trust_score   INTEGER  DEFAULT 3,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Transactions (baki & payments) ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS transactions (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER  NOT NULL,
      type          TEXT     NOT NULL CHECK(type IN ('credit', 'payment')),
      amount        REAL     NOT NULL,
      note          TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- ── Products (inventory catalogue) ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS products (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      name                TEXT     NOT NULL,
      price               REAL     NOT NULL,
      cost_price          REAL,
      stock               INTEGER  DEFAULT 0,
      low_stock_threshold INTEGER  DEFAULT 10,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Sales header ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sales (
      id          INTEGER  PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,                    -- NULL for cash sales
      total       REAL     NOT NULL,
      is_baki     INTEGER  DEFAULT 0,         -- 0 = false, 1 = true (BOOLEAN)
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- ── Sale line-items ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sale_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id     INTEGER NOT NULL,
      product_id  INTEGER NOT NULL,
      quantity    INTEGER NOT NULL,
      price       REAL    NOT NULL,
      FOREIGN KEY (sale_id)    REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- ── Weekly sales summary (Markov chain input) ─────────────────────────────
    CREATE TABLE IF NOT EXISTS weekly_sales (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      week_start  DATE    NOT NULL,
      units_sold  INTEGER NOT NULL,
      state       TEXT    CHECK(state IN ('LOW', 'MEDIUM', 'HIGH')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
};
