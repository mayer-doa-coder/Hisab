/**
 * Confidence handling system for the Hisab voice flow.
 *
 * Responsibilities:
 *   1. Decide what to do after a low-confidence or failed recognition attempt:
 *        ACCEPT → confidence is fine, proceed
 *        REPEAT → ask the user to say it again (generic)
 *        SUGGEST → play back what was heard and ask for confirmation
 *        ESCALATE_TOUCH → max retries exceeded, switch to touch input
 *
 *   2. Generate Bengali confirmation prompts
 *        "আপনি কি রহিম বলেছিলেন?"
 *        "আপনি কি ৫০ টাকা বলেছিলেন?"
 *
 *   3. Provide structured touch-fallback data so the UI can render
 *        appropriate pickers without any further logic.
 *
 * This module is intentionally free of FSM state-machine logic.
 * It receives pre-computed values and returns display/action data.
 */

import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';

// ─── Action codes ─────────────────────────────────────────────────────────────

export const CONFIDENCE_ACTION = Object.freeze({
  /** Recognition quality is acceptable — proceed to the next FSM step. */
  ACCEPT:         'ACCEPT',

  /** Recognition failed outright — ask the user to repeat the entire input. */
  REPEAT:         'REPEAT',

  /** A close match was found but is below threshold — confirm with the user. */
  SUGGEST:        'SUGGEST',

  /** Max retries exhausted — fall back to touch/keyboard input. */
  ESCALATE_TOUCH: 'ESCALATE_TOUCH',
});

// ─── Per-state configuration ──────────────────────────────────────────────────
//
// minConfidence  : below this the action is REPEAT or SUGGEST (not ACCEPT)
// suggestFloor   : above this a candidate is worth surfacing as a suggestion
// maxRetries     : after this many failed attempts → ESCALATE_TOUCH

const SLOT_CONFIG = Object.freeze({
  WAIT_INTENT: {
    minConfidence: VOICE_TUNING_CONFIG.thresholds.intentConfidenceMin || 0.80,
    suggestFloor:  0.65,
    maxRetries:    2,
  },
  WAIT_NAME: {
    minConfidence: VOICE_TUNING_CONFIG.thresholds.nameConfidenceMin || 0.85,
    suggestFloor:  0.68,
    maxRetries:    2,
  },
  WAIT_AMOUNT: {
    minConfidence: VOICE_TUNING_CONFIG.thresholds.amountConfidenceMin || 0.90,
    suggestFloor:  0.75,
    maxRetries:    2,
  },
  WAIT_DATE: {
    minConfidence: 0.80,
    suggestFloor:  0.65,
    maxRetries:    2,
  },
  CONFIRM: {
    minConfidence: 0.95,
    suggestFloor:  0.80,
    maxRetries:    1,
  },
});

const DEFAULT_SLOT_CONFIG = Object.freeze({ minConfidence: 0.85, suggestFloor: 0.68, maxRetries: 2 });

// ─── Bengali intent display labels ───────────────────────────────────────────

const INTENT_LABELS_BN = Object.freeze({
  baki:    'বাকি',
  joma:    'জমা',
  becha:   'বেচা',
  kinbo:   'কিনবো',
  balance: 'হিসাব',
});

// ─── Bengali prompt generation ────────────────────────────────────────────────

/**
 * Builds a Bengali yes/no confirmation prompt from a parsed value.
 *
 * Examples:
 *   buildBengaliPrompt({ state:'WAIT_NAME', value:'Rahim' })
 *     → "আপনি কি \"Rahim\" বলেছিলেন?"
 *
 *   buildBengaliPrompt({ state:'WAIT_NAME', candidates:['Rahim','Rohim'] })
 *     → "আপনি কি \"Rahim\" না \"Rohim\" বলেছিলেন?"
 *
 *   buildBengaliPrompt({ state:'WAIT_AMOUNT', value:50 })
 *     → "আপনি কি ৫০ টাকা বলেছিলেন?"
 */
export const buildBengaliPrompt = ({ state, value, candidates = [], reason } = {}) => {
  const names = (Array.isArray(candidates) ? candidates : []).slice(0, 2).map(String).filter(Boolean);

  // Ambiguity prompt — two near-equal candidates
  if (reason === 'AMBIGUOUS_NAME' || names.length >= 2) {
    return `আপনি কি "${names[0]}" না "${names[1]}" বলেছিলেন?`;
  }

  switch (state) {
    case 'WAIT_NAME': {
      const label = names[0] || String(value || '');
      return label
        ? `আপনি কি "${label}" বলেছিলেন?`
        : 'নামটি আরও স্পষ্ট করে বলুন।';
    }

    case 'WAIT_AMOUNT': {
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
        // Convert Arabic digits to Bengali for display
        const bengaliAmount = String(Number(value))
          .split('')
          .map((ch) => '০১২৩৪৫৬৭৮৯'[Number(ch)] ?? ch)
          .join('');
        return `আপনি কি ${bengaliAmount} টাকা বলেছিলেন?`;
      }
      return 'কত টাকা বলুন? (সংখ্যায়)';
    }

    case 'WAIT_INTENT': {
      const intentLabel = INTENT_LABELS_BN[String(value || '')] || String(value || '');
      return intentLabel
        ? `আপনি কি "${intentLabel}" বলেছিলেন?`
        : 'কি করতে চান? বাকি, জমা, বেচা বা হিসাব বলুন।';
    }

    case 'WAIT_DATE': {
      if (value) return `আপনি কি "${value}" তারিখ বলেছিলেন?`;
      return 'তারিখ বলুন — আজ, কাল, বা নির্দিষ্ট তারিখ।';
    }

    case 'CONFIRM':
      return 'নিশ্চিত করতে "confirm" বা "yes" বলুন। বাতিল করতে "না" বলুন।';

    default:
      return 'আমি ঠিকমতো শুনতে পাইনি। আবার বলুন।';
  }
};

// ─── Touch fallback data ──────────────────────────────────────────────────────

/**
 * Returns structured data for the touch-input fallback UI.
 *
 * The returned object describes what kind of picker to render and what options
 * to show.  The UI is responsible for turning these into actual components.
 */
export const buildTouchFallback = ({ state, candidates = [], knownNames = [] } = {}) => {
  switch (state) {
    case 'WAIT_NAME': {
      // Prefer candidates surfaced by the fuzzy matcher; fall back to the full
      // customer list so the user can always make a selection.
      const options = candidates.length > 0
        ? candidates.map((c) => ({ id: c.id || null, label: String(c.name || c), value: String(c.name || c) }))
        : (Array.isArray(knownNames) ? knownNames : []).slice(0, 6)
            .map((n) => ({ id: n.id || null, label: String(n.name || n), value: String(n.name || n) }));

      return {
        type:        'name_picker',
        instruction: 'নাম বেছে নিন:',
        options,
      };
    }

    case 'WAIT_INTENT':
      return {
        type:        'intent_picker',
        instruction: 'কি করতে চান?',
        options: [
          { label: 'বাকি',   value: 'baki',    icon: 'credit-card' },
          { label: 'জমা',    value: 'joma',    icon: 'arrow-down'  },
          { label: 'বেচা',   value: 'becha',   icon: 'shopping-bag'},
          { label: 'হিসাব',  value: 'balance', icon: 'bar-chart'   },
        ],
      };

    case 'WAIT_AMOUNT':
      return {
        type:        'amount_input',
        instruction: 'টাকার পরিমাণ লিখুন বা বেছে নিন:',
        quickAmounts: [50, 100, 200, 500, 1000, 2000, 5000],
      };

    case 'WAIT_DATE':
      return {
        type:        'date_picker',
        instruction: 'তারিখ বেছে নিন:',
        options: [
          { label: 'আজ',  value: 'aj'  },
          { label: 'কাল', value: 'kal' },
        ],
        allowCustomDate: true,
      };

    case 'CONFIRM':
      return {
        type:        'confirm_buttons',
        instruction: 'নিশ্চিত করবেন?',
        options: [
          { label: 'হ্যাঁ, নিশ্চিত', value: 'confirm', variant: 'primary'   },
          { label: 'না, বাতিল',      value: 'cancel',  variant: 'secondary' },
        ],
      };

    default:
      return {
        type:        'text_input',
        instruction: 'ম্যানুয়ালি লিখুন:',
        options:     [],
      };
  }
};

// ─── Main decision engine ─────────────────────────────────────────────────────

/**
 * Evaluates a recognition result and decides what the voice flow should do.
 *
 * @param {Object} params
 * @param {string}  params.state        - Current FSM state (e.g. 'WAIT_NAME')
 * @param {number}  params.confidence   - 0–1 recognition confidence
 * @param {*}       params.value        - Parsed value (name string, amount number, intent token, etc.)
 * @param {Array}   params.candidates   - Fuzzy-match candidates [{name, id, confidence}]
 * @param {string}  params.reason       - Why recognition failed (e.g. 'LOW_CONFIDENCE_NAME')
 * @param {number}  params.retryCount   - How many times this state has already been retried
 * @param {Array}   params.knownNames   - Full customer list for touch fallback
 *
 * @returns {ConfidenceResult}
 * {
 *   action:         CONFIDENCE_ACTION
 *   message:        string   — Bengali message shown to user
 *   prompt:         string   — Bengali confirmation/clarification prompt
 *   suggestedValue: *|null   — top candidate's value (for SUGGEST action)
 *   suggestedId:    string|null
 *   touchFallback:  Object|null
 *   retryCount:     number   — the updated count
 * }
 */
export const evaluateConfidence = ({
  state,
  confidence,
  value,
  candidates = [],
  reason = '',
  retryCount = 0,
  knownNames = [],
} = {}) => {
  const cfg     = SLOT_CONFIG[state] || DEFAULT_SLOT_CONFIG;
  const retries = Number(retryCount || 0);
  const conf    = Number(confidence || 0);

  // ── Case 1: Above threshold → accept, no UX intervention needed ──────────
  if (conf >= cfg.minConfidence) {
    return {
      action:         CONFIDENCE_ACTION.ACCEPT,
      message:        '',
      prompt:         '',
      suggestedValue: null,
      suggestedId:    null,
      touchFallback:  null,
      retryCount:     retries,
    };
  }

  // ── Case 2: Max retries hit → escalate to touch regardless of confidence ─
  if (retries >= cfg.maxRetries) {
    const prompt = buildBengaliPrompt({ state, value, candidates: candidates.map((c) => c.name || c), reason });
    return {
      action:         CONFIDENCE_ACTION.ESCALATE_TOUCH,
      message:        'অনুগ্রহ করে স্ক্রিন থেকে বেছে নিন।',
      prompt,
      suggestedValue: null,
      suggestedId:    null,
      touchFallback:  buildTouchFallback({ state, candidates, knownNames }),
      retryCount:     retries + 1,
    };
  }

  // ── Case 3: A usable candidate exists → suggest it ───────────────────────
  const topCandidate = Array.isArray(candidates) ? candidates[0] : null;
  const topConf      = Number(topCandidate?.confidence || 0);

  if (topCandidate && topConf >= cfg.suggestFloor) {
    const candidateNames = candidates.slice(0, 2).map((c) => String(c.name || c));
    const prompt = buildBengaliPrompt({ state, value: topCandidate.name || topCandidate, candidates: candidateNames, reason });

    return {
      action:         CONFIDENCE_ACTION.SUGGEST,
      message:        prompt,
      prompt,
      suggestedValue: topCandidate.name || topCandidate,
      suggestedId:    topCandidate.id    || null,
      touchFallback:  buildTouchFallback({ state, candidates, knownNames }),
      retryCount:     retries + 1,
    };
  }

  // ── Case 4: Nothing usable → ask to repeat ────────────────────────────────
  const prompt = buildBengaliPrompt({ state, value, candidates: candidates.map((c) => c.name || c), reason });
  return {
    action:         CONFIDENCE_ACTION.REPEAT,
    message:        prompt,
    prompt,
    suggestedValue: null,
    suggestedId:    null,
    touchFallback:  buildTouchFallback({ state, candidates, knownNames }),
    retryCount:     retries + 1,
  };
};

// ─── Convenience: integrate with FSM transition result ────────────────────────

/**
 * Interprets a transition() return value and produces a ConfidenceResult.
 *
 * Pass the raw FSM transition result plus the knownNames list.
 * Returns null when no confidence action is needed (successful transition).
 *
 * Usage in VoiceAssistantScreen:
 *   const result = transition({ ... });
 *   const cr = interpretFSMResult(result, knownNames);
 *   if (cr && cr.action !== CONFIDENCE_ACTION.ACCEPT) {
 *     // show Bengali prompt or touch fallback
 *   }
 */
export const interpretFSMResult = (fsmResult, knownNames = []) => {
  if (!fsmResult) return null;

  // Successful transition — no confidence action needed
  if (!fsmResult.touchEscalation && !fsmResult.ambiguity) {
    const prevState = fsmResult.context?.flowHistory?.slice(-2, -1)[0];
    if (prevState !== fsmResult.state) return null;   // state changed → success
  }

  const state      = fsmResult.state;
  const retries    = Number((fsmResult.context?.retriesByState || {})[state] || 0);
  const candidates = (fsmResult.ambiguity?.candidates || []).map((name) => ({ name, id: null, confidence: 0.75 }));

  return evaluateConfidence({
    state,
    confidence:  0,            // assume failed recognition (we only call this on failure)
    value:       candidates[0]?.name || null,
    candidates,
    reason:      fsmResult.touchEscalation?.reason || '',
    retryCount:  retries,
    knownNames,
  });
};

export default {
  CONFIDENCE_ACTION,
  buildBengaliPrompt,
  buildTouchFallback,
  evaluateConfidence,
  interpretFSMResult,
};
