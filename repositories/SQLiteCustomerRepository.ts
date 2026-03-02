import { db } from "../services/database";
import {
    Customer,
    NewCustomer,
    NewTransaction,
    Transaction,
    UpdateCustomer,
} from "../types";
import { ICustomerRepository } from "./ICustomerRepository";

/**
 * SQLite-backed implementation of ICustomerRepository.
 *
 * All writes that touch more than one table are wrapped in
 * explicit BEGIN / COMMIT transactions so the DB is never left
 * in a partial state.
 *
 * Usage:
 *   const repo = new SQLiteCustomerRepository();
 *   const customers = repo.getAll();
 */
export class SQLiteCustomerRepository implements ICustomerRepository {
  // ── Queries ──────────────────────────────────────────────────────────────

  getAll(): Customer[] {
    return db.getAllSync<Customer>(
      "SELECT * FROM customers ORDER BY name ASC;",
    );
  }

  getById(id: number): Customer | null {
    return (
      db.getFirstSync<Customer>("SELECT * FROM customers WHERE id = ?;", [
        id,
      ]) ?? null
    );
  }

  search(query: string): Customer[] {
    const pattern = `%${query}%`;
    return db.getAllSync<Customer>(
      `SELECT * FROM customers
       WHERE name LIKE ? OR nickname LIKE ?
       ORDER BY name ASC;`,
      [pattern, pattern],
    );
  }

  getWithOutstandingBaki(): Customer[] {
    return db.getAllSync<Customer>(
      `SELECT * FROM customers
       WHERE total_baki > 0
       ORDER BY total_baki DESC;`,
    );
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  create(data: NewCustomer): number {
    db.runSync(
      `INSERT INTO customers (name, phone, nickname, total_baki, trust_score)
       VALUES (?, ?, ?, ?, ?);`,
      [
        data.name,
        data.phone ?? null,
        data.nickname ?? null,
        data.total_baki ?? 0,
        data.trust_score ?? 3,
      ],
    );
    const row = db.getFirstSync<{ id: number }>(
      "SELECT last_insert_rowid() AS id;",
    );
    if (!row) throw new Error("Failed to retrieve new customer id");
    return row.id;
  }

  update(id: number, data: UpdateCustomer): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push("phone = ?");
      values.push(data.phone);
    }
    if (data.nickname !== undefined) {
      fields.push("nickname = ?");
      values.push(data.nickname);
    }
    if (data.trust_score !== undefined) {
      fields.push("trust_score = ?");
      values.push(data.trust_score);
    }

    if (fields.length === 0) return; // nothing to update

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    db.runSync(
      `UPDATE customers SET ${fields.join(", ")} WHERE id = ?;`,
      values,
    );
  }

  delete(id: number): void {
    db.execSync("BEGIN;");
    try {
      db.runSync("DELETE FROM transactions WHERE customer_id = ?;", [id]);
      db.runSync("DELETE FROM customers WHERE id = ?;", [id]);
      db.execSync("COMMIT;");
    } catch (err) {
      db.execSync("ROLLBACK;");
      throw err;
    }
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  getTransactions(customerId: number): Transaction[] {
    return db.getAllSync<Transaction>(
      "SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC;",
      [customerId],
    );
  }

  addTransaction(data: NewTransaction): number {
    db.execSync("BEGIN;");
    try {
      // 1. Insert transaction record
      db.runSync(
        "INSERT INTO transactions (customer_id, type, amount, note) VALUES (?, ?, ?, ?);",
        [data.customer_id, data.type, data.amount, data.note ?? null],
      );
      const txRow = db.getFirstSync<{ id: number }>(
        "SELECT last_insert_rowid() AS id;",
      );
      if (!txRow) throw new Error("Failed to retrieve new transaction id");

      // 2. Recalculate total_baki from all transactions (source of truth)
      const sum = db.getFirstSync<{ baki: number }>(
        `SELECT
           SUM(CASE WHEN type = 'credit'  THEN amount ELSE 0 END) -
           SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) AS baki
         FROM transactions
         WHERE customer_id = ?;`,
        [data.customer_id],
      );
      db.runSync(
        "UPDATE customers SET total_baki = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
        [sum?.baki ?? 0, data.customer_id],
      );

      db.execSync("COMMIT;");
      return txRow.id;
    } catch (err) {
      db.execSync("ROLLBACK;");
      throw err;
    }
  }
}
