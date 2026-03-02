/**
 * transactionStore.ts
 *
 * Zustand store for transaction state within a single customer's context.
 *
 * Architecture:
 *   SQLite ──► transactionService (validation + error wrapping)
 *                     │
 *                     ▼
 *             transactionStore  ◄──  customer-detail, baki-modal, payment-modal
 *
 * State shape:
 *   transactions — list for the currently viewed customer, newest first
 *   customerId   — which customer's transactions are loaded
 *   isLoading    — true while any async op is in flight
 *   error        — last error message (display only; mutations re-throw)
 *
 * After every write, the store:
 *   1. Reloads its own transaction list from the service.
 *   2. Triggers customerStore.load() so total_baki reflects in the list screen.
 *
 * Person A — Day 5
 */

import { create } from "zustand";
import { dbReady } from "../services/database";
import { toMessage } from "../services/errors";
import { transactionService } from "../services/transactionService";
import { NewTransaction, Transaction, TransactionType } from "../types";

// ── Helper ────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransactionState {
  /** Transactions for the currently active customer, newest first. */
  transactions: Transaction[];

  /** Which customer's transactions are currently loaded. Null on first render. */
  customerId: number | null;

  /** True while a read or write is in flight. */
  isLoading: boolean;

  /** Set on load failure only (mutations re-throw for the form to handle). */
  error: string | null;

  // ── Derived helpers (computed from transactions) ──────────────────────────

  /** Total credit amount recorded for the loaded customer. */
  totalCredit: () => number;

  /** Total payment amount recorded for the loaded customer. */
  totalPaid: () => number;

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Load (or refresh) transactions for a given customer.
   * Safe to call on every focus — skips if nothing changed.
   */
  loadForCustomer: (customerId: number) => void;

  /**
   * Record a credit (বাকি) transaction.
   *
   * Re-throws ValidationError / DatabaseError so the form UI can display
   * field-level messages.
   *
   * After a successful write: updates local list + triggers global customer
   * store refresh so the Customers tab's total_baki stays current.
   */
  addBaki: (data: Omit<NewTransaction, "type">) => Promise<void>;

  /**
   * Record a payment transaction.
   * Same error contract as addBaki.
   */
  addPayment: (data: Omit<NewTransaction, "type">) => Promise<void>;

  /** Reset error state (e.g. when the user dismisses an error banner). */
  clearError: () => void;

  /** Wipe all state — call when navigating away from the detail screen. */
  reset: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  customerId: null,
  isLoading: false,
  error: null,

  // ── Derived ──────────────────────────────────────────────────────────────

  totalCredit() {
    return get()
      .transactions.filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);
  },

  totalPaid() {
    return get()
      .transactions.filter((t) => t.type === "payment")
      .reduce((sum, t) => sum + t.amount, 0);
  },

  // ── Read ──────────────────────────────────────────────────────────────────

  loadForCustomer(customerId: number) {
    set({ isLoading: true, customerId, error: null });
    // Await dbReady so web (sql.js) is initialised before querying.
    dbReady
      .then(() => {
        const transactions = transactionService.getTransactions(customerId);
        set({ transactions, isLoading: false });
      })
      .catch((err: unknown) => {
        set({ isLoading: false, error: toMessage(err) });
      });
  },

  // ── Writes ────────────────────────────────────────────────────────────────

  async addBaki(data) {
    set({ isLoading: true, error: null });
    try {
      await dbReady;
      transactionService.addCredit(data);
      _reloadAfterWrite(get, set);
    } catch (err) {
      set({ isLoading: false });
      throw err; // surface ValidationError.fields to the modal form
    }
  },

  async addPayment(data) {
    set({ isLoading: true, error: null });
    try {
      await dbReady;
      transactionService.addPayment(data);
      _reloadAfterWrite(get, set);
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  // ── Housekeeping ──────────────────────────────────────────────────────────

  clearError() {
    set({ error: null });
  },

  reset() {
    set({ transactions: [], customerId: null, isLoading: false, error: null });
  },
}));

// ── Private helper ────────────────────────────────────────────────────────────

/**
 * After a successful write, reload the transaction list and kick the global
 * customer store so that total_baki in the Customers tab stays up-to-date.
 * Imported lazily to avoid circular dependency (customerStore → transactionStore).
 */
function _reloadAfterWrite(
  get: () => TransactionState,
  set: (partial: Partial<TransactionState>) => void,
) {
  const { customerId } = get();
  if (customerId !== null) {
    try {
      const transactions = transactionService.getTransactions(customerId);
      set({ transactions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  } else {
    set({ isLoading: false });
  }

  // Lazy import avoids a circular ESM reference at module-parse time
  import("./customerStore").then(({ useCustomerStore }) => {
    useCustomerStore.getState().load();
  });
}

// ── Filter helper (used by the history list UI) ───────────────────────────────

export function filterTransactions(
  txs: Transaction[],
  filter: TransactionType | "all",
): Transaction[] {
  if (filter === "all") return txs;
  return txs.filter((t) => t.type === filter);
}
