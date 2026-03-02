import { db } from "../services/database";
import { NewProduct, Product, WeeklySale } from "../types";
import { IProductRepository } from "./IProductRepository";

export class SQLiteProductRepository implements IProductRepository {
  // ── Queries ──────────────────────────────────────────────────────────────

  getAll(): Product[] {
    return db.getAllSync<Product>("SELECT * FROM products ORDER BY name ASC;");
  }

  getById(id: number): Product | null {
    return (
      db.getFirstSync<Product>("SELECT * FROM products WHERE id = ?;", [id]) ??
      null
    );
  }

  getLowStock(): Product[] {
    return db.getAllSync<Product>(
      "SELECT * FROM products WHERE stock <= low_stock_threshold ORDER BY stock ASC;",
    );
  }

  getWeeklySales(productId?: number): WeeklySale[] {
    if (productId !== undefined) {
      return db.getAllSync<WeeklySale>(
        "SELECT * FROM weekly_sales WHERE product_id = ? ORDER BY week_start DESC;",
        [productId],
      );
    }
    return db.getAllSync<WeeklySale>(
      "SELECT * FROM weekly_sales ORDER BY week_start DESC, product_id ASC;",
    );
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  create(data: NewProduct): number {
    db.runSync(
      `INSERT INTO products (name, price, cost_price, stock, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?);`,
      [
        data.name,
        data.price,
        data.cost_price ?? null,
        data.stock ?? 0,
        data.low_stock_threshold ?? 10,
      ],
    );
    const row = db.getFirstSync<{ id: number }>(
      "SELECT last_insert_rowid() AS id;",
    );
    if (!row) throw new Error("Failed to retrieve new product id");
    return row.id;
  }

  update(id: number, data: Partial<NewProduct>): void {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.price !== undefined) {
      fields.push("price = ?");
      values.push(data.price);
    }
    if (data.cost_price !== undefined) {
      fields.push("cost_price = ?");
      values.push(data.cost_price);
    }
    if (data.stock !== undefined) {
      fields.push("stock = ?");
      values.push(data.stock);
    }
    if (data.low_stock_threshold !== undefined) {
      fields.push("low_stock_threshold = ?");
      values.push(data.low_stock_threshold);
    }

    if (fields.length === 0) return;

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    db.runSync(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ?;`,
      values,
    );
  }

  delete(id: number): void {
    db.execSync("BEGIN;");
    db.runSync(
      "DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE customer_id IS NULL);",
    );
    db.runSync("DELETE FROM weekly_sales WHERE product_id = ?;", [id]);
    db.runSync("DELETE FROM products WHERE id = ?;", [id]);
    db.execSync("COMMIT;");
  }

  adjustStock(id: number, delta: number): number {
    db.runSync(
      `UPDATE products
       SET stock = MAX(0, stock + ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [delta, id],
    );
    const row = db.getFirstSync<{ stock: number }>(
      "SELECT stock FROM products WHERE id = ?;",
      [id],
    );
    return row?.stock ?? 0;
  }
}
