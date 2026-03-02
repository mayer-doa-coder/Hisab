import {
    Customer,
    NewCustomer,
    NewTransaction,
    Transaction,
    UpdateCustomer,
} from "../types";

/**
 * Contract for all customer-related database operations.
 *
 * UI and business logic depend on this interface; the concrete
 * implementation (SQLiteCustomerRepository) can be swapped out
 * for tests or a future API-backed implementation.
 */
export interface ICustomerRepository {
  // ── Queries ──────────────────────────────────────────────────────────────

  /** Return all customers ordered by name ascending */
  getAll(): Customer[];

  /** Return a single customer by primary key, or null if not found */
  getById(id: number): Customer | null;

  /** Full-text search on name and nickname (case-insensitive) */
  search(query: string): Customer[];

  /** Return customers with total_baki > 0, highest first */
  getWithOutstandingBaki(): Customer[];

  // ── Mutations ────────────────────────────────────────────────────────────

  /** Insert a new customer and return the generated id */
  create(data: NewCustomer): number;

  /** Patch fields on an existing customer */
  update(id: number, data: UpdateCustomer): void;

  /** Hard-delete a customer and their transactions */
  delete(id: number): void;

  // ── Transactions ─────────────────────────────────────────────────────────

  /** Return all transactions for a customer, newest first */
  getTransactions(customerId: number): Transaction[];

  /**
   * Record a credit or payment, then atomically recalculate
   * total_baki on the customer row.
   *
   * @returns the new transaction id
   */
  addTransaction(data: NewTransaction): number;
}
