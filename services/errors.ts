/**
 * HISAB custom error hierarchy.
 *
 * All service-layer errors extend HisabError so callers can
 * discriminate between "expected" domain errors (validation,
 * not-found) and unexpected runtime crashes.
 */

// ── Base ─────────────────────────────────────────────────────────────────────

export class HisabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HisabError";
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

export class ValidationError extends HisabError {
  /** Field-level messages: { name: 'Name is required' } */
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

// ── Not found ────────────────────────────────────────────────────────────────

export class NotFoundError extends HisabError {
  readonly resource: string;
  readonly id: number;

  constructor(resource: string, id: number) {
    super(`${resource} with id ${id} not found`);
    this.name = "NotFoundError";
    this.resource = resource;
    this.id = id;
  }
}

// ── Database ─────────────────────────────────────────────────────────────────

export class DatabaseError extends HisabError {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "DatabaseError";
    this.cause = cause;
  }
}

// ── Guard helper ─────────────────────────────────────────────────────────────

/** Narrow an unknown catch value to a readable message. */
export const toMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};
