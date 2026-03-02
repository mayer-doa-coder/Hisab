/**
 * productService.ts
 *
 * Service layer for product / inventory operations.
 *
 * Responsibilities:
 *  - Input validation (name, price, cost, stock, threshold)
 *  - Wrapping repo errors into typed HisabError subclasses
 *  - Zero UI logic
 */

import { SQLiteProductRepository } from "../repositories/SQLiteProductRepository";
import { NewProduct, Product, WeeklySale } from "../types";
import { DatabaseError, NotFoundError, ValidationError } from "./errors";

const repo = new SQLiteProductRepository();

// ── Validation ────────────────────────────────────────────────────────────────

function validateProductFields(
  data: Partial<NewProduct>,
  requireName = true,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (requireName && (!data.name || data.name.trim().length === 0)) {
    errors.name = "Product name is required";
  } else if (data.name && data.name.trim().length > 100) {
    errors.name = "Name must be 100 characters or fewer";
  }

  if (requireName && (data.price === undefined || data.price === null)) {
    errors.price = "Selling price is required";
  } else if (data.price !== undefined && data.price <= 0) {
    errors.price = "Price must be greater than zero";
  }

  if (data.cost_price !== undefined && data.cost_price !== null) {
    if (data.cost_price < 0) {
      errors.cost_price = "Cost price cannot be negative";
    }
  }

  if (data.stock !== undefined && data.stock < 0) {
    errors.stock = "Stock cannot be negative";
  }

  if (data.low_stock_threshold !== undefined && data.low_stock_threshold < 0) {
    errors.low_stock_threshold = "Threshold cannot be negative";
  }

  return errors;
}

// ── Service API ───────────────────────────────────────────────────────────────

export const productService = {
  getProducts(): Product[] {
    try {
      return repo.getAll();
    } catch (err) {
      throw new DatabaseError("Failed to load products", err);
    }
  },

  getProductById(id: number): Product {
    try {
      const p = repo.getById(id);
      if (!p) throw new NotFoundError("Product", id);
      return p;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new DatabaseError(`Failed to load product ${id}`, err);
    }
  },

  getLowStockProducts(): Product[] {
    try {
      return repo.getLowStock();
    } catch (err) {
      throw new DatabaseError("Failed to load low-stock products", err);
    }
  },

  getWeeklySales(productId?: number): WeeklySale[] {
    try {
      return repo.getWeeklySales(productId);
    } catch (err) {
      throw new DatabaseError("Failed to load weekly sales", err);
    }
  },

  addProduct(data: NewProduct): number {
    const errs = validateProductFields(data, true);
    if (Object.keys(errs).length > 0) {
      throw new ValidationError("Invalid product data", errs);
    }
    try {
      return repo.create({
        ...data,
        name: data.name.trim(),
        stock: data.stock ?? 0,
        low_stock_threshold: data.low_stock_threshold ?? 10,
      });
    } catch (err) {
      throw new DatabaseError("Failed to save product", err);
    }
  },

  updateProduct(id: number, data: Partial<NewProduct>): void {
    const errs = validateProductFields(data, false);
    if (Object.keys(errs).length > 0) {
      throw new ValidationError("Invalid product data", errs);
    }
    try {
      const existing = repo.getById(id);
      if (!existing) throw new NotFoundError("Product", id);
      const trimmed =
        data.name !== undefined ? { ...data, name: data.name.trim() } : data;
      repo.update(id, trimmed);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError)
        throw err;
      throw new DatabaseError(`Failed to update product ${id}`, err);
    }
  },

  deleteProduct(id: number): void {
    try {
      const existing = repo.getById(id);
      if (!existing) throw new NotFoundError("Product", id);
      repo.delete(id);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new DatabaseError(`Failed to delete product ${id}`, err);
    }
  },

  /**
   * Adjust stock by `delta` units (positive = restock, negative = shrinkage).
   * Returns the new stock level.
   */
  adjustStock(id: number, delta: number): number {
    if (delta === 0) throw new ValidationError("Adjustment cannot be zero", {});
    try {
      const existing = repo.getById(id);
      if (!existing) throw new NotFoundError("Product", id);
      return repo.adjustStock(id, delta);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError)
        throw err;
      throw new DatabaseError(`Failed to adjust stock for product ${id}`, err);
    }
  },
};
