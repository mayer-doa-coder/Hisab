/**
 * Unit tests for transactionService
 */

import { DatabaseError, NotFoundError, ValidationError } from "../errors";
import { transactionService } from "../transactionService";

import { SQLiteCustomerRepository } from '../../repositories/SQLiteCustomerRepository';

// ── Mock repository ───────────────────────────────────────────────────────────

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

const TX = {
  id: 10,
  customer_id: 1,
  type: "credit" as const,
  amount: 200,
  note: "চাল",
  created_at: "2026-03-02T00:00:00.000Z",
};

// ── getTransactions ───────────────────────────────────────────────────────────

describe("transactionService.getTransactions", () => {
  it("returns transactions for an existing customer", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(CUSTOMER);
    MockRepo.prototype.getTransactions = jest.fn().mockReturnValue([TX]);

    const result = transactionService.getTransactions(1);

    expect(result).toEqual([TX]);
    expect(MockRepo.prototype.getTransactions).toHaveBeenCalledWith(1);
  });

  it("throws NotFoundError when customer does not exist", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

    expect(() => transactionService.getTransactions(99)).toThrow(NotFoundError);
  });
});

// ── getBalance ────────────────────────────────────────────────────────────────

describe("transactionService.getBalance", () => {
  it("returns total_baki from customer row", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(CUSTOMER);

    const balance = transactionService.getBalance(1);
    expect(balance).toBe(500);
  });

  it("throws NotFoundError for unknown customer", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

    expect(() => transactionService.getBalance(99)).toThrow(NotFoundError);
  });
});

// ── addCredit ─────────────────────────────────────────────────────────────────

describe("transactionService.addCredit", () => {
  beforeEach(() => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(CUSTOMER);
    MockRepo.prototype.addTransaction = jest.fn().mockReturnValue(10);
  });

  it("records a credit and returns new transaction id", () => {
    const id = transactionService.addCredit({
      customer_id: 1,
      amount: 200,
      note: "চাল",
    });

    expect(id).toBe(10);
    expect(MockRepo.prototype.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "credit", amount: 200 }),
    );
  });

  it("throws ValidationError when amount is zero", () => {
    expect(() =>
      transactionService.addCredit({ customer_id: 1, amount: 0, note: null }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when amount is negative", () => {
    expect(() =>
      transactionService.addCredit({ customer_id: 1, amount: -50, note: null }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when amount exceeds limit", () => {
    expect(() =>
      transactionService.addCredit({
        customer_id: 1,
        amount: 2_000_000,
        note: null,
      }),
    ).toThrow(ValidationError);
  });

  it("throws NotFoundError when customer does not exist", () => {
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

    expect(() =>
      transactionService.addCredit({
        customer_id: 99,
        amount: 100,
        note: null,
      }),
    ).toThrow(NotFoundError);
  });

  it("throws DatabaseError when repo throws", () => {
    MockRepo.prototype.addTransaction = jest.fn().mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() =>
      transactionService.addCredit({ customer_id: 1, amount: 100, note: null }),
    ).toThrow(DatabaseError);
  });
});

// ── addPayment ────────────────────────────────────────────────────────────────

describe("transactionService.addPayment", () => {
  it("allows payment up to full baki amount", () => {
    MockRepo.prototype.getById = jest
      .fn()
      .mockReturnValue({ ...CUSTOMER, total_baki: 500 });
    MockRepo.prototype.addTransaction = jest.fn().mockReturnValue(11);

    const id = transactionService.addPayment({
      customer_id: 1,
      amount: 500,
      note: null,
    });
    expect(id).toBe(11);
  });

  it("throws ValidationError when payment exceeds baki", () => {
    MockRepo.prototype.getById = jest
      .fn()
      .mockReturnValue({ ...CUSTOMER, total_baki: 100 });

    expect(() =>
      transactionService.addPayment({
        customer_id: 1,
        amount: 150,
        note: null,
      }),
    ).toThrow(ValidationError);
  });
});
