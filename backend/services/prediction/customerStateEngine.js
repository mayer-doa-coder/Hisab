'use strict';

// Customer behavioral state engine.
// Maps raw customer payment data to CUSTOMER_MARKOV_STATES.
// Completely independent of the financial market state engine.

const {
  CUSTOMER_MARKOV_STATES_CONFIG,
  CUSTOMER_STATE_KEYS,
} = require('../../config/customerMarkovStates');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toNum = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

// ─── Feature derivation ───────────────────────────────────────────────────────

/**
 * Derive the 6 behavioral features from a customer data snapshot.
 *
 * @param {object} snapshot
 *   - payment_records:   [{ amount, delay_days, is_late, status }]
 *   - transaction_count: number (fallback when records not provided)
 *   - due_amount_bdt:    current outstanding balance in BDT
 *   - last_activity_date: ISO date string of last transaction
 *   - as_of:             ISO date string to compute recency_days (default: now)
 * @returns {object} features
 */
function deriveCustomerFeatures(snapshot = {}) {
  const records   = Array.isArray(snapshot.payment_records) ? snapshot.payment_records : [];
  const asOf      = new Date(snapshot.as_of || new Date());
  const lastDate  = snapshot.last_activity_date ? new Date(snapshot.last_activity_date) : null;

  const recencyDays = lastDate && Number.isFinite(lastDate.getTime())
    ? Math.max(0, Math.floor((asOf - lastDate) / 86400000))
    : 9999;

  // Transaction depth — actual record count beats supplied counter
  const transactionDepth = Math.max(
    records.length,
    Math.trunc(toNum(snapshot.transaction_count, 0))
  );

  // Due amount in BDT
  const dueAmountBdt = clamp(toNum(snapshot.due_amount_bdt ?? snapshot.due_amount ?? 0, 0), 0, 1e8);

  // Payment delay stats
  const delays = records
    .map((r) => toNum(r?.delay_days, 0))
    .filter((d) => d >= 0);
  const avgDelayDays = delays.length > 0
    ? delays.reduce((s, d) => s + d, 0) / delays.length
    : 0;

  // Payment consistency = fraction of on-time payments
  const lateCount = records.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (r.is_late === true) return true;
    if (String(r.status || '').toLowerCase() === 'late') return true;
    return toNum(r.delay_days, 0) > 0;
  }).length;
  const paymentConsistency = records.length > 0
    ? clamp((records.length - lateCount) / records.length, 0, 1)
    : 0.5; // neutral prior when no records

  // Payment volatility — coefficient of variation of payment amounts
  const amounts = records
    .map((r) => toNum(r?.amount, 0))
    .filter((a) => a > 0);
  let paymentVolatility = 0;
  if (amounts.length >= 2) {
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    paymentVolatility = mean > 0 ? Math.sqrt(variance) / mean : 0;
  }

  return {
    transaction_depth: transactionDepth,
    due_amount_bdt: dueAmountBdt,
    avg_delay_days: Number(avgDelayDays.toFixed(2)),
    payment_consistency: Number(paymentConsistency.toFixed(4)),
    payment_volatility: Number(paymentVolatility.toFixed(4)),
    recency_days: recencyDays,
  };
}

// ─── State assignment ─────────────────────────────────────────────────────────

const T = CUSTOMER_MARKOV_STATES_CONFIG.thresholds;

/**
 * Assign a customer behavioral state from features.
 * Rules are evaluated in priority order — first match wins.
 *
 * @param {object} features       — output of deriveCustomerFeatures()
 * @param {string|null} prevState — previous Markov state (for RECOVERING detection)
 * @returns {string} state key
 */
function assignCustomerState(features, prevState = null) {
  const {
    transaction_depth: depth,
    due_amount_bdt:    due,
    avg_delay_days:    delay,
    payment_consistency: consistency,
    recency_days:      recency,
  } = features;

  const prev = String(prevState || '').trim().toUpperCase();

  // 1. DORMANT — no activity for 60+ days AND outstanding balance
  if (recency >= T.dormant.recency_days_min && due > 0) {
    return 'DORMANT';
  }

  // 2. NEW_CUSTOMER — too few transactions to make a reliable assessment
  if (depth <= T.new_customer.transaction_depth_max) {
    return 'NEW_CUSTOMER';
  }

  // 3. AT_RISK — large debt + high delays + very low consistency
  if (
    due   >= T.at_risk.due_amount_min_bdt &&
    delay >= T.at_risk.avg_delay_days_min &&
    consistency <= T.at_risk.payment_consistency_max
  ) {
    return 'AT_RISK';
  }

  // 4. RECOVERING — was bad, showing genuine improvement
  if (
    T.recovering.eligible_previous_states.includes(prev) &&
    recency <= T.recovering.recency_days_max &&
    delay < T.at_risk.avg_delay_days_min &&
    consistency > T.at_risk.payment_consistency_max
  ) {
    return 'RECOVERING';
  }

  // 5. STRAINED — elevated debt OR elevated delays AND weak consistency
  if (
    (due >= T.strained.due_amount_min_bdt || delay >= T.strained.avg_delay_days_min) &&
    consistency <= T.strained.payment_consistency_max
  ) {
    return 'STRAINED';
  }

  // 6. CHAMPION — best of the best
  if (
    consistency >= T.champion.payment_consistency_min &&
    due <= T.champion.due_amount_max_bdt &&
    depth >= T.champion.transaction_depth_min
  ) {
    return 'CHAMPION';
  }

  // 7. RELIABLE — good behavior, manageable balance
  if (
    consistency >= T.reliable.payment_consistency_min &&
    due <= T.reliable.due_amount_max_bdt &&
    delay <= T.reliable.avg_delay_days_max
  ) {
    return 'RELIABLE';
  }

  // 8. SLOW_PAYER — some delay, otherwise okay
  if (delay >= T.slow_payer.avg_delay_days_min) {
    return 'SLOW_PAYER';
  }

  // Fallback
  return CUSTOMER_MARKOV_STATES_CONFIG.fallback_state;
}

// ─── Snapshot row builder (feeds customerMarkovService) ──────────────────────

/**
 * Build a time-series of state snapshots for a single customer from their
 * raw transaction history.  Creates one snapshot per calendar week that had
 * any activity, plus the current week.
 *
 * @param {string}   customerId
 * @param {object[]} transactions — [{ type:'credit'|'payment', amount_bdt, date, delay_days, is_late }]
 * @param {string}   [asOf]       — ISO date (defaults to now)
 * @returns {{ customer_id, timestamp, current_state, features }[]}
 */
function buildCustomerSnapshotRows(customerId, transactions = [], asOf = null) {
  const anchorDate = asOf ? new Date(asOf) : new Date();
  const custId     = String(customerId || '').trim();

  if (!custId || !Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  // Sort chronologically
  const sorted = transactions
    .filter((t) => t && t.date)
    .map((t) => ({ ...t, _date: new Date(t.date) }))
    .filter((t) => Number.isFinite(t._date.getTime()))
    .sort((a, b) => a._date - b._date);

  if (sorted.length === 0) return [];

  // Build weekly buckets
  const buckets = new Map(); // weekKey → { credits[], payments[], lastDate }
  for (const tx of sorted) {
    const weekStart = getWeekStart(tx._date);
    const key = weekStart.toISOString();
    if (!buckets.has(key)) buckets.set(key, { weekStart, credits: [], payments: [], lastDate: tx._date });
    const b = buckets.get(key);
    if (tx._date > b.lastDate) b.lastDate = tx._date;
    if (tx.type === 'credit')  b.credits.push(tx);
    else                       b.payments.push(tx);
  }

  const weekKeys = [...buckets.keys()].sort();
  const rows = [];
  let rollingDue = 0;
  let rollingTransactions = [];
  let prevState = null;

  for (const key of weekKeys) {
    const bucket = buckets.get(key);

    // Accumulate transactions up to end of this week
    for (const tx of bucket.credits) {
      rollingDue += toNum(tx.amount_bdt, 0);
      rollingTransactions.push({
        amount: toNum(tx.amount_bdt, 0),
        delay_days: 0,
        is_late: false,
      });
    }
    for (const tx of bucket.payments) {
      rollingDue = Math.max(0, rollingDue - toNum(tx.amount_bdt, 0));
      rollingTransactions.push({
        amount:     toNum(tx.amount_bdt, 0),
        delay_days: toNum(tx.delay_days, 0),
        is_late:    tx.is_late === true || toNum(tx.delay_days, 0) > 0,
      });
    }

    const features = deriveCustomerFeatures({
      payment_records:    rollingTransactions,
      due_amount_bdt:     rollingDue,
      last_activity_date: bucket.lastDate.toISOString(),
      as_of:              addDays(bucket.weekStart, 6).toISOString(),
    });

    const state = assignCustomerState(features, prevState);
    prevState = state;

    rows.push({
      customer_id:   custId,
      timestamp:     addDays(bucket.weekStart, 6).toISOString(),
      current_state: state,
      features,
    });
  }

  // Add a "current" snapshot if the last week is > 7 days ago
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const daysSince = Math.floor((anchorDate - new Date(lastRow.timestamp)) / 86400000);
    if (daysSince > 7) {
      const currentFeatures = deriveCustomerFeatures({
        payment_records:    rollingTransactions,
        due_amount_bdt:     rollingDue,
        last_activity_date: lastRow.timestamp,
        as_of:              anchorDate.toISOString(),
      });
      const currentState = assignCustomerState(currentFeatures, prevState);
      rows.push({
        customer_id:   custId,
        timestamp:     anchorDate.toISOString(),
        current_state: currentState,
        features:      currentFeatures,
      });
    }
  }

  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

/**
 * Normalise a state token against the known keys, returning the fallback
 * if not found.
 */
function normalizeStateKey(value, fallback = CUSTOMER_MARKOV_STATES_CONFIG.fallback_state) {
  const k = String(value || '').trim().toUpperCase();
  return CUSTOMER_STATE_KEYS.includes(k) ? k : fallback;
}

module.exports = {
  deriveCustomerFeatures,
  assignCustomerState,
  buildCustomerSnapshotRows,
  normalizeStateKey,
};
