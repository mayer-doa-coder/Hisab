import * as SQLite from "expo-sqlite";

/**
 * Shared SQLite database instance for the entire app.
 * All services import `db` from here — never open a second connection.
 */
export const db = SQLite.openDatabaseSync("hisab.db");

/**
 * On mobile the database is synchronously available immediately.
 * Exported so _layout.tsx can use the same await-pattern as web.
 */
export const dbReady: Promise<void> = Promise.resolve();

/**
 * On mobile expo-sqlite manages the file; return null so the Export button
 * falls through to the `npm run db:pull` adb instructions.
 */
export function getDbBytes(): Uint8Array | null {
  return null;
}
