/**
 * crud.integration.test.ts
 *
 * Integration-style tests for the full CRUD cycle:
 *   addCustomer → getCustomerById → updateCustomer → deleteCustomer
 *
 * The SQLiteCustomerRepository is mocked with an in-memory Map so that
 * the complete service → validation → repository chain is exercised
 * without requiring a real SQLite file.
 *
 * Person A — Day 4 Hour 3
 */

import { SQLiteCustomerRepository } from "../../repositories/SQLiteCustomerRepository";
import { Customer, NewCustomer } from "../../types";
import { customerService } from "../customerService";
import { DatabaseError, NotFoundError, ValidationError } from "../errors";

jest.mock("../../repositories/SQLiteCustomerRepository");

const MockRepo = SQLiteCustomerRepository as jest.MockedClass<
  typeof SQLiteCustomerRepository
>;

// ── In-memory DB fixture ──────────────────────────────────────────────────────

function makeMemoryRepo() {
  let nextId = 1;
  const db = new Map<number, Customer>();

  MockRepo.prototype.create = jest
    .fn()
    .mockImplementation((data: NewCustomer) => {
      const id = nextId++;
      const now = new Date().toISOString();
      db.set(id, { ...data, id, created_at: now, updated_at: now });
      return id;
    });

  MockRepo.prototype.getAll = jest
    .fn()
    .mockImplementation(() =>
      [...db.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );

  MockRepo.prototype.getById = jest
    .fn()
    .mockImplementation((id: number) => db.get(id) ?? null);

  MockRepo.prototype.update = jest
    .fn()
    .mockImplementation((id: number, data: Partial<Customer>) => {
      const existing = db.get(id);
      if (!existing) throw new Error(`Customer ${id} not found`);
      db.set(id, {
        ...existing,
        ...data,
        updated_at: new Date().toISOString(),
      });
    });

  MockRepo.prototype.delete = jest.fn().mockImplementation((id: number) => {
    db.delete(id);
  });

  MockRepo.prototype.search = jest
    .fn()
    .mockImplementation((q: string) =>
      [...db.values()].filter(
        (c) =>
          c.name.toLowerCase().includes(q.toLowerCase()) ||
          (c.nickname ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
    );

  MockRepo.prototype.getWithOutstandingBaki = jest
    .fn()
    .mockImplementation(() => [...db.values()].filter((c) => c.total_baki > 0));

  return db;
}

// ── Full CRUD cycle ───────────────────────────────────────────────────────────

describe("CRUD integration — insert → read → update → delete", () => {
  let db: Map<number, Customer>;

  beforeEach(() => {
    db = makeMemoryRepo();
  });

  it("addCustomer persists to DB and returns a numeric id", () => {
    const id = customerService.addCustomer({
      name: "Rahim Uddin",
      phone: "01711000002",
      nickname: "Rahim",
      total_baki: 0,
      trust_score: 3,
    });

    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    expect(db.size).toBe(1);
  });

  it("getCustomerById returns the just-inserted customer", () => {
    const id = customerService.addCustomer({
      name: "Rahim Uddin",
      phone: "01711000002",
      nickname: "Rahim",
      total_baki: 0,
      trust_score: 3,
    });

    const fetched = customerService.getCustomerById(id);

    expect(fetched.id).toBe(id);
    expect(fetched.name).toBe("Rahim Uddin");
    expect(fetched.phone).toBe("01711000002");
    expect(fetched.nickname).toBe("Rahim");
    expect(fetched.total_baki).toBe(0);
    expect(fetched.trust_score).toBe(3);
  });

  it("addCustomer normalises whitespace in name and phone", () => {
    const id = customerService.addCustomer({
      name: "  Karim  ",
      phone: " 01812000001 ",
      nickname: null,
      total_baki: 0,
      trust_score: 2,
    });

    const fetched = customerService.getCustomerById(id);
    expect(fetched.name).toBe("Karim");
    expect(fetched.phone).toBe("01812000001");
  });

  it("addCustomer always stores total_baki as 0 regardless of input", () => {
    const id = customerService.addCustomer({
      name: "Shopkeeper",
      phone: null,
      nickname: null,
      total_baki: 9999, // should be ignored
      trust_score: 5,
    });

    const fetched = customerService.getCustomerById(id);
    expect(fetched.total_baki).toBe(0);
  });

  it("updateCustomer changes only the supplied fields", () => {
    const id = customerService.addCustomer({
      name: "Rahim Uddin",
      phone: "01711000002",
      nickname: "Rahim",
      total_baki: 0,
      trust_score: 3,
    });

    customerService.updateCustomer(id, {
      name: "Rahim Uddin Jr.",
      trust_score: 5,
    });

    const updated = customerService.getCustomerById(id);
    expect(updated.name).toBe("Rahim Uddin Jr.");
    expect(updated.trust_score).toBe(5);
    // phone and nickname unchanged
    expect(updated.phone).toBe("01711000002");
    expect(updated.nickname).toBe("Rahim");
  });

  it("deleteCustomer removes the customer from the DB", () => {
    const id = customerService.addCustomer({
      name: "Rahim Uddin",
      phone: "01711000002",
      nickname: null,
      total_baki: 0,
      trust_score: 3,
    });

    expect(db.size).toBe(1);

    customerService.deleteCustomer(id);

    expect(db.size).toBe(0);
    expect(() => customerService.getCustomerById(id)).toThrow(NotFoundError);
  });

  it("full cycle: insert → read → update → delete → confirm gone", () => {
    // INSERT
    const id = customerService.addCustomer({
      name: "Nasreen Begum",
      phone: "01922000003",
      nickname: "Rina",
      total_baki: 0,
      trust_score: 4,
    });

    // READ
    const original = customerService.getCustomerById(id);
    expect(original.name).toBe("Nasreen Begum");

    // UPDATE
    customerService.updateCustomer(id, { nickname: "Nasreen", trust_score: 2 });
    const afterUpdate = customerService.getCustomerById(id);
    expect(afterUpdate.nickname).toBe("Nasreen");
    expect(afterUpdate.trust_score).toBe(2);
    expect(afterUpdate.name).toBe("Nasreen Begum"); // unchanged

    // DELETE
    customerService.deleteCustomer(id);

    // CONFIRM GONE
    expect(() => customerService.getCustomerById(id)).toThrow(NotFoundError);
    expect(customerService.getCustomers()).toHaveLength(0);
  });
});

// ── Validation blocks DB write ────────────────────────────────────────────────

describe("CRUD integration — validation gates", () => {
  beforeEach(() => makeMemoryRepo());

  it("rejects empty name without touching the DB", () => {
    MockRepo.prototype.create = jest.fn();

    expect(() =>
      customerService.addCustomer({
        name: "   ",
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(ValidationError);

    expect(MockRepo.prototype.create).not.toHaveBeenCalled();
  });

  it("rejects name longer than 100 chars", () => {
    MockRepo.prototype.create = jest.fn();

    expect(() =>
      customerService.addCustomer({
        name: "A".repeat(101),
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(ValidationError);

    expect(MockRepo.prototype.create).not.toHaveBeenCalled();
  });

  it("rejects invalid Bangladeshi phone without touching the DB", () => {
    MockRepo.prototype.create = jest.fn();

    expect(() =>
      customerService.addCustomer({
        name: "Valid Name",
        phone: "not-a-phone",
        nickname: null,
        total_baki: 0,
        trust_score: 3,
      }),
    ).toThrow(ValidationError);

    expect(MockRepo.prototype.create).not.toHaveBeenCalled();
  });

  it("rejects trust_score outside 1–5", () => {
    MockRepo.prototype.create = jest.fn();

    expect(() =>
      customerService.addCustomer({
        name: "Valid Name",
        phone: null,
        nickname: null,
        total_baki: 0,
        trust_score: 6,
      }),
    ).toThrow(ValidationError);

    expect(MockRepo.prototype.create).not.toHaveBeenCalled();
  });

  it("rejects update with invalid phone", () => {
    makeMemoryRepo();
    const id = customerService.addCustomer({
      name: "Rahim",
      phone: null,
      nickname: null,
      total_baki: 0,
      trust_score: 3,
    });

    expect(() =>
      customerService.updateCustomer(id, { phone: "00000" }),
    ).toThrow(ValidationError);

    // Original record unchanged
    const fetched = customerService.getCustomerById(id);
    expect(fetched.phone).toBeNull();
  });

  it("deleteCustomer throws NotFoundError for unknown id", () => {
    makeMemoryRepo();
    expect(() => customerService.deleteCustomer(9999)).toThrow(NotFoundError);
  });

  it("updateCustomer throws NotFoundError for unknown id", () => {
    makeMemoryRepo();
    expect(() =>
      customerService.updateCustomer(9999, { name: "Ghost" }),
    ).toThrow(NotFoundError);
  });
});

// ── Error wrapping ─────────────────────────────────────────────────────────────

describe("CRUD integration — DB errors are wrapped as DatabaseError", () => {
  it("getCustomers wraps repo failure in DatabaseError", () => {
    MockRepo.prototype.getAll = jest.fn().mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() => customerService.getCustomers()).toThrow(DatabaseError);
  });

  it("addCustomer wraps repo failure in DatabaseError after validation passes", () => {
    MockRepo.prototype.create = jest.fn().mockImplementation(() => {
      throw new Error("constraint violation");
    });
    MockRepo.prototype.getById = jest.fn().mockReturnValue(null);

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
