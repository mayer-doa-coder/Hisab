/**
 * saleStore.ts
 *
 * Zustand store for the Sales module.
 *
 * State:
 *   sales       — all sale records, newest first
 *   isLoading   — in-flight flag
 *   loadingOp   — granular operation label
 *   error       — last error message
 *
 * After recordSale, we immediately:
 *   1. Reload the sales list.
 *   2. Reload the product store (stock deducted).
 *   3. Reload the customer store (total_baki updated for baki sales).
 */

import { create } from "zustand";
import { DailyTotal, ProductTotal } from "../repositories/ISaleRepository";
import { dbReady } from "../services/database";
import { toMessage } from "../services/errors";
import { saleService } from "../services/saleService";
import { Sale, SaleItem } from "../types";

// ── Inline line-item type for the cart ───────────────────────────────────────

export interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  price: number; // per unit selling price
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface SaleState {
  sales: Sale[];
  isLoading: boolean;
  loadingOp: "initial" | "saving" | "refresh" | null;
  error: string | null;

  load: () => Promise<void>;
  recordSale: (payload: {
    customer_id: number | null;
    is_baki: boolean;
    items: CartItem[];
  }) => Promise<number>;
  getSaleItems: (saleId: number) => SaleItem[];
  getDailyTotals: (from: string, to: string) => DailyTotal[];
  getWeeklyProductTotals: () => ProductTotal[];
  clearError: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSaleStore = create<SaleState>((set, get) => ({
  sales: [],
  isLoading: false,
  loadingOp: null,
  error: null,

  async load() {
    if (get().isLoading) return;
    const op = get().sales.length === 0 ? "initial" : "refresh";
    set({ isLoading: true, loadingOp: op, error: null });
    try {
      await dbReady;
      const sales = saleService.getSales();
      set({ sales, isLoading: false, loadingOp: null });
    } catch (err) {
      set({ isLoading: false, loadingOp: null, error: toMessage(err) });
    }
  },

  async recordSale({ customer_id, is_baki, items }) {
    set({ isLoading: true, loadingOp: "saving", error: null });
    try {
      await dbReady;
      const id = saleService.recordSale({
        customer_id,
        is_baki,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.price,
        })),
      });
      const sales = saleService.getSales();
      set({ sales, isLoading: false, loadingOp: null });

      // Side-effects: refresh stock + customer balances
      Promise.all([
        import("./productStore").then(({ useProductStore }) =>
          useProductStore.getState().load(),
        ),
        import("./customerStore").then(({ useCustomerStore }) =>
          useCustomerStore.getState().load(),
        ),
      ]).catch(() => {});

      return id;
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  getSaleItems(saleId: number) {
    return saleService.getSaleItems(saleId);
  },

  getDailyTotals(from: string, to: string) {
    return saleService.getDailyTotals(from, to);
  },

  getWeeklyProductTotals() {
    return saleService.getWeeklyProductTotals();
  },

  clearError() {
    set({ error: null });
  },
}));
