/**
 * deltaEncoder.js — Field-level delta encoding for low-bandwidth sync.
 *
 * Problem: Syncing a complete entity snapshot on every change wastes bandwidth.
 * A Product object may have 15 fields, but a stock adjustment only changes
 * `quantity` and `updatedAt`. On a 2G connection, sending all 15 fields
 * every time is unnecessary and slow.
 *
 * Solution: Compute a structural diff (delta) between the last known server
 * state and the current local state. Only send the changed fields.
 *
 * Additionally, field names are aliased to single characters in the wire
 * format, then expanded back on the server. This reduces payload size by
 * ~40-60% for typical entities.
 *
 * No external compression library is used. HTTP gzip (Content-Encoding)
 * handles transport-layer compression automatically in Fetch API when the
 * server supports it. This module focuses on structural/semantic compression.
 *
 * Wire format:
 *   { _v: 2, _op: 'UPDATE', _ref: 'uuid', _delta: { q: 42, ua: 1717... } }
 *   vs full:
 *   { version: 2, operation: 'UPDATE', clientRefId: 'uuid',
 *     quantity: 42, updatedAt: 1717..., name: '...', price: ..., ... }
 */

// ── Field alias maps ──────────────────────────────────────────────────────────
// Short key → full key. Applied when EXPANDING (server reads short keys).
// Full key → short key. Applied when COMPRESSING (client sends short keys).
//
// Only include fields that appear frequently in sync payloads.
// Unknown fields are passed through unchanged.

const ALIASES = {
  // Shared across entities
  id:              'i',
  clientRefId:     'r',
  userId:          'u',
  createdAt:       'c',
  updatedAt:       'ua',
  deletedAt:       'da',
  serverVersion:   'sv',
  version:         'v',
  status:          'st',
  note:            'n',
  amount:          'a',
  occurredAt:      'oa',

  // Product / inventory
  name:            'nm',
  price:           'p',
  quantity:        'q',
  lowStockThreshold: 'lst',
  expiryDate:      'ed',
  movementType:    'mt',
  stockOutReason:  'sr',

  // Customer / baki
  customerId:      'ci',
  phone:           'ph',
  address:         'ad',
  creditLimit:     'cl',
  currentBalance:  'cb',
  dueTermsDays:    'dt',
  type:            'ty',   // 'credit' | 'payment'
  dueDate:         'dd',
  runningDue:      'rd',
  paymentMethod:   'pm',
  referenceId:     'rid',

  // Sales
  saleId:          'si',
  productId:       'pi',
  unitPrice:       'up',
  subtotal:        'sb',
  totalAmount:     'ta',
  paymentMode:     'pmo',

  // Supplier / purchase
  supplierId:      'spid',
  purchaseOrderId: 'poid',
  paidAmount:      'pa',

  // Expense / cashbook
  title:           'ti',
  category:        'ca',
  expenseDate:     'xd',

  // Day close
  businessDate:    'bd',
  cashOnHand:      'coh',
};

// Inverted map: short key → full key (for expanding on receive)
const EXPAND_MAP = Object.fromEntries(
  Object.entries(ALIASES).map(([full, short]) => [short, full])
);

// Full key → short key (for compressing on send)
const COMPRESS_MAP = { ...ALIASES };

// ── Compression: full object → wire format with short keys ───────────────────

/**
 * Compresses an object by replacing known full keys with their single-char aliases.
 * Nested objects are NOT recursively compressed (entity payloads are flat).
 *
 * @param {object} obj
 * @returns {object}
 */
export const compressKeys = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[COMPRESS_MAP[key] ?? key] = val;
  }
  return result;
};

/**
 * Expands a wire-format object back to full keys.
 * Used server-side (or during unit tests).
 *
 * @param {object} obj
 * @returns {object}
 */
export const expandKeys = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[EXPAND_MAP[key] ?? key] = val;
  }
  return result;
};

// ── Delta computation ─────────────────────────────────────────────────────────

/**
 * Computes the structural diff between a previous snapshot and the current state.
 * Only fields that have changed (or are new) are included in the delta.
 *
 * Null/undefined in `current` is treated as a deletion and included.
 * Fields present in `previous` but absent in `current` are ignored
 * (they haven't changed from the client's perspective).
 *
 * @param {object|null} previous — last known server snapshot (or null for CREATE)
 * @param {object} current       — current local state
 * @returns {object}             — only the changed fields
 */
export const computeDelta = (previous, current) => {
  if (!previous || typeof previous !== 'object') {
    // CREATE: send everything
    return current;
  }

  const delta = {};

  for (const [key, val] of Object.entries(current)) {
    const prev = previous[key];

    if (prev === val) continue; // unchanged

    // Shallow comparison for primitive values only.
    // Objects/arrays in payloads are treated as opaque blobs; any change
    // in stringify output means the field is included.
    if (
      typeof val === 'object' && val !== null &&
      typeof prev === 'object' && prev !== null
    ) {
      if (JSON.stringify(val) === JSON.stringify(prev)) continue;
    }

    delta[key] = val;
  }

  return delta;
};

// ── Envelope builder ──────────────────────────────────────────────────────────

/**
 * Builds a complete compressed wire envelope for a sync mutation.
 *
 * @param {object} opts
 * @param {'CREATE'|'UPDATE'|'DELETE'} opts.operation
 * @param {string}  opts.entityType
 * @param {string}  opts.clientRefId
 * @param {string}  opts.payloadHash
 * @param {number}  opts.serverVersion
 * @param {object}  opts.current      — full current local state
 * @param {object}  [opts.previous]   — last server snapshot (for delta on UPDATE)
 * @returns {object}  — ready-to-JSON-stringify wire envelope
 */
export const buildWireEnvelope = ({
  operation,
  entityType,
  clientRefId,
  payloadHash,
  serverVersion = 0,
  current,
  previous = null,
}) => {
  const isUpdate = operation === 'UPDATE' && previous != null;
  const rawDelta = isUpdate ? computeDelta(previous, current) : current;
  const compressedDelta = compressKeys(rawDelta);

  return {
    _op:  operation,
    _et:  entityType,
    _ref: clientRefId,
    _h:   payloadHash,
    _sv:  serverVersion,
    _d:   compressedDelta,
    _full: !isUpdate, // flag: server should treat _d as the full entity
  };
};

/**
 * Estimate the byte size of a wire envelope before serialisation.
 * Used by the queue to enforce MAX_BATCH_BYTES limits.
 *
 * @param {object} envelope
 * @returns {number}
 */
export const estimateEnvelopeBytes = (envelope) => {
  try {
    return JSON.stringify(envelope).length;
  } catch {
    return 0;
  }
};

// ── Stats helper ──────────────────────────────────────────────────────────────

/**
 * Returns the compression ratio achieved by delta + key aliasing.
 * Useful for logging and the OfflineQueueMonitor diagnostic panel.
 *
 * @param {object} original — full entity payload
 * @param {object} envelope — wire envelope
 * @returns {{ originalBytes: number, wireBytes: number, ratio: number }}
 */
export const compressionStats = (original, envelope) => {
  const originalBytes = JSON.stringify(original).length;
  const wireBytes = estimateEnvelopeBytes(envelope);
  return {
    originalBytes,
    wireBytes,
    ratio: originalBytes > 0 ? wireBytes / originalBytes : 1,
  };
};
