/**
 * TypeScript domain interfaces for HISAB.
 *
 * Mirrors the SQLite schema exactly so that repository layer
 * can return strongly-typed rows without extra mapping.
 */

// ── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  nickname: string | null;
  /** Running total of unpaid credit in BDT */
  total_baki: number;
  /** 1–5 shopkeeper trust rating */
  trust_score: number;
  created_at: string; // ISO-8601
  updated_at: string;
}

/** Payload for creating a new customer (id + timestamps auto-generated) */
export type NewCustomer = Omit<Customer, "id" | "created_at" | "updated_at">;

/** Payload for partial updates */
export type UpdateCustomer = Partial<NewCustomer>;

// ── Transaction ─────────────────────────────────────────────────────────────

export type TransactionType = "credit" | "payment";

export interface Transaction {
  id: number;
  customer_id: number;
  type: TransactionType;
  amount: number;
  note: string | null;
  created_at: string;
}

export type NewTransaction = Omit<Transaction, "id" | "created_at">;

// ── Product ─────────────────────────────────────────────────────────────────

export interface Product {
  id: number;
  name: string;
  price: number;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
}

export type NewProduct = Omit<Product, "id" | "created_at" | "updated_at">;

// ── Sale ────────────────────────────────────────────────────────────────────

export interface Sale {
  id: number;
  /** null for cash sales */
  customer_id: number | null;
  total: number;
  /** true = sold on credit */
  is_baki: boolean;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  quantity: number;
  price: number;
}

// ── Weekly sales (Markov) ────────────────────────────────────────────────────

export type DemandState = "LOW" | "MEDIUM" | "HIGH";

export interface WeeklySale {
  id: number;
  product_id: number;
  /** ISO date string, e.g. "2026-03-02" */
  week_start: string;
  units_sold: number;
  state: DemandState | null;
}
