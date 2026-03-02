import { Sale, SaleItem } from "../types";

/** Payload for recording a new sale */
export interface NewSalePayload {
  customer_id: number | null;
  is_baki: boolean;
  items: { product_id: number; quantity: number; price: number }[];
}

/** Daily revenue row */
export interface DailyTotal {
  date: string; // "YYYY-MM-DD"
  total: number;
  sale_count: number;
}

/** Per-product revenue row */
export interface ProductTotal {
  product_id: number;
  product_name: string;
  units_sold: number;
  revenue: number;
}

export interface ISaleRepository {
  /** Create a sale + all line items atomically; returns new sale id. */
  create(payload: NewSalePayload): number;

  /** All sales, newest first. */
  getAll(): Sale[];

  /** Get one sale by id. */
  getById(id: number): Sale | null;

  /** Line items for a given sale. */
  getItems(saleId: number): SaleItem[];

  /** Sales for a single customer (baki sales only). */
  getByCustomer(customerId: number): Sale[];

  /** Aggregate daily totals between two ISO date strings (inclusive). */
  getDailyTotals(from: string, to: string): DailyTotal[];

  /** Product-level revenue totals, last 7 days. */
  getWeeklyProductTotals(): ProductTotal[];
}
