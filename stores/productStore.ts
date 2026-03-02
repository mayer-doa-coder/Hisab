/**
 * productStore.ts
 *
 * Zustand store — single source of truth for the product catalogue.
 */

import { create } from "zustand";
import { dbReady } from "../services/database";
import { toMessage } from "../services/errors";
import { productService } from "../services/productService";
import { NewProduct, Product } from "../types";

export interface ProductState {
  products: Product[];
  isLoading: boolean;
  loadingOp: "initial" | "saving" | "deleting" | "adjusting" | "refresh" | null;
  error: string | null;

  load: () => Promise<void>;
  addProduct: (data: NewProduct) => Promise<number>;
  updateProduct: (id: number, data: Partial<NewProduct>) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>;
  adjustStock: (id: number, delta: number) => Promise<number>;
  clearError: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countLowStock(products: Product[]): number {
  return products.filter((p) => p.stock <= p.low_stock_threshold).length;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  isLoading: false,
  loadingOp: null,
  error: null,

  async load() {
    if (get().isLoading) return;
    const op = get().products.length === 0 ? "initial" : "refresh";
    set({ isLoading: true, loadingOp: op, error: null });
    try {
      await dbReady;
      const products = productService.getProducts();
      set({ products, isLoading: false, loadingOp: null });
    } catch (err) {
      set({ isLoading: false, loadingOp: null, error: toMessage(err) });
    }
  },

  async addProduct(data: NewProduct) {
    set({ isLoading: true, loadingOp: "saving", error: null });
    try {
      await dbReady;
      const id = productService.addProduct(data);
      const products = productService.getProducts();
      set({ products, isLoading: false, loadingOp: null });
      return id;
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  async updateProduct(id: number, data: Partial<NewProduct>) {
    set({ isLoading: true, loadingOp: "saving", error: null });
    try {
      await dbReady;
      productService.updateProduct(id, data);
      const products = productService.getProducts();
      set({ products, isLoading: false, loadingOp: null });
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  async deleteProduct(id: number) {
    set({ isLoading: true, loadingOp: "deleting", error: null });
    try {
      await dbReady;
      productService.deleteProduct(id);
      const products = productService.getProducts();
      set({ products, isLoading: false, loadingOp: null });
    } catch (err) {
      set({ isLoading: false, loadingOp: null, error: toMessage(err) });
      throw err;
    }
  },

  async adjustStock(id: number, delta: number) {
    set({ isLoading: true, loadingOp: "adjusting", error: null });
    try {
      await dbReady;
      const newStock = productService.adjustStock(id, delta);
      const products = productService.getProducts();
      set({ products, isLoading: false, loadingOp: null });
      return newStock;
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** Selector: number of products currently below their low-stock threshold */
export const selectLowStockCount = (s: ProductState) =>
  countLowStock(s.products);
