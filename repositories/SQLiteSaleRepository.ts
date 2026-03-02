import { db } from "../services/database";
import { Sale, SaleItem } from "../types";
import {
    DailyTotal,
    ISaleRepository,
    NewSalePayload,
    ProductTotal,
} from "./ISaleRepository";

/** Returns ISO date string (YYYY-MM-DD) for the Monday of the current week. */
function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export class SQLiteSaleRepository implements ISaleRepository {
  // ── Write ─────────────────────────────────────────────────────────────────

  create(payload: NewSalePayload): number {
    const total = payload.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Atomic transaction: sale header + line items + stock deduction
    db.execSync("BEGIN;");
    try {
      db.runSync(
        `INSERT INTO sales (customer_id, total, is_baki)
         VALUES (?, ?, ?);`,
        [payload.customer_id ?? null, total, payload.is_baki ? 1 : 0],
      );

      const saleRow = db.getFirstSync<{ id: number }>(
        "SELECT last_insert_rowid() AS id;",
      );
      if (!saleRow) throw new Error("Failed to retrieve new sale id");
      const saleId = saleRow.id;

      const weekStart = getWeekStart();

      for (const item of payload.items) {
        // Insert line item
        db.runSync(
          `INSERT INTO sale_items (sale_id, product_id, quantity, price)
           VALUES (?, ?, ?, ?);`,
          [saleId, item.product_id, item.quantity, item.price],
        );

        // Deduct stock (floor at 0)
        db.runSync(
          `UPDATE products
           SET stock = MAX(0, stock - ?), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?;`,
          [item.quantity, item.product_id],
        );

        // ── Record weekly sales (Feature 1: "Every sale updates weekly_sales") ──
        // Two-step upsert: safe without a UNIQUE constraint.
        db.runSync(
          `INSERT INTO weekly_sales (product_id, week_start, units_sold, state)
           SELECT ?, ?, 0, NULL
           WHERE NOT EXISTS (
             SELECT 1 FROM weekly_sales
             WHERE product_id = ? AND week_start = ?
           );`,
          [item.product_id, weekStart, item.product_id, weekStart],
        );
        db.runSync(
          `UPDATE weekly_sales
           SET units_sold = units_sold + ?
           WHERE product_id = ? AND week_start = ?;`,
          [item.quantity, item.product_id, weekStart],
        );
      }

      // If baki sale and customer is set → create a credit transaction
      if (payload.is_baki && payload.customer_id !== null) {
        db.runSync(
          `INSERT INTO transactions (customer_id, type, amount, note)
           VALUES (?, 'credit', ?, 'বাকি বিক্রয়');`,
          [payload.customer_id, total],
        );

        // Update customer's total_baki
        db.runSync(
          `UPDATE customers SET total_baki = total_baki + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
          [total, payload.customer_id],
        );
      }

      db.execSync("COMMIT;");
      return saleId;
    } catch (err) {
      db.execSync("ROLLBACK;");
      throw err;
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  getAll(): Sale[] {
    const rows = db.getAllSync<{
      id: number;
      customer_id: number | null;
      total: number;
      is_baki: number;
      created_at: string;
    }>("SELECT * FROM sales ORDER BY created_at DESC;");

    return rows.map((r) => ({ ...r, is_baki: r.is_baki === 1 }));
  }

  getById(id: number): Sale | null {
    const row = db.getFirstSync<{
      id: number;
      customer_id: number | null;
      total: number;
      is_baki: number;
      created_at: string;
    }>("SELECT * FROM sales WHERE id = ?;", [id]);

    if (!row) return null;
    return { ...row, is_baki: row.is_baki === 1 };
  }

  getItems(saleId: number): SaleItem[] {
    return db.getAllSync<SaleItem>(
      "SELECT * FROM sale_items WHERE sale_id = ?;",
      [saleId],
    );
  }

  getByCustomer(customerId: number): Sale[] {
    const rows = db.getAllSync<{
      id: number;
      customer_id: number | null;
      total: number;
      is_baki: number;
      created_at: string;
    }>("SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC;", [
      customerId,
    ]);
    return rows.map((r) => ({ ...r, is_baki: r.is_baki === 1 }));
  }

  getDailyTotals(from: string, to: string): DailyTotal[] {
    return db.getAllSync<DailyTotal>(
      `SELECT
         DATE(created_at) AS date,
         SUM(total)       AS total,
         COUNT(*)         AS sale_count
       FROM sales
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY DATE(created_at)
       ORDER BY date DESC;`,
      [from, to],
    );
  }

  getWeeklyProductTotals(): ProductTotal[] {
    return db.getAllSync<ProductTotal>(
      `SELECT
         si.product_id,
         p.name   AS product_name,
         SUM(si.quantity) AS units_sold,
         SUM(si.quantity * si.price) AS revenue
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= DATE('now', '-7 days')
       GROUP BY si.product_id
       ORDER BY revenue DESC;`,
    );
  }
}
