/**
 * conflictResolver.js — Conflict detection, classification, and FS-CRDT resolution.
 *
 * Architecture: Financial Semantic CRDTs (FS-CRDTs)
 *
 * Standard CRDTs (Automerge, Yjs) resolve structural conflicts but are
 * semantically blind — they cannot detect that merging two "payment" mutations
 * on the same customer account would credit more than the outstanding balance.
 *
 * This module extends the baseline 3-mode resolver with domain invariants that
 * are evaluated BEFORE any merge is committed. If an invariant fails, the
 * mutation is escalated to an ApprovalRequest rather than auto-merged,
 * guaranteeing financial data integrity under concurrent offline edits.
 *
 * FS-CRDT Invariant set:
 *   I1  PAYMENT_BALANCE_INTEGRITY  — payment ≤ outstanding balance
 *   I2  CREDIT_CEILING             — credit entry ≤ customer credit limit
 *   I3  STOCK_NON_NEGATIVE         — stock_out ≤ current on-hand quantity
 *   I4  DAY_CLOSE_IMMUTABLE        — a closed business day cannot be re-opened
 *   I5  CYCLE_COUNT_TOLERANCE      — discrepancy > 50% requires human review
 */

// ── Conflict token detection ───────────────────────────────────────────────────

const CONFLICT_TOKENS = [
  'conflict',
  'version_mismatch',
  'requires_client_resolution',
  'idempotency_key_reused_with_different_payload',
];

const toToken = (value) => String(value || '').trim().toLowerCase();

export const isConflictStatus = (value) => {
  const token = toToken(value);
  if (!token) return false;
  return CONFLICT_TOKENS.some((needle) => token.includes(needle));
};

export const buildConflictRecordFromQueueItem = ({ item, ack = null } = {}) => {
  if (!item || typeof item !== 'object') return null;

  const message = ack?.message || item.last_error || 'Sync conflict detected.';
  const statusToken = toToken(ack?.status || item.last_error || '');

  return {
    conflictId: `local_${Number(item.id || 0)}`,
    entityType: String(item.entity_type || 'unknown').trim() || 'unknown',
    reason: message,
    status: isConflictStatus(statusToken) ? 'open' : 'unknown',
    createdAt: item.created_at || new Date().toISOString(),
    updatedAt: item.updated_at || item.created_at || new Date().toISOString(),
    clientChange: item.payload || null,
    serverSnapshot: ack?.serverSnapshot || null,
    source: 'offline_queue',
  };
};

// ── Standard 3-mode resolver ──────────────────────────────────────────────────

export const resolveConflictPayload = ({
  mode = 'client_wins',
  localData = null,
  remoteData = null,
} = {}) => {
  const normalizedMode = toToken(mode) || 'client_wins';

  if (normalizedMode === 'server_wins') {
    return {
      resolution: 'server_wins',
      mergedData: remoteData && typeof remoteData === 'object' ? remoteData : null,
    };
  }

  if (normalizedMode === 'merge') {
    return {
      resolution: 'merge',
      mergedData: {
        ...(remoteData && typeof remoteData === 'object' ? remoteData : {}),
        ...(localData && typeof localData === 'object' ? localData : {}),
      },
    };
  }

  return {
    resolution: 'client_wins',
    mergedData: localData && typeof localData === 'object' ? localData : null,
  };
};

// ── FS-CRDT Semantic Invariants ───────────────────────────────────────────────
//
// Each checker: (mutation, serverSnapshot, ctx) → { holds, invariant, detail }
// ctx = live SQLite data fetched by the caller (current balances, quantities).

const ROUNDING_TOLERANCE_BDT = 0.01;
const CYCLE_COUNT_MAX_RATIO   = 0.50; // 50% discrepancy triggers escalation

const INVARIANT_CHECKERS = {

  baki_entry: (mutation, serverSnapshot, ctx) => {
    // I1: Payment cannot exceed outstanding balance
    if (mutation.type === 'payment') {
      const outstanding = Number(ctx.outstandingBalance ?? 0);
      const amount = Number(mutation.amount ?? 0);
      if (amount > outstanding + ROUNDING_TOLERANCE_BDT) {
        return {
          holds: false,
          invariant: 'PAYMENT_BALANCE_INTEGRITY',
          detail: `Payment ৳${amount.toFixed(2)} exceeds outstanding ৳${outstanding.toFixed(2)}`,
        };
      }
    }

    // I2: Credit entry cannot push balance past credit limit
    if (mutation.type === 'credit') {
      const limit = Number(ctx.creditLimit ?? Infinity);
      const outstanding = Number(ctx.outstandingBalance ?? 0);
      const amount = Number(mutation.amount ?? 0);
      if (Number.isFinite(limit) && outstanding + amount > limit + ROUNDING_TOLERANCE_BDT) {
        return {
          holds: false,
          invariant: 'CREDIT_CEILING',
          detail: `Credit ৳${amount.toFixed(2)} would exceed limit ৳${limit.toFixed(2)} (current: ৳${outstanding.toFixed(2)})`,
        };
      }
    }

    return { holds: true, invariant: 'BAKI_ENTRY_OK' };
  },

  inventory_movement: (mutation, serverSnapshot, ctx) => {
    // I3: Stock-out cannot push quantity negative
    const type = (mutation.movementType || mutation.movement_type || '').toUpperCase();
    if (type === 'STOCK_OUT' || type === 'OUT') {
      const qty = Number(ctx.currentQuantity ?? 0);
      const moveQty = Number(mutation.quantity ?? 0);
      if (moveQty > qty) {
        return {
          holds: false,
          invariant: 'STOCK_NON_NEGATIVE',
          detail: `Cannot remove ${moveQty} — only ${qty} units on hand`,
        };
      }
    }
    return { holds: true, invariant: 'STOCK_MOVEMENT_OK' };
  },

  cycle_count: (mutation, serverSnapshot, ctx) => {
    // I5: Large discrepancy requires human review
    const systemQty = Number(ctx.currentQuantity ?? 0);
    const physQty = Number(mutation.physicalQuantity ?? mutation.physical_quantity ?? 0);
    const diff = Math.abs(physQty - systemQty);
    const ratio = systemQty > 0 ? diff / systemQty : (physQty > 0 ? 1 : 0);

    if (ratio > CYCLE_COUNT_MAX_RATIO) {
      return {
        holds: false,
        invariant: 'CYCLE_COUNT_TOLERANCE',
        detail: `Physical ${physQty} vs system ${systemQty} — ${Math.round(ratio * 100)}% discrepancy`,
      };
    }
    return { holds: true, invariant: 'CYCLE_COUNT_OK' };
  },

  day_close: (mutation, serverSnapshot) => {
    // I4: A closed day is immutable
    if (serverSnapshot?.closedAt || serverSnapshot?.closed_at) {
      return {
        holds: false,
        invariant: 'DAY_CLOSE_IMMUTABLE',
        detail: `Business day ${serverSnapshot.businessDate ?? serverSnapshot.business_date} is already closed`,
      };
    }
    return { holds: true, invariant: 'DAY_CLOSE_OK' };
  },
};

// ── Invariant evaluator ───────────────────────────────────────────────────────

/**
 * Evaluate all FS-CRDT invariants for a mutation before it is merged.
 *
 * @param {object} opts
 * @param {string} opts.entityType
 * @param {object} opts.clientMutation  — payload being pushed
 * @param {object} [opts.serverSnapshot] — current server state
 * @param {object} [opts.ctx]            — live SQLite context (balances, quantities)
 * @returns {{ safe: boolean, violations: Array, requiresEscalation: boolean }}
 */
export const evaluateInvariants = ({
  entityType,
  clientMutation,
  serverSnapshot = null,
  ctx = {},
}) => {
  const checker = INVARIANT_CHECKERS[entityType];
  if (!checker) return { safe: true, violations: [], requiresEscalation: false };

  try {
    const result = checker(clientMutation, serverSnapshot, ctx);
    if (result.holds) return { safe: true, violations: [], requiresEscalation: false };

    return {
      safe: false,
      violations: [{ invariant: result.invariant, detail: result.detail }],
      requiresEscalation: true,
    };
  } catch (err) {
    console.error('[conflictResolver] Invariant check threw:', err?.message);
    return {
      safe: false,
      violations: [{ invariant: 'INVARIANT_CHECK_ERROR', detail: err?.message }],
      requiresEscalation: true,
    };
  }
};

// ── Merge orchestrator ────────────────────────────────────────────────────────

/**
 * Full FS-CRDT merge pipeline:
 *   1. Evaluate domain invariants.
 *   2. If all hold → apply standard resolution mode (client_wins / server_wins / merge).
 *   3. If any fail → return escalation signal; caller creates an ApprovalRequest.
 *
 * @returns {{
 *   action: 'merged'|'escalated',
 *   resolution?: string,
 *   mergedData?: object|null,
 *   violations?: Array,
 *   approvalPayload?: object
 * }}
 */
export const orchestrateMerge = ({
  entityType,
  clientMutation,
  serverSnapshot = null,
  ctx = {},
  preferredMode = 'client_wins',
}) => {
  const invariantResult = evaluateInvariants({ entityType, clientMutation, serverSnapshot, ctx });

  if (!invariantResult.safe) {
    return {
      action: 'escalated',
      violations: invariantResult.violations,
      approvalPayload: {
        actionType: `SYNC_INVARIANT_VIOLATION_${invariantResult.violations[0]?.invariant ?? 'UNKNOWN'}`,
        entityType,
        clientChange: clientMutation,
        serverSnapshot,
        violations: invariantResult.violations,
        requiredRole: 'OWNER',
      },
    };
  }

  const { resolution, mergedData } = resolveConflictPayload({
    mode: preferredMode,
    localData: clientMutation,
    remoteData: serverSnapshot,
  });

  return { action: 'merged', resolution, mergedData, violations: [] };
};
