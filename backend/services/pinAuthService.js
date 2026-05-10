const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const GlobalCustomerIdentity = require('../models/GlobalCustomerIdentity');
const Customer = require('../models/Customer');

const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const BCRYPT_ROUNDS = 10;
const PIN_REGEX = /^\d{4,6}$/;

/**
 * Hash a raw 4–6 digit PIN.
 * Throws if the PIN format is invalid.
 */
async function hashPin(rawPin) {
  if (!PIN_REGEX.test(String(rawPin))) {
    throw Object.assign(new Error('PIN must be 4–6 digits.'), { code: 'INVALID_PIN_FORMAT' });
  }
  return bcrypt.hash(String(rawPin), BCRYPT_ROUNDS);
}

/**
 * Set the PIN for a global identity. Advances verification level L1 → L2.
 */
async function setPin(globalId, rawPin) {
  const hash = await hashPin(rawPin);
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId });
  if (!identity) throw Object.assign(new Error('Identity not found.'), { code: 'NOT_FOUND' });

  identity.pin_hash = hash;
  identity.pin_failed_attempts = 0;
  identity.pin_lock_until = null;
  if (identity.verification_level === 'L1') identity.verification_level = 'L2';

  return identity.save();
}

/**
 * Verify a PIN for a GlobalCustomerIdentity looked up by globalId.
 * Returns true on success.
 * Throws a structured error on failure (wrong PIN, locked, no PIN set).
 */
async function verifyPinByGlobalId(globalId, rawPin) {
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId }).select(
    '+pin_hash'
  );
  if (!identity) throw Object.assign(new Error('Identity not found.'), { code: 'NOT_FOUND' });

  if (!identity.pin_hash) {
    // customer has no PIN configured — allow through
    return true;
  }

  if (identity.pin_lock_until && identity.pin_lock_until > new Date()) {
    const retryAfterMs = identity.pin_lock_until.getTime() - Date.now();
    throw Object.assign(new Error('PIN locked. Too many failed attempts.'), {
      code: 'PIN_LOCKED',
      retryAfterMs,
    });
  }

  const match = await bcrypt.compare(String(rawPin), identity.pin_hash);

  if (!match) {
    identity.pin_failed_attempts = (identity.pin_failed_attempts || 0) + 1;
    const attemptsLeft = MAX_ATTEMPTS - identity.pin_failed_attempts;

    if (attemptsLeft <= 0) {
      identity.pin_lock_until = new Date(Date.now() + LOCK_DURATION_MS);
      identity.pin_failed_attempts = 0;
    }

    await identity.save();

    throw Object.assign(new Error('Incorrect PIN.'), {
      code: 'WRONG_PIN',
      attemptsLeft: Math.max(0, attemptsLeft),
    });
  }

  // success — reset counters
  if (identity.pin_failed_attempts > 0 || identity.pin_lock_until) {
    identity.pin_failed_attempts = 0;
    identity.pin_lock_until = null;
    await identity.save();
  }

  return true;
}

/**
 * Verify PIN for a shop-scoped Customer.
 * Resolves to true when:
 *   - customer has no linked global identity, OR
 *   - global identity has no PIN set.
 * Throws on wrong PIN or lock.
 */
async function verifyPinForCustomer(customerId, rawPin) {
  const customer = await Customer.findById(customerId).select('globalCustomerId');
  if (!customer) throw Object.assign(new Error('Customer not found.'), { code: 'NOT_FOUND' });

  if (!customer.globalCustomerId) return true; // unlinked — no PIN requirement

  return verifyPinByGlobalId(customer.globalCustomerId, rawPin);
}

module.exports = { hashPin, setPin, verifyPinByGlobalId, verifyPinForCustomer };
