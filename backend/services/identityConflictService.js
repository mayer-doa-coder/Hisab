// Pure conflict detection — no DB calls, no side effects.
// All functions take plain data and return a decision object.

const CONFLICT_TYPES = Object.freeze({
  NONE:                  'NONE',
  PHONE_NAME_MISMATCH:   'PHONE_NAME_MISMATCH',   // phone → existing identity, name doesn't match
  NAME_MULTIPLE_GLOBAL:  'NAME_MULTIPLE_GLOBAL',  // spoken name matches multiple global identities
});

const RESOLUTION = Object.freeze({
  LINK_EXISTING:  'LINK_EXISTING',  // use the already-registered global identity
  KEEP_LOCAL:     'KEEP_LOCAL',     // create a shop-local customer, no global link
  SELECT:         'SELECT',         // caller picks from a candidate list
});

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Case 1: shopkeeper registered a phone that already belongs to a differently-named person.
 *
 * @param {string}  spokenName        — name the shopkeeper gave during registration
 * @param {object}  existingIdentity  — GlobalCustomerIdentity found by phone lookup
 *                                      (null = no conflict)
 * @returns {{ type, data } | null}
 */
function detectPhoneNameMismatch({ spokenName, existingIdentity }) {
  if (!existingIdentity) return null;

  const normalize = (s) => String(s || '').trim().toLowerCase();
  const spoken   = normalize(spokenName);
  const existing = normalize(existingIdentity.name);

  if (spoken === existing) return null; // same name — no conflict

  return {
    type: CONFLICT_TYPES.PHONE_NAME_MISMATCH,
    data: {
      spokenName:      spokenName,
      existingName:    existingIdentity.name,
      existingGlobalId: existingIdentity.global_id,
      phone:           existingIdentity.phones?.[0]?.number ?? null,
      verificationLevel: existingIdentity.verification_level,
    },
  };
}

/**
 * Case 2: spoken name matches multiple global identities close enough to be ambiguous.
 *
 * @param {string}   spokenName       — name the shopkeeper or voice said
 * @param {object[]} globalCandidates — array of { global_id, name, score } from name-match search
 * @param {number}   ambiguityDelta   — max score gap to consider ambiguous (default 0.07)
 * @returns {{ type, data } | null}
 */
function detectNameMultipleGlobal({ spokenName, globalCandidates, ambiguityDelta = 0.07 }) {
  const ranked = (Array.isArray(globalCandidates) ? globalCandidates : [])
    .filter((c) => c && c.global_id)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (ranked.length < 2) return null;

  const top    = ranked[0];
  const second = ranked[1];

  if (Math.abs((top.score || 0) - (second.score || 0)) > ambiguityDelta) return null; // clear winner

  return {
    type: CONFLICT_TYPES.NAME_MULTIPLE_GLOBAL,
    data: {
      spokenName,
      candidates: ranked.slice(0, 3).map((c) => ({
        global_id: c.global_id,
        name:      c.name,
        score:     Number((c.score || 0).toFixed(3)),
        phone:     c.phone ?? null,
      })),
    },
  };
}

/**
 * Unified entry point. Returns the first conflict found, or null.
 */
function detectConflict({ spokenName, phone, existingByPhone, globalNameCandidates }) {
  const phoneMismatch = detectPhoneNameMismatch({
    spokenName,
    existingIdentity: existingByPhone || null,
  });
  if (phoneMismatch) return phoneMismatch;

  const nameDuplicate = detectNameMultipleGlobal({
    spokenName,
    globalCandidates: globalNameCandidates || [],
  });
  if (nameDuplicate) return nameDuplicate;

  return { type: CONFLICT_TYPES.NONE, data: null };
}

// ─── Bengali prompt builders ──────────────────────────────────────────────────

/**
 * Returns a Bengali prompt explaining the conflict and asking for confirmation.
 */
function buildConflictPrompt(conflict) {
  if (!conflict || conflict.type === CONFLICT_TYPES.NONE) return '';

  if (conflict.type === CONFLICT_TYPES.PHONE_NAME_MISMATCH) {
    const { phone, existingName, spokenName } = conflict.data;
    const phoneDisplay = phone ? `(${phone})` : '';
    return (
      `এই ফোন নম্বর ${phoneDisplay} ইতিমধ্যে "${existingName}" নামে নিবন্ধিত। ` +
      `আপনি কি "${spokenName}" এবং "${existingName}" একই ব্যক্তি বলতে চাইছেন? ` +
      `হ্যাঁ বললে পুরানো পরিচয় ব্যবহার হবে। না বললে শুধু এই দোকানে নতুন গ্রাহক থাকবে।`
    );
  }

  if (conflict.type === CONFLICT_TYPES.NAME_MULTIPLE_GLOBAL) {
    const { candidates } = conflict.data;
    const names = candidates.slice(0, 2).map((c, i) => `${i + 1}. ${c.name}`).join(', ');
    return (
      `এই নামে একাধিক পরিচয় পাওয়া গেছে: ${names}। ` +
      `কোনটি সঠিক? এক বা দুই বলুন। অথবা "আলাদা" বললে শুধু এই দোকানের গ্রাহক হবে।`
    );
  }

  return 'পরিচয় দ্বন্দ্ব আছে। হ্যাঁ বা না বলুন।';
}

/**
 * Maps a caller-side resolution choice into a typed resolution object.
 * voice_answer: 'link' | 'keep_local' | 1 | 2 (index for NAME_MULTIPLE_GLOBAL)
 */
function resolveConflict({ conflict, voiceAnswer }) {
  if (!conflict || conflict.type === CONFLICT_TYPES.NONE) {
    return { resolution: RESOLUTION.LINK_EXISTING, globalId: null };
  }

  if (conflict.type === CONFLICT_TYPES.PHONE_NAME_MISMATCH) {
    if (voiceAnswer === 'link') {
      return {
        resolution: RESOLUTION.LINK_EXISTING,
        globalId:   conflict.data.existingGlobalId,
        name:       conflict.data.existingName,
      };
    }
    return { resolution: RESOLUTION.KEEP_LOCAL };
  }

  if (conflict.type === CONFLICT_TYPES.NAME_MULTIPLE_GLOBAL) {
    if (voiceAnswer === 'keep_local') {
      return { resolution: RESOLUTION.KEEP_LOCAL };
    }
    const idx = typeof voiceAnswer === 'number' ? voiceAnswer : -1;
    const chosen = idx >= 0 ? conflict.data.candidates[idx] : null;
    if (!chosen) return { resolution: RESOLUTION.KEEP_LOCAL };
    return {
      resolution: RESOLUTION.SELECT,
      globalId:   chosen.global_id,
      name:       chosen.name,
    };
  }

  // unknown conflict type — always keep local
  return { resolution: RESOLUTION.KEEP_LOCAL };
}

module.exports = {
  CONFLICT_TYPES,
  RESOLUTION,
  detectConflict,
  detectPhoneNameMismatch,
  detectNameMultipleGlobal,
  buildConflictPrompt,
  resolveConflict,
};
