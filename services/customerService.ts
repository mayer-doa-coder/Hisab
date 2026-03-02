/**
 * customerService.ts
 *
 * Service layer for customer operations.
 *
 * Responsibilities:
 *  - Input validation (name length, phone format, trust_score range)
 *  - Mapping raw repo data to richer "view" types where needed
 *  - Wrapping repo errors into typed HisabError subclasses
 *  - Zero UI logic (no imports from React / React Native)
 *
 * Usage:
 *   import { customerService } from '@/services/customerService';
 *   const customers = customerService.getCustomers();
 */

import { SQLiteCustomerRepository } from "../repositories/SQLiteCustomerRepository";
import { Customer, NewCustomer, UpdateCustomer } from "../types";
import { DatabaseError, NotFoundError, ValidationError } from "./errors";

// ── Singleton repository ──────────────────────────────────────────────────────

const repo = new SQLiteCustomerRepository();

// ── Validation helpers ────────────────────────────────────────────────────────

const PHONE_RE = /^(\+880|880|0)?[0-9]{10,11}$/;

/** Validate fields for create / update. Returns a field-error map. */
function validateCustomerFields(
  data: Partial<NewCustomer>,
  requireName = true,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (requireName && (!data.name || data.name.trim().length === 0)) {
    errors.name = "Customer name is required";
  } else if (data.name && data.name.trim().length > 100) {
    errors.name = "Name must be 100 characters or fewer";
  }

  if (data.phone && !PHONE_RE.test(data.phone.trim())) {
    errors.phone = "Enter a valid Bangladeshi phone number (e.g. 01711000001)";
  }

  if (data.nickname && data.nickname.trim().length > 50) {
    errors.nickname = "Nickname must be 50 characters or fewer";
  }

  if (
    data.trust_score !== undefined &&
    (data.trust_score < 1 ||
      data.trust_score > 5 ||
      !Number.isInteger(data.trust_score))
  ) {
    errors.trust_score = "Trust score must be a whole number between 1 and 5";
  }

  return errors;
}

// ── Service API ───────────────────────────────────────────────────────────────

export const customerService = {
  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Return all customers, ordered A→Z by name.
   * @throws {DatabaseError} if the underlying query fails.
   */
  getCustomers(): Customer[] {
    try {
      return repo.getAll();
    } catch (err) {
      throw new DatabaseError("Failed to load customers", err);
    }
  },

  /**
   * Return a single customer.
   * @throws {NotFoundError} if no customer with that id exists.
   * @throws {DatabaseError} on query failure.
   */
  getCustomerById(id: number): Customer {
    try {
      const customer = repo.getById(id);
      if (!customer) throw new NotFoundError("Customer", id);
      return customer;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new DatabaseError(`Failed to load customer ${id}`, err);
    }
  },

  /**
   * Search customers by name or nickname.
   * Returns all customers when query is blank.
   * @throws {DatabaseError} on query failure.
   */
  searchCustomers(query: string): Customer[] {
    try {
      const q = query.trim();
      return q ? repo.search(q) : repo.getAll();
    } catch (err) {
      throw new DatabaseError("Customer search failed", err);
    }
  },

  /**
   * Return customers who have outstanding baki, highest first.
   * @throws {DatabaseError} on query failure.
   */
  getCustomersWithBaki(): Customer[] {
    try {
      return repo.getWithOutstandingBaki();
    } catch (err) {
      throw new DatabaseError("Failed to load customers with baki", err);
    }
  },

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Create a new customer after validating all fields.
   *
   * @returns the id of the newly created customer.
   * @throws {ValidationError} on invalid input.
   * @throws {DatabaseError} on write failure.
   */
  addCustomer(data: NewCustomer): number {
    // Validate
    const errors = validateCustomerFields(data, true);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Invalid customer data", errors);
    }

    // Normalise
    const payload: NewCustomer = {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      nickname: data.nickname?.trim() || null,
      total_baki: 0, // always starts at zero
      trust_score: data.trust_score ?? 3,
    };

    try {
      return repo.create(payload);
    } catch (err) {
      throw new DatabaseError("Failed to create customer", err);
    }
  },

  /**
   * Update an existing customer's editable fields.
   *
   * @throws {ValidationError} on invalid field values.
   * @throws {NotFoundError} if the customer does not exist.
   * @throws {DatabaseError} on write failure.
   */
  updateCustomer(id: number, data: UpdateCustomer): void {
    // Existence check
    const existing = repo.getById(id);
    if (!existing) throw new NotFoundError("Customer", id);

    // Validate only the provided fields
    const errors = validateCustomerFields(data, false);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Invalid customer data", errors);
    }

    // Normalise strings
    const payload: UpdateCustomer = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.phone !== undefined) payload.phone = data.phone?.trim() || null;
    if (data.nickname !== undefined)
      payload.nickname = data.nickname?.trim() || null;
    if (data.trust_score !== undefined) payload.trust_score = data.trust_score;

    try {
      repo.update(id, payload);
    } catch (err) {
      throw new DatabaseError(`Failed to update customer ${id}`, err);
    }
  },

  /**
   * Permanently delete a customer and all their transactions.
   *
   * @throws {NotFoundError} if the customer does not exist.
   * @throws {DatabaseError} on write failure.
   */
  deleteCustomer(id: number): void {
    const existing = repo.getById(id);
    if (!existing) throw new NotFoundError("Customer", id);

    try {
      repo.delete(id);
    } catch (err) {
      throw new DatabaseError(`Failed to delete customer ${id}`, err);
    }
  },
};
