const { randomUUID } = require('crypto');
const GlobalCustomerIdentity = require('../models/GlobalCustomerIdentity');
const Customer = require('../models/Customer');
const { guardIdentityCreation } = require('./fraudGuard');

const L3_SHOP_THRESHOLD = 3;

/**
 * Find an existing global identity by phone number.
 * Returns null when no match exists.
 */
async function findByPhone(phoneNumber) {
  return GlobalCustomerIdentity.findByPhone(phoneNumber);
}

/**
 * Create a new global identity from minimal data.
 * Starts at L0; caller must verify phone separately.
 */
async function createIdentity({ name, phone = null }) {
  const identity = new GlobalCustomerIdentity({
    global_id: randomUUID(),
    name,
    phones: phone ? [{ number: phone, isPrimary: true, verified: false }] : [],
  });
  return identity.save();
}

/**
 * Mark a phone number as OTP-verified and advance verification level.
 * L0 → L1 when the first phone is verified.
 */
async function markPhoneVerified(globalId, phoneNumber) {
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId });
  if (!identity) throw new Error('Identity not found');

  const entry = identity.phones.find((p) => p.number === phoneNumber);
  if (!entry) throw new Error('Phone not registered on identity');

  entry.verified = true;
  entry.verifiedAt = new Date();

  if (identity.verification_level === 'L0') {
    identity.verification_level = 'L1';
  }

  return identity.save();
}

/**
 * Set (or replace) the PIN hash. Advances L1 → L2.
 * pin_hash must be a bcrypt hash — never store plaintext.
 */
async function setPinHash(globalId, bcryptHash) {
  const identity = await GlobalCustomerIdentity.findOne({ global_id: globalId });
  if (!identity) throw new Error('Identity not found');

  identity.pin_hash = bcryptHash;

  if (identity.verification_level === 'L1') {
    identity.verification_level = 'L2';
  }

  return identity.save();
}

/**
 * Link a shop-scoped Customer record to a GlobalCustomerIdentity.
 * Increments shop_link_count and gates the L2 → L3 promotion.
 */
async function linkToShop(globalId, customerId) {
  const [identity, customer] = await Promise.all([
    GlobalCustomerIdentity.findOne({ global_id: globalId }),
    Customer.findById(customerId),
  ]);

  if (!identity) throw new Error('Identity not found');
  if (!customer) throw new Error('Customer not found');
  if (customer.globalCustomerId === globalId) return { identity, customer }; // already linked

  customer.globalCustomerId = globalId;
  identity.shop_link_count += 1;

  if (
    identity.verification_level === 'L2' &&
    identity.shop_link_count >= L3_SHOP_THRESHOLD
  ) {
    identity.verification_level = 'L3';
  }

  await Promise.all([identity.save(), customer.save()]);
  return { identity, customer };
}

/**
 * Update trust_score and risk_score from the ML pipeline output.
 * Both values must be in [0, 1].
 */
async function updateScores(globalId, { trust_score, risk_score }) {
  return GlobalCustomerIdentity.findOneAndUpdate(
    { global_id: globalId },
    { trust_score, risk_score },
    { new: true, runValidators: true }
  );
}

/**
 * Upsert: find-or-create by phone number.
 * shopkeeperConfirmed must be true — a new phone never auto-creates an identity.
 * Returns { identity, created: boolean } or throws on fraud rule violation.
 */
async function findOrCreate({ name, phone = null, shopkeeperConfirmed = false }) {
  if (phone) {
    const existing = await findByPhone(phone);
    if (existing) return { identity: existing, created: false };
  }

  const guard = guardIdentityCreation({ isAutoCreation: !shopkeeperConfirmed, shopkeeperConfirmed });
  if (!guard.ok) {
    const err = new Error(guard.reason);
    err.code = guard.code;
    throw err;
  }

  const identity = await createIdentity({ name, phone });
  return { identity, created: true };
}

module.exports = {
  findByPhone,
  createIdentity,
  markPhoneVerified,
  setPinHash,
  linkToShop,
  updateScores,
  findOrCreate,
  // re-export for convenience; callers can import either service
  verifyPin: require('./fraudGuard').verifyPin,
  guardCreditTransaction: require('./fraudGuard').guardCreditTransaction,
};
