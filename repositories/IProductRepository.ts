import { NewProduct, Product, WeeklySale } from "../types";

/**
 * Contract for product / inventory database operations.
 */
export interface IProductRepository {
  getAll(): Product[];
  getById(id: number): Product | null;
  /** Products whose current stock ≤ low_stock_threshold */
  getLowStock(): Product[];
  create(data: NewProduct): number;
  update(id: number, data: Partial<NewProduct>): void;
  delete(id: number): void;
  /**
   * Add `delta` to the product's stock (use negative values to subtract).
   * Returns the new stock level.
   */
  adjustStock(id: number, delta: number): number;
  /** Weekly sales rows for one product, or all products if omitted */
  getWeeklySales(productId?: number): WeeklySale[];
}
