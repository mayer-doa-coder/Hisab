/**
 * Unit tests for customerService
 *
 * The SQLiteCustomerRepository is mocked so tests run in Node
 * without a real SQLite database.
 */

import { customerService } from "../customerService";
import { DatabaseError, NotFoundError, ValidationError } from "../errors";

import { SQLiteCustomerRepository } from "../../repositories/SQLiteCustomerRepository";

// ── Mock the entire repository module ─────────────────────────────────────────

jest.mock("../../repositories/SQLiteCustomerRepository");

const MockRepo = SQLiteCustomerRepository as jest.MockedClass<
  typeof SQLiteCustomerRepository
>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMER = {
  id: 1,
  name: "Karim Mia",
  phone: "01711000001",
  nickname: "Karim",
  total_baki: 500,
  trust_score: 4,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
};

// ── getCustomers ──────────────────────────────────────────────────────────────

describe("customerService.getCustomers", () => {
  it("returns all customers from repo", () => {
    MockRepo.prototype.getAll = jest.fn().mockReturnValue([CUSTOMER]);

    const result = customerService.getCustomers();

    expect(result).toEqual([CUSTOMER]);
    expect(MockRepo.prototype.getAll).toHaveBeenCalledTimes(1);
  });

  it("throws DatabaseError when repo throws", () => {
    MockRepo.prototype.getAll = jest.fn().mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() => customerService.getCustomers()).toThrow(DatabaseError);
  });
});

// ── getCustomerById ───────────────────────────────────────────────────────────

describe("customerService.getCustomerById", () => {
  it("returns the customer when found", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(CUSTOMER);

    const result = customerService.getCustomerById(1);
    expect(result).toEqual(CUSTOMER);
  });

  it("throws NotFoundError when customer is null", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

    expect(() => customerService.getCustomerById(99)).toThrow(NotFoundError);
  });
});

// ── addCustomer ───────────────────────────────────────────────────────────────

describe("customerService.addCustomer", () => {
  beforeEach(() => {
    MockRepo.prototype.create = jest.fn().mockReturnValue(42);
  });

  it("creates a customer with valid data and returns new id", () => {
    const id = customerService.addCustomer({
      name: "Rahim Uddin",
      phone: "01711000002",
      nickname: "Rahim",
      total_baki: 0,
      trust_score: 3,
    });

    expect(id).toBe(42);
    expect(MockRepo.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Rahim Uddin", phone: "01711000002" }),
    );
  });

  it("trims whitespace from name and phone", () => {
    customerService.addCustomer({
      name: "  Ali  ",
      phone: " 01900000000 ",
      nickname: null,
      total_baki: 0,
      trust_score: 3,
    });

    expect(MockRepo.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ali", phone: "01900000000" }),
    );
  });

  it("always sets total_baki to 0 regardless of input", () => {
    customerService.addCustomer({
      name: "Test",
      phone: null,
      nickname: null,
      total_baki: 9999, // should be overridden
      trust_score: 3,
    });

    expect(MockRepo.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({ total_baki: 0 }),
    );
  });

  it("throws ValidationError when name is empty", () => {
    expect(() =>
      customerService.addCustomer({
        name: "  ",
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for invalid phone number", () => {
    expect(() =>
      customerService.addCustomer({
        name: "Valid Name",
        phone: "123", // too short
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for out-of-range trust_score", () => {
    expect(() =>
      customerService.addCustomer({
        name: "Valid Name",
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 6, // max is 5
      }),
    ).toThrow(ValidationError);
  });

  it("throws DatabaseError when repo.create throws", () => {
    MockRepo.prototype.create = jest.fn().mockImplementation(() => {
      throw new Error("constraint violation");
    });

    expect(() =>
      customerService.addCustomer({
        name: "Valid Name",
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(DatabaseError);
  });
});

// ── deleteCustomer ────────────────────────────────────────────────────────────

describe("customerService.deleteCustomer", () => {
  it("deletes an existing customer", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(CUSTOMER);
    MockRepo.prototype.delete = jest.fn();

    customerService.deleteCustomer(1);

    expect(MockRepo.prototype.delete).toHaveBeenCalledWith(1);
  });

  it("throws NotFoundError when customer does not exist", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

    expect(() => customerService.deleteCustomer(999)).toThrow(NotFoundError);
  });
});
