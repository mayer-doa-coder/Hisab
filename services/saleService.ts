/**
 * saleService.ts
 *
 * Service layer for Sales — validates payloads, wraps DB errors, keeps all
 * business rules in one place (no UI logic).
 */

import {
    DailyTotal,
    NewSalePayload,
    ProductTotal,
} from "../repositories/ISaleRepository";
import { SQLiteSaleRepository } from "../repositories/SQLiteSaleRepository";
import { Sale, SaleItem } from "../types";
import { DatabaseError, NotFoundError, ValidationError } from "./errors";

const repo = new SQLiteSaleRepository();

// ── Validation ────────────────────────────────────────────────────────────────

function validateNewSale(payload: NewSalePayload): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!payload.items || payload.items.length === 0) {
    errors.items = "অন্তত একটি পণ্য যোগ করুন";
  } else {
    for (const item of payload.items) {
      if (item.quantity <= 0) {
        errors.items = "পণ্যের পরিমাণ ০-এর বেশি হতে হবে";
        break;
      }
      if (item.price < 0) {
        errors.items = "পণ্যের মূল্য ঋণাত্মক হতে পারবে না";
        break;
      }
    }
  }

  if (payload.is_baki && payload.customer_id === null) {
    errors.customer = "বাকি বিক্রয়ের জন্য গ্রাহক নির্বাচন করুন";
  }

  return errors;
}

// ── Service API ───────────────────────────────────────────────────────────────

export const saleService = {
  /**
   * Record a sale (cash or baki) with all line items.
   * - Deducts stock for each product
   * - If baki: creates a credit transaction and updates customer.total_baki
   * Returns the new sale id.
   */
  recordSale(payload: NewSalePayload): number {
    const errs = validateNewSale(payload);
    if (Object.keys(errs).length > 0) {
      throw new ValidationError("Invalid sale data", errs);
    }
    try {
      return repo.create(payload);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new DatabaseError("Failed to record sale", err);
    }
  },

  getSales(): Sale[] {
    try {
      return repo.getAll();
    } catch (err) {
      throw new DatabaseError("Failed to load sales", err);
    }
  },

  getSaleById(id: number): Sale {
    try {
      const s = repo.getById(id);
      if (!s) throw new NotFoundError("Sale", id);
      return s;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new DatabaseError(`Failed to load sale ${id}`, err);
    }
  },

  getSaleItems(saleId: number): SaleItem[] {
    try {
      return repo.getItems(saleId);
    } catch (err) {
      throw new DatabaseError(`Failed to load items for sale ${saleId}`, err);
    }
  },

  getSalesByCustomer(customerId: number): Sale[] {
    try {
      return repo.getByCustomer(customerId);
    } catch (err) {
      throw new DatabaseError("Failed to load customer sales", err);
    }
  },

  getDailyTotals(from: string, to: string): DailyTotal[] {
    try {
      return repo.getDailyTotals(from, to);
    } catch (err) {
      throw new DatabaseError("Failed to load daily totals", err);
    }
  },

  getWeeklyProductTotals(): ProductTotal[] {
    try {
      return repo.getWeeklyProductTotals();
    } catch (err) {
      throw new DatabaseError("Failed to load weekly product totals", err);
    }
  },
};
