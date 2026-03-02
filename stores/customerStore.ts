/**
 * customerStore.ts
 *
 * Zustand store — single source of truth for customers in the UI.
 *
 * Architecture:
 *   SQLite ──► customerService (validation + error wrapping)
 *                    │
 *                    ▼
 *             customerStore  ◄──  React components (via useCustomerStore)
 *
 * State shape:
 *   customers  — full list, always sorted A→Z by name
 *   totalBaki  — sum of every customer's total_baki (derived, cached)
 *   isLoading  — true while any async op is in flight
 *   error      — last error message, cleared on next successful op
 *
 * All mutation actions (addCustomer, updateCustomer, deleteCustomer) call
 * the service layer, then automatically reload the full list so the UI
 * is always consistent with the database.
 */

import { create } from "zustand";
import { customerService } from "../services/customerService";
import { dbReady } from "../services/database";
import { toMessage } from "../services/errors";
import { Customer, NewCustomer, UpdateCustomer } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomerState {
  // ── Data ────────────────────────────────────────────────────────────────────
  customers: Customer[];
  /** Sum of outstanding baki across all customers (₹). */
  totalBaki: number;

  // ── Async status ─────────────────────────────────────────────────────────────
  isLoading: boolean; /**
   * Identifies which operation is currently in flight.
   *   'initial'  — first list load (no cached data yet → show full-screen spinner)
   *   'saving'   — addCustomer / updateCustomer in progress
   *   'deleting' — deleteCustomer in progress
   *   'refresh'  — background reload after a mutation (list already visible)
   *   null       — idle
   */
  loadingOp:
    | "initial"
    | "saving"
    | "deleting"
    | "refresh"
    | null; /** Non-null when the last operation threw an error. */
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * (Re)load the full customer list from the database.
   * Called automatically on mount and after every mutation.
   */
  load: () => Promise<void>;

  /**
   * Validate + persist a new customer, then refresh the list.
   * @returns the new customer's database id.
   * @throws propagates any {ValidationError} so the form can display it.
   */
  addCustomer: (data: NewCustomer) => Promise<number>;

  /**
   * Validate + update an existing customer, then refresh the list.
   * @throws propagates any {ValidationError} or {NotFoundError}.
   */
  updateCustomer: (id: number, data: UpdateCustomer) => Promise<void>;

  /**
   * Delete a customer and all their transactions, then refresh.
   * @throws propagates any {NotFoundError}.
   */
  deleteCustomer: (id: number) => Promise<void>;

  /** Clear a stale error banner without triggering a reload. */
  clearError: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcTotalBaki(customers: Customer[]): number {
  return customers.reduce((sum, c) => sum + (c.total_baki ?? 0), 0);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  totalBaki: 0,
  isLoading: false,
  loadingOp: null,
  error: null,

  // ── load ──────────────────────────────────────────────────────────────────

  async load() {
    if (get().isLoading) return;

    // 'initial' = no data yet (first paint); 'refresh' = re-sync in background
    const op: CustomerState["loadingOp"] =
      get().customers.length === 0 ? "initial" : "refresh";

    set({ isLoading: true, loadingOp: op, error: null });
    try {
      // On web, sql.js WASM loads asynchronously.  Awaiting dbReady ensures
      // the database is initialised before we query it, even if this store
      // action is somehow triggered before _layout.tsx finishes setup.
      await dbReady;
      const customers = customerService.getCustomers();
      set({
        customers,
        totalBaki: calcTotalBaki(customers),
        isLoading: false,
        loadingOp: null,
      });
    } catch (err) {
      set({ isLoading: false, loadingOp: null, error: toMessage(err) });
    }
  },

  // ── addCustomer ───────────────────────────────────────────────────────────

  async addCustomer(data: NewCustomer) {
    set({ isLoading: true, loadingOp: "saving", error: null });
    try {
      await dbReady;
      const newId = customerService.addCustomer(data);
      const customers = customerService.getCustomers();
      set({
        customers,
        totalBaki: calcTotalBaki(customers),
        isLoading: false,
        loadingOp: null,
      });
      return newId;
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  // ── updateCustomer ────────────────────────────────────────────────────────

  async updateCustomer(id: number, data: UpdateCustomer) {
    set({ isLoading: true, loadingOp: "saving", error: null });
    try {
      await dbReady;
      customerService.updateCustomer(id, data);
      const customers = customerService.getCustomers();
      set({
        customers,
        totalBaki: calcTotalBaki(customers),
        isLoading: false,
        loadingOp: null,
      });
    } catch (err) {
      set({ isLoading: false, loadingOp: null });
      throw err;
    }
  },

  // ── deleteCustomer ────────────────────────────────────────────────────────

  async deleteCustomer(id: number) {
    set({ isLoading: true, loadingOp: "deleting", error: null });
    try {
      await dbReady;
      customerService.deleteCustomer(id);
      const customers = customerService.getCustomers();
      set({
        customers,
        totalBaki: calcTotalBaki(customers),
        isLoading: false,
        loadingOp: null,
      });
    } catch (err) {
      set({ isLoading: false, loadingOp: null, error: toMessage(err) });
      throw err;
    }
  },

  // ── clearError ────────────────────────────────────────────────────────────

  clearError() {
    set({ error: null });
  },
}));
