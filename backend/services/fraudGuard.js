const bcrypt = require('bcrypt');
const GlobalCustomerIdentity = require('../models/GlobalCustomerIdentity');
const {
  rulePhoneNotIdentity,
  rulePinRequired,
  ruleNewCustomerCreditCap,
  rulePinLockout,
  ruleNoAutoNameMerge,
} = require('../security/fraudRules');

// ─── PIN verification with lockout ───────────────────────────────────────────

/**
 * Verify a customer's PIN. Enforces lockout and suspension on failure.
 * Returns { ok, code, reason }.
 *
 * Must be called before any credit transaction.
 */
async function verifyPin(globalId, plaintextPin) {
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId }).select(
    '+pin_hash'
  );

  if (!identity) return { ok: false, code: 'IDENTITY_NOT_FOUND', reason: 'Identity not found.' };
  if (identity.status === 'SUSPENDED') {
    return { ok: false, code: 'IDENTITY_SUSPENDED', reason: 'Identity is suspended due to too many failed PIN attempts.' };
  }
  if (identity.status === 'MERGED') {
    return { ok: false, code: 'IDENTITY_MERGED', reason: `This identity was merged. Use ${identity.merged_into}.` };
  }
  if (!identity.pin_hash) {
    return { ok: false, code: 'PIN_NOT_SET', reason: 'No PIN is set for this identity.' };
  }

  // check active lockout
  if (identity.pin_lock_until && identity.pin_lock_until > new Date()) {
    const seconds = Math.ceil((identity.pin_lock_until - Date.now()) / 1000);
    return { ok: false, code: 'PIN_LOCKED', reason: `PIN is locked. Try again in ${seconds}s.` };
  }

  const match = await bcrypt.compare(String(plaintextPin), identity.pin_hash);

  if (!match) {
    const { suspend, lockUntil } = rulePinLockout({ failedAttempts: identity.pin_failed_attempts });

    identity.pin_failed_attempts += 1;
    if (suspend) {
      identity.status = 'SUSPENDED';
      identity.pin_lock_until = null;
    } else {
      identity.pin_lock_until = lockUntil;
    }
    await identity.save();

    const base = { ok: false, code: 'PIN_WRONG', reason: 'Incorrect PIN.' };
    if (suspend) return { ...base, code: 'PIN_SUSPENDED', reason: 'Too many failures. Identity suspended.' };
    if (lockUntil) return { ...base, code: 'PIN_LOCKED', reason: `Too many failures. PIN locked until ${lockUntil.toISOString()}.` };
    return base;
  }

  // success — reset failure counters
  if (identity.pin_failed_attempts > 0 || identity.pin_lock_until) {
    identity.pin_failed_attempts = 0;
    identity.pin_lock_until = null;
    await identity.save();
  }

  return { ok: true };
}

// ─── Credit transaction guard ─────────────────────────────────────────────────

/**
 * Run all fraud rules before a credit transaction.
 *
 * @param {object} params
 * @param {string} params.globalId
 * @param {number} params.proposedAmount  — amount in BDT being credited
 * @param {number} params.existingBalance — current outstanding balance
 * @param {number} params.transactionHistory — count of prior completed transactions
 * @param {string} params.plaintextPin    — PIN entered by customer for this transaction
 * @returns {{ ok, code, reason }}
 */
async function guardCreditTransaction({ globalId, proposedAmount, existingBalance, transactionHistory, plaintextPin }) {
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId }).select('+pin_hash');

  if (!identity) return { ok: false, code: 'IDENTITY_NOT_FOUND', reason: 'Identity not found.' };

  // Rule: PIN required for credit
  const pinCheck = rulePinRequired({
    verificationLevel: identity.verification_level,
    pinHash: identity.pin_hash,
    transactionType: 'credit',
  });
  if (!pinCheck.allowed) return { ok: false, ...pinCheck };

  // Rule: verify the PIN (includes lockout logic)
  const pinResult = await verifyPin(globalId, plaintextPin);
  if (!pinResult.ok) return pinResult;

  // Rule: new customer credit cap
  const capCheck = ruleNewCustomerCreditCap({
    verificationLevel: identity.verification_level,
    transactionHistory,
    proposedAmount,
    existingBalance,
  });
  if (!capCheck.allowed) return { ok: false, ...capCheck };

  return { ok: true };
}

// ─── Identity creation guard ──────────────────────────────────────────────────

/**
 * Guard against creating a new identity just because a phone is new.
 * Must be called on any auto-creation path.
 *
 * @param {object} params
 * @param {boolean} params.isAutoCreation       — true when triggered by a system flow, not explicit shopkeeper action
 * @param {boolean} params.shopkeeperConfirmed  — true when the shopkeeper explicitly pressed "Add new customer"
 * @returns {{ ok, code, reason }}
 */
function guardIdentityCreation({ isAutoCreation, shopkeeperConfirmed }) {
  const result = rulePhoneNotIdentity({ isAutoCreation, shopkeeperConfirmed });
  return result.allowed ? { ok: true } : { ok: false, ...result };
}

// ─── Merge guard ──────────────────────────────────────────────────────────────

/**
 * Guard against automatic name-based merges.
 * @param {object} params
 * @param {string} params.mergeSource  — 'name_similarity' | 'auto' | 'operator'
 * @param {string} params.operatorId   — authenticated user ID initiating the merge
 * @returns {{ ok, code, reason }}
 */
function guardMerge({ mergeSource, operatorId }) {
  const result = ruleNoAutoNameMerge({ mergeSource, operatorId });
  return result.allowed ? { ok: true } : { ok: false, ...result };
}

module.exports = {
  verifyPin,
  guardCreditTransaction,
  guardIdentityCreation,
  guardMerge,
};
