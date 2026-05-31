/**
 * schema.js — Single source of truth for every SQLite table in Hisab.
 *
 * Design principles:
 *  - WAL (Write-Ahead Log) mode is enabled at startup for concurrent reads
 *    during background sync without blocking UI writes.
 *  - Every table that participates in cloud sync carries three columns:
 *      client_ref_id  TEXT  — stable client-side UUID, the idempotency key
 *      server_version INT   — monotone version from cloud; used by FS-CRDT
 *      synced_at      INT   — Unix ms of last successful push; used for delta queries
 *  - The sync_queue table is the durability backbone: every mutation is written
 *    here BEFORE it reaches the cloud. If the app crashes, queue survives.
 *  - Schema versions are tracked in sync_metadata. Each new SCHEMA_VERSION
 *    entry in MIGRATIONS must be idempotent (uses CREATE TABLE IF NOT EXISTS
 *    and ensureColumn guards in db.js).
 */

// ── Schema version ────────────────────────────────────────────────────────────
// Increment this whenever a migration step is added to MIGRATIONS below.
export const SCHEMA_VERSION = 2;

// ── WAL pragma block (applied once per db open) ───────────────────────────────
// WAL allows simultaneous reads + one writer, which is critical when the
// background sync task is reading the queue while the UI is writing new entries.
export const PRAGMA_BLOCK = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -8000;
`;

// ── Core tables DDL ───────────────────────────────────────────────────────────
// These are the tables owned by the offline-first sync layer.
// Application tables (products, customers, baki_entries, etc.) live in db.js.

export const SYNC_QUEUE_DDL = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id              TEXT    PRIMARY KEY,
    entity_type     TEXT    NOT NULL,
    operation       TEXT    NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
    payload         TEXT    NOT NULL,
    client_ref_id   TEXT,
    payload_hash    TEXT    NOT NULL,
    server_version  INTEGER DEFAULT 0,
    attempt_count   INTEGER DEFAULT 0,
    last_attempt_at INTEGER,
    next_retry_at   INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','processing','succeeded','failed','skipped')),
    error_detail    TEXT,
    conflict_token  TEXT,
    resolved_by     TEXT
  );
`;

export const SYNC_QUEUE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry
     ON sync_queue (status, next_retry_at)
     WHERE status = 'pending';`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_entity
     ON sync_queue (entity_type, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_client_ref
     ON sync_queue (client_ref_id)
     WHERE client_ref_id IS NOT NULL;`,
];

export const SYNC_METADATA_DDL = `
  CREATE TABLE IF NOT EXISTS sync_metadata (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  );
`;

// Known metadata keys
export const META_KEYS = Object.freeze({
  SCHEMA_VERSION:        'schema_version',
  LAST_FULL_SYNC_AT:     'last_full_sync_at',
  LAST_SERVER_CURSOR:    'last_server_cursor',
  LAST_QUEUE_FLUSH_AT:   'last_queue_flush_at',
  NETWORK_QUALITY:       'network_quality',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  CIRCUIT_OPEN_AT:       'circuit_open_at',
  CIRCUIT_FAIL_COUNT:    'circuit_fail_count',
});

// ── Migration steps ───────────────────────────────────────────────────────────
// Each entry corresponds to upgrading FROM (version - 1) TO version.
// Steps must be idempotent — they may run more than once on schema repair.
export const MIGRATIONS = {
  // Version 1: baseline sync infrastructure
  1: [
    SYNC_QUEUE_DDL,
    SYNC_METADATA_DDL,
    ...SYNC_QUEUE_INDEXES,
  ],

  // Version 2: add resolved_by + conflict_token columns if upgrading from v1
  2: [
    `ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS resolved_by TEXT;`,
    `ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS conflict_token TEXT;`,
  ],
};

// ── Sync queue helpers ────────────────────────────────────────────────────────

/** Maximum payload bytes per sync batch (64 KB). */
export const MAX_BATCH_BYTES = 64 * 1024;

/** Maximum items per sync batch. */
export const MAX_BATCH_ITEMS = 15;

/** Max retry attempts before a queue entry is moved to 'failed'. */
export const MAX_QUEUE_ATTEMPTS = 8;

/**
 * Entity type → relative priority (lower = synced first).
 * Financial mutations (baki, sales) outrank catalog updates (products).
 */
export const ENTITY_SYNC_PRIORITY = Object.freeze({
  baki_entry:         1,
  payment:            1,
  sales_header:       2,
  sales_item:         2,
  sales_return:       2,
  expense_entry:      3,
  cashbook_entry:     3,
  day_close:          3,
  customer:           4,
  credit_reminder:    4,
  payment_promise:    4,
  product:            5,
  inventory_movement: 5,
  inventory_batch:    5,
  cycle_count:        5,
  inventory_alert:    5,
  supplier:           6,
  purchase_order:     6,
  purchase_item:      6,
  supplier_payable:   6,
});

/**
 * Entity types that are NEVER automatically merged on conflict —
 * they must be escalated to an ApprovalRequest.
 */
export const ESCALATION_REQUIRED_ENTITIES = new Set([
  'baki_entry',
  'payment',
  'sales_return',
  'day_close',
]);
