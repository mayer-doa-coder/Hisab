// Anti-fraud rule definitions and pure evaluators.
// No DB calls here — all state is passed in, all output is a decision object.

const PIN_LOCKOUT_SCHEDULE = [
  { after_failures: 3, lock_minutes: 5 },
  { after_failures: 5, lock_minutes: 30 },
  { after_failures: 7, lock_minutes: 1440 }, // 24 h
];
const PIN_SUSPEND_AFTER_FAILURES = 10;

// Credit caps by verification level for customers with no payment history.
// Shopkeeper may raise the limit once the customer clears L2+ and has history.
const NEW_CUSTOMER_CREDIT_CAP = Object.freeze({
  L0: 0,      // unverified — no credit at all
  L1: 500,    // phone-verified — capped at ৳500
  L2: 2000,   // PIN-set — capped at ৳2000
  L3: null,   // trust-network vouched — shopkeeper sets their own limit
});

// ─── Pure rule evaluators ─────────────────────────────────────────────────────

/**
 * RULE: new phone ≠ new identity.
 * A phone number being new (not in the global registry) is NOT sufficient
 * justification to create a new identity — it only means "no match found".
 * Identity creation requires explicit shopkeeper intent, not just novelty.
 *
 * This is a policy guard: call it before any auto-identity creation path.
 * Returns { allowed, reason }.
 */
function rulePhoneNotIdentity({ isAutoCreation, shopkeeperConfirmed }) {
  if (isAutoCreation && !shopkeeperConfirmed) {
    return {
      allowed: false,
      code: 'NEW_PHONE_NOT_NEW_IDENTITY',
      reason: 'A new phone number does not automatically create a new identity. Shopkeeper must confirm.',
    };
  }
  return { allowed: true };
}

/**
 * RULE: PIN is always required for credit transactions.
 * Returns { allowed, reason }.
 */
function rulePinRequired({ verificationLevel, pinHash, transactionType }) {
  if (transactionType !== 'credit') return { allowed: true };

  if (!pinHash) {
    return {
      allowed: false,
      code: 'PIN_NOT_SET',
      reason: 'Customer has no PIN. PIN must be set before credit is extended.',
    };
  }
  if (verificationLevel === 'L0') {
    return {
      allowed: false,
      code: 'UNVERIFIED_IDENTITY',
      reason: 'L0 customers cannot receive credit. Phone must be verified first.',
    };
  }
  return { allowed: true };
}

/**
 * RULE: new customers get a hard credit cap.
 * `proposedAmount` is in BDT. `existingBalance` is the current outstanding balance.
 * Returns { allowed, cap, reason }.
 */
function ruleNewCustomerCreditCap({ verificationLevel, transactionHistory, proposedAmount, existingBalance }) {
  // customers with established history bypass the new-customer cap
  if (transactionHistory >= 5) return { allowed: true, cap: null };

  const cap = NEW_CUSTOMER_CREDIT_CAP[verificationLevel];
  if (cap === null) return { allowed: true, cap: null }; // L3 — shopkeeper controls

  if (cap === 0) {
    return {
      allowed: false,
      cap: 0,
      code: 'CREDIT_CAP_ZERO',
      reason: `L0 customers cannot receive credit.`,
    };
  }

  if (existingBalance + proposedAmount > cap) {
    return {
      allowed: false,
      cap,
      code: 'CREDIT_CAP_EXCEEDED',
      reason: `New customer credit cap is ৳${cap}. Current balance ৳${existingBalance} + proposed ৳${proposedAmount} would exceed it.`,
    };
  }

  return { allowed: true, cap };
}

/**
 * RULE: compute the next lockout duration after a failed PIN attempt.
 * Returns { suspend, lockUntil } where lockUntil is a Date or null.
 */
function rulePinLockout({ failedAttempts }) {
  const next = failedAttempts + 1;

  if (next >= PIN_SUSPEND_AFTER_FAILURES) {
    return { suspend: true, lockUntil: null };
  }

  // walk the schedule in reverse to find the highest matching threshold
  for (let i = PIN_LOCKOUT_SCHEDULE.length - 1; i >= 0; i--) {
    if (next >= PIN_LOCKOUT_SCHEDULE[i].after_failures) {
      const lockUntil = new Date(Date.now() + PIN_LOCKOUT_SCHEDULE[i].lock_minutes * 60 * 1000);
      return { suspend: false, lockUntil };
    }
  }

  return { suspend: false, lockUntil: null };
}

/**
 * RULE: no automatic merge by name similarity.
 * Any merge attempt that is not explicitly operator-initiated must be rejected.
 * Returns { allowed, reason }.
 */
function ruleNoAutoNameMerge({ mergeSource, operatorId }) {
  if (mergeSource === 'name_similarity' || mergeSource === 'auto') {
    return {
      allowed: false,
      code: 'AUTO_MERGE_BLOCKED',
      reason: 'Identity merges based on name similarity are not permitted. An operator must initiate merges explicitly.',
    };
  }
  if (!operatorId) {
    return {
      allowed: false,
      code: 'MERGE_REQUIRES_OPERATOR',
      reason: 'Identity merge requires an authenticated operator.',
    };
  }
  return { allowed: true };
}

module.exports = {
  PIN_LOCKOUT_SCHEDULE,
  PIN_SUSPEND_AFTER_FAILURES,
  NEW_CUSTOMER_CREDIT_CAP,
  rulePhoneNotIdentity,
  rulePinRequired,
  ruleNewCustomerCreditCap,
  rulePinLockout,
  ruleNoAutoNameMerge,
};
