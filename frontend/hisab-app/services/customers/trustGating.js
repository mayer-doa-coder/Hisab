import { TRUST_SCORING_METHODS, createStandardTrustOutput } from './trustFallbackPolicy.js';

// Ordered lowest → highest; indexOf gives numeric rank.
const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3'];

export const TRUST_SCOPE = Object.freeze({
  LOCAL: 'LOCAL',   // visible within this shop only
  GLOBAL: 'GLOBAL', // shareable across all shops via GlobalCustomerIdentity
});

export const TRUST_GATE_REASON = Object.freeze({
  UNVERIFIED:       'TRUST_GATE_UNVERIFIED',       // L0 — no phone, no PIN
  PHONE_ONLY:       'TRUST_GATE_PHONE_ONLY',        // L1 — phone verified, PIN not set
  FULLY_VERIFIED:   'TRUST_GATE_FULLY_VERIFIED',    // L2/L3 — both conditions met
  UNKNOWN_LEVEL:    'TRUST_GATE_UNKNOWN_LEVEL',
});

const GATE_REASON_MESSAGES = {
  [TRUST_GATE_REASON.UNVERIFIED]:     'Customer identity not verified. Trust score unavailable.',
  [TRUST_GATE_REASON.PHONE_ONLY]:     'PIN not set. Trust score requires both phone and PIN verification.',
  [TRUST_GATE_REASON.FULLY_VERIFIED]: 'Customer verified. Trust score active.',
  [TRUST_GATE_REASON.UNKNOWN_LEVEL]:  'Verification level unknown. Trust score unavailable.',
};

/**
 * Evaluate whether trust scoring is allowed and what scope applies.
 *
 * Rules:
 *   - trust_score is only valid when phone is verified (L1+) AND PIN is set (L2+)
 *   - L0          → LOCAL scope, trust blocked
 *   - L1          → LOCAL scope, trust blocked (PIN missing)
 *   - L2 / L3     → GLOBAL scope, trust allowed
 *
 * @param {string} verificationLevel  'L0' | 'L1' | 'L2' | 'L3'
 * @returns {{ scope, trustAllowed, phoneVerified, pinVerified, reason, message }}
 */
export function evaluateTrustGate(verificationLevel) {
  const rank = LEVEL_ORDER.indexOf(verificationLevel);

  if (rank < 0) {
    return {
      scope: TRUST_SCOPE.LOCAL,
      trustAllowed: false,
      phoneVerified: false,
      pinVerified: false,
      reason: TRUST_GATE_REASON.UNKNOWN_LEVEL,
      message: GATE_REASON_MESSAGES[TRUST_GATE_REASON.UNKNOWN_LEVEL],
    };
  }

  const phoneVerified = rank >= 1; // L1+
  const pinVerified   = rank >= 2; // L2+
  const trustAllowed  = phoneVerified && pinVerified;
  const scope         = pinVerified ? TRUST_SCOPE.GLOBAL : TRUST_SCOPE.LOCAL;

  let reason;
  if (!phoneVerified) {
    reason = TRUST_GATE_REASON.UNVERIFIED;
  } else if (!pinVerified) {
    reason = TRUST_GATE_REASON.PHONE_ONLY;
  } else {
    reason = TRUST_GATE_REASON.FULLY_VERIFIED;
  }

  return {
    scope,
    trustAllowed,
    phoneVerified,
    pinVerified,
    reason,
    message: GATE_REASON_MESSAGES[reason],
  };
}

/**
 * Blocked trust output used when the gate rejects scoring.
 * Returns a deterministic neutral score so callers never see null.
 */
export function buildBlockedTrustOutput(gate) {
  return createStandardTrustOutput({
    score: 50,        // neutral — no information
    riskLevel: 'LOW',
    method: TRUST_SCORING_METHODS.RULE_BASED,
    reason: gate.reason,
    explanation: gate.message,
  });
}
