/**
 * transactionService.ts
 *
 * Service layer for baki (credit) and payment transactions.
 *
 * Responsibilities:
 *  - Input validation (amount > 0, type is valid, customer exists)
 *  - Delegating writes to the repository's atomic addTransaction()
 *  - Zero UI logic
 *
 * Usage:
 *   import { transactionService } from '@/services/transactionService';
 *   transactionService.addCredit({ customer_id: 1, amount: 500, note: 'চাল' });
 */

import { SQLiteCustomerRepository } from "../repositories/SQLiteCustomerRepository";
import { NewTransaction, Transaction, TransactionType } from "../types";
import { DatabaseError, NotFoundError, ValidationError } from "./errors";

// ── Singleton repository ──────────────────────────────────────────────────────

const repo = new SQLiteCustomerRepository();

// ── Validation ────────────────────────────────────────────────────────────────

function validateTransaction(data: NewTransaction): Record<string, string> {
  const errors: Record<string, string> = {};

  if (
    !data.customer_id ||
    !Number.isInteger(data.customer_id) ||
    data.customer_id < 1
  ) {
    errors.customer_id = "A valid customer must be selected";
  }

  const VALID_TYPES: TransactionType[] = ["credit", "payment"];
  if (!VALID_TYPES.includes(data.type)) {
    errors.type = "Transaction type must be 'credit' or 'payment'";
  }

  if (!data.amount || data.amount <= 0 || !isFinite(data.amount)) {
    errors.amount = "Amount must be a positive number";
  }

  if (data.amount > 1_000_000) {
    errors.amount = "Amount cannot exceed ৳10,00,000";
  }

  if (data.note && data.note.trim().length > 255) {
    errors.note = "Note must be 255 characters or fewer";
  }

  return errors;
}

// ── Service API ───────────────────────────────────────────────────────────────

export const transactionService = {
  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Return all transactions for a customer, newest first.
   * @throws {NotFoundError} if customer does not exist.
   * @throws {DatabaseError} on query failure.
   */
  getTransactions(customerId: number): Transaction[] {
    try {
      const customer = repo.getById(customerId);
      if (!customer) throw new NotFoundError("Customer", customerId);
      return repo.getTransactions(customerId);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new DatabaseError(
        `Failed to load transactions for customer ${customerId}`,
        err,
      );
    }
  },

  /**
   * Return the live calculated baki balance for a customer.
   * (Reads from the denormalised total_baki column — repo keeps it in sync.)
   * @throws {NotFoundError} if customer does not exist.
   */
  getBalance(customerId: number): number {
    const customer = repo.getById(customerId);
    if (!customer) throw new NotFoundError("Customer", customerId);
    return customer.total_baki;
  },

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Record a credit (বাকি) transaction.
   *
   * Atomically inserts the transaction row and updates customer.total_baki.
   *
   * @returns new transaction id.
   * @throws {ValidationError} on invalid input.
   * @throws {NotFoundError} if the customer does not exist.
   * @throws {DatabaseError} on write failure.
   */
  addCredit(data: Omit<NewTransaction, "type">): number {
    return transactionService._add({ ...data, type: "credit" });
  },

  /**
   * Record a payment transaction.
   *
   * Atomically inserts the transaction row and updates customer.total_baki.
   *
   * @returns new transaction id.
   * @throws {ValidationError} on invalid input.
   * @throws {NotFoundError} if the customer does not exist.
   * @throws {DatabaseError} on write failure.
   */
  addPayment(data: Omit<NewTransaction, "type">): number {
    return transactionService._add({ ...data, type: "payment" });
  },

  /** Internal — validates and writes any transaction type. */
  _add(data: NewTransaction): number {
    // Validate
    const errors = validateTransaction(data);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Invalid transaction data", errors);
    }

    // Customer must exist
    const customer = repo.getById(data.customer_id);
    if (!customer) throw new NotFoundError("Customer", data.customer_id);

    // Guard: payment cannot exceed outstanding baki
    if (data.type === "payment" && data.amount > customer.total_baki) {
      throw new ValidationError("Payment exceeds outstanding balance", {
        amount: `Cannot pay more than current baki of ৳${customer.total_baki.toFixed(2)}`,
      });
    }

    // Normalise
    const payload: NewTransaction = {
      customer_id: data.customer_id,
      type: data.type,
      amount: Math.round(data.amount * 100) / 100, // 2 decimal places
      note: data.note?.trim() || null,
    };

    try {
      return repo.addTransaction(payload);
    } catch (err) {
      throw new DatabaseError("Failed to record transaction", err);
    }
  },
};
