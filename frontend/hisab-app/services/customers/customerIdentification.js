import {
  normalizeText,
  toPhonetic,
  scoreCandidate,
} from '../voice/normalization/nameMatcher';

const MIN_CONFIDENCE = 0.65;
const AMBIGUITY_DELTA = 0.07;
const MAX_CANDIDATES = 3;

// Convert a flat customer record into the shape scoreCandidate expects.
function toScoringEntry(customer) {
  const name = String(customer.name || '').trim();
  return {
    id: customer.id ?? customer._id,
    name,
    type: 'customer',
    normalizedAliases: [normalizeText(name)].filter(Boolean),
    phoneticAliases: [toPhonetic(name)].filter(Boolean),
  };
}

// Best available timestamp for recency sort (newest = highest ms).
function recencyMs(customer) {
  const ts = customer.lastPaymentDate ?? customer.updatedAt ?? customer.createdAt;
  return ts ? new Date(ts).getTime() : 0;
}

/**
 * Identify up to MAX_CANDIDATES customers from `customers` that match `query`.
 *
 * query    – raw voice transcript or typed text (Bengali, Banglish, or mixed)
 * customers – array of customer objects from the local store or API
 * options.minConfidence  – minimum fuzzy score to consider (default 0.65)
 * options.recentFirst    – sort ties by recency before returning (default true)
 *
 * Returns:
 *   candidates  – top ≤3 matches ordered by score desc, then recency desc
 *   autoSelect  – true only when exactly 1 match and not ambiguous
 *   ambiguous   – true when top-2 scores are within AMBIGUITY_DELTA of each other
 */
export function identifyCustomer(query, customers = [], options = {}) {
  const { minConfidence = MIN_CONFIDENCE, recentFirst = true } = options;

  const normalizedQuery = normalizeText(query);
  const queryPhonetic = toPhonetic(normalizedQuery);

  if (!normalizedQuery || !customers.length) {
    return { candidates: [], autoSelect: false, ambiguous: false };
  }

  const scored = customers
    .map((customer) => ({
      customer,
      entry: toScoringEntry(customer),
      score: 0,
    }))
    .map((item) => ({
      ...item,
      score: scoreCandidate({
        query: normalizedQuery,
        queryPhonetic,
        candidate: item.entry,
      }),
    }))
    .filter(({ score }) => score >= minConfidence)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      if (recentFirst) return recencyMs(b.customer) - recencyMs(a.customer);
      return 0;
    });

  if (!scored.length) {
    return { candidates: [], autoSelect: false, ambiguous: false };
  }

  const top = scored[0];
  const second = scored[1] ?? null;
  const ambiguous = Boolean(
    second && Math.abs(top.score - second.score) <= AMBIGUITY_DELTA
  );
  // never auto-select when multiple matches exist — caller must ask user to pick
  const autoSelect = !ambiguous && scored.length === 1;

  const candidates = scored.slice(0, MAX_CANDIDATES).map(({ customer, score }) => ({
    id: customer.id ?? customer._id,
    name: customer.name,
    phone: customer.phone ?? null,
    score: Number(score.toFixed(3)),
    lastPaymentDate: customer.lastPaymentDate ?? null,
  }));

  return { candidates, autoSelect, ambiguous };
}
