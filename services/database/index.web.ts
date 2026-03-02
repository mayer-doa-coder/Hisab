/**
 * Web implementation — expo-sqlite is not available in the browser.
 *
 * Metro resolves *.web.ts before *.ts when bundling for web, so this
 * file is used instead of index.ts on web.
 *
 * We use sql.js (a WASM port of SQLite) to provide a real SQLite
 * database in the browser, with persistence via localStorage.
 */

import initSqlJs, { Database } from "sql.js";

const STORAGE_KEY = "hisab-sqlite-db";
let _db: Database | null = null;

/** Persist the current DB state to localStorage as a base64 string. */
function save(): void {
  if (!_db || typeof localStorage === "undefined") return;
  const data = _db.export();
  // Convert Uint8Array → base64 without spreading large arrays on the stack
  let binary = "";
  for (let i = 0; i < data.byteLength; i++)
    binary += String.fromCharCode(data[i]);
  localStorage.setItem(STORAGE_KEY, btoa(binary));
}

/** Throws if called before dbReady resolves. */
function getDb(): Database {
  if (!_db) throw new Error("[hisab-web] DB not ready. Await dbReady first.");
  return _db;
}

/**
 * Promise that resolves once sql.js WASM is loaded and the database is
 * either restored from localStorage or freshly created.
 *
 * _layout.tsx awaits this before calling createTables() / seedDummyData().
 */
export const dbReady: Promise<void> =
  // Metro evaluates *.web.ts in a Node.js-like context during bundling where
  // `window` is undefined and its custom `require` shim has no `.resolve`.
  // Skip sql.js entirely in that case — the real initialisation only needs to
  // run once the browser has actually loaded the bundle.
  typeof window === "undefined"
    ? Promise.resolve()
    : initSqlJs({
        // Serve the WASM from the local Expo dev-server (public/sql-wasm.wasm)
        // instead of a CDN — avoids CDN fetch failures and CORS issues in dev.
        // The file is copied by `npm run copy-wasm` (runs automatically via postinstall).
        locateFile: () => "/sql-wasm.wasm",
      }).then((SQL) => {
        const saved =
          typeof localStorage !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : null;

        if (saved) {
          const binary = atob(saved);
          const buf = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
          _db = new SQL.Database(buf);
        } else {
          _db = new SQL.Database();
        }
      });

/** Mirrors the expo-sqlite synchronous API surface used throughout the app. */
export const db = {
  /** Run one or more DDL / DML statements without parameters (e.g. CREATE TABLE, BEGIN). */
  execSync(sql: string): void {
    getDb().exec(sql);
    save();
  },

  /** Run a single parameterized statement (INSERT / UPDATE / DELETE). */
  runSync(
    sql: string,
    params?: unknown[],
  ): { lastInsertRowId: number; changes: number } {
    getDb().run(sql, (params ?? []) as (string | number | null | Uint8Array)[]);
    save();
    return { lastInsertRowId: 0, changes: 0 };
  },

  /** Return all matching rows as plain objects. */
  getAllSync<T = unknown>(sql: string, params?: unknown[]): T[] {
    const results = getDb().exec(
      sql,
      (params ?? []) as (string | number | null | Uint8Array)[],
    );
    if (!results.length) return [];
    const { columns, values } = results[0];
    return values.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as T;
    });
  },

  /** Return the first matching row, or null. */
  getFirstSync<T = unknown>(sql: string, params?: unknown[]): T | null {
    return this.getAllSync<T>(sql, params)[0] ?? null;
  },
};

/**
 * Returns the raw bytes of the current database, or null if the DB is not
 * initialised yet. Used by the Export button in dev-db.tsx.
 */
export function getDbBytes(): Uint8Array | null {
  return _db ? _db.export() : null;
}
