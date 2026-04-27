'use strict';

// Customer Markov Chain service.
// Builds transition matrices from customer payment history and produces
// next-state distributions with optional Bangladesh seasonal adjustment.
//
// Re-uses the existing predictor.js / transitionBuilder.js infrastructure
// but operates on CUSTOMER_MARKOV_STATES rather than financial market states.

const {
  CUSTOMER_STATE_KEYS,
  CUSTOMER_DOMAIN_PRIOR,
  CUSTOMER_MARKOV_STATES_CONFIG,
  getCustomerStateLabel,
} = require('../config/customerMarkovStates');

const {
  buildTransitionMatrix,
  applyLaplaceSmoothing,
  normalizeCounts,
  initCountMatrix,
} = require('./markov/transitionBuilder');  // reuse existing

const {
  predictNextStateDist,
  predictStateDistKSteps,
  predictMostLikelyState,
  computeNextStateAccuracy,
  computeCalibrationStats,
} = require('./markov/predictor');  // reuse existing

const {
  buildCustomerSnapshotRows,
  assignCustomerState,
  deriveCustomerFeatures,
  normalizeStateKey,
} = require('./prediction/customerStateEngine');

const {
  applySeasonalAdjustment,
  getSeasonalPeriod,
  getSeasonalMultipliers,
} = require('./seasonal/bangladeshSeasons');

const FALLBACK = CUSTOMER_MARKOV_STATES_CONFIG.fallback_state;
const STATES   = [...CUSTOMER_STATE_KEYS];

// ─── Sequence builder (no dependency on financial stateEncoder) ───────────────

/**
 * Convert an array of pre-computed customer snapshot rows into the
 * sequence format expected by transitionBuilder.buildTransitionMatrix.
 *
 * @param {object[]} snapshots  — [{ customer_id, timestamp, current_state }]
 * @param {number}   maxGapDays — break sequence on gaps larger than this
 * @returns {object[]} sequences — [{ entity_id, points: [{ t, state, break_before }] }]
 */
function buildCustomerSequences(snapshots = [], maxGapDays = 45) {
  const grouped = new Map();
  const maxGapMs = maxGapDays * 86400000;

  for (const snap of snapshots) {
    const id = String(snap.customer_id || snap.entity_id || '').trim().toUpperCase();
    const ts = new Date(snap.timestamp);
    if (!id || !Number.isFinite(ts.getTime())) continue;

    const state = normalizeStateKey(snap.current_state || snap.state, FALLBACK);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push({ ts, state });
  }

  const sequences = [];

  for (const [entityId, entries] of grouped) {
    entries.sort((a, b) => a.ts - b.ts);

    const points = entries.map((entry, i) => ({
      t:            entry.ts.toISOString(),
      state:        entry.state,
      break_before: i > 0 && (entry.ts - entries[i - 1].ts) > maxGapMs,
    }));

    if (points.length > 0) {
      sequences.push({ entity_id: entityId, points });
    }
  }

  return sequences;
}

// ─── Model builder ────────────────────────────────────────────────────────────

/**
 * Build a customer Markov model from snapshot rows.
 *
 * Snapshots come from either:
 *   (a) pre-computed rows: [{ customer_id, timestamp, current_state }]
 *   (b) raw transaction arrays via customerTransactionsToSnapshots()
 *
 * @param {object} params
 * @param {object[]} params.snapshots          — customer state snapshots
 * @param {number}   [params.smoothingAlpha]   — Laplace smoothing (default 0.5)
 * @param {number}   [params.maxGapDays]       — sequence gap threshold (default 45)
 * @param {boolean}  [params.useDomainPrior]   — seed counts with domain prior (default true)
 * @returns {object} model
 */
function buildCustomerModel({
  snapshots = [],
  smoothingAlpha = 0.5,
  maxGapDays = 45,
  useDomainPrior = true,
} = {}) {
  const sequences = buildCustomerSequences(snapshots, maxGapDays);

  // If useDomainPrior, seed the global counts with the domain-knowledge prior
  // so the model degrades gracefully when historical data is sparse.
  let initialCounts = null;
  if (useDomainPrior) {
    initialCounts = {};
    for (const from of STATES) {
      initialCounts[from] = {};
      for (const to of STATES) {
        initialCounts[from][to] = Number(CUSTOMER_DOMAIN_PRIOR[from]?.[to] || 0);
      }
    }
  }

  // Count observed transitions
  const transitions = buildTransitionMatrix({
    sequences,
    states: STATES,
    smoothingAlpha: 0, // we apply smoothing manually below
    useRegimes: false, // no regime differentiation in customer model
  });

  // Merge observed counts into the domain prior
  const mergedCounts = initialCounts || initCountMatrix(STATES);
  for (const from of STATES) {
    for (const to of STATES) {
      mergedCounts[from][to] += Number(transitions.counts.global_counts?.[from]?.[to] || 0);
    }
  }

  // Apply Laplace smoothing, then normalise
  const smoothed   = applyLaplaceSmoothing({ counts: mergedCounts, states: STATES, alpha: smoothingAlpha });
  const normalized = normalizeCounts({ counts: smoothed, states: STATES });

  const totalObservedTransitions = transitions.counts.metadata.transition_count;

  return {
    version:          'customer_markov_model_v1',
    states:           STATES,
    fallback_state:   FALLBACK,
    global_matrix:    normalized.matrix,
    counts:           mergedCounts,
    metadata: {
      snapshot_count:             snapshots.length,
      entity_count:               sequences.length,
      observed_transitions:       totalObservedTransitions,
      uses_domain_prior:          useDomainPrior,
      smoothing_alpha:            smoothingAlpha,
    },
    _sequences: sequences,
  };
}

// ─── Prediction ───────────────────────────────────────────────────────────────

/**
 * Predict the next state distribution for a customer.
 *
 * @param {object}        params
 * @param {object}        params.model         — built by buildCustomerModel()
 * @param {string}        params.currentState  — customer's current Markov state
 * @param {number}        [params.steps]       — forecast horizon in weeks (default 1)
 * @param {Date|string}   [params.asOf]        — date for seasonal adjustment (default now)
 * @param {boolean}       [params.useSeasonal] — apply Bangladesh seasonal adjustment (default true)
 * @returns {object}
 */
function predictCustomerState({
  model,
  currentState,
  steps = 1,
  asOf = null,
  useSeasonal = true,
} = {}) {
  if (!model || !model.global_matrix) {
    throw new Error('Customer Markov model is required for prediction.');
  }

  const safeState = normalizeStateKey(currentState, FALLBACK);
  const safeSteps = Math.max(1, Math.trunc(Number(steps) || 1));
  const date      = asOf ? new Date(asOf) : new Date();

  const baseDistribution = safeSteps === 1
    ? predictNextStateDist({ currentState: safeState, matrix: model.global_matrix, states: STATES })
    : predictStateDistKSteps({ currentState: safeState, matrix: model.global_matrix, states: STATES, steps: safeSteps });

  const seasonal = useSeasonal
    ? applySeasonalAdjustment(baseDistribution, date, STATES)
    : { distribution: baseDistribution, season: 'NORMAL', adjustment_applied: false };

  const distribution = seasonal.distribution;
  const mostLikely   = predictMostLikelyState(distribution);

  // Annotate distribution with human labels
  const labeledDistribution = {};
  for (const s of STATES) {
    labeledDistribution[s] = {
      probability: Number((distribution[s] || 0).toFixed(6)),
      label:       getCustomerStateLabel(s, 'en'),
      label_bn:    getCustomerStateLabel(s, 'bn'),
    };
  }

  return {
    current_state:             safeState,
    current_state_label:       getCustomerStateLabel(safeState, 'en'),
    current_state_label_bn:    getCustomerStateLabel(safeState, 'bn'),
    most_likely_next_state:    mostLikely,
    most_likely_label:         getCustomerStateLabel(mostLikely, 'en'),
    most_likely_label_bn:      getCustomerStateLabel(mostLikely, 'bn'),
    next_state_distribution:   distribution,
    labeled_distribution:      labeledDistribution,
    forecast_weeks:            safeSteps,
    seasonal_adjustment: {
      applied:   seasonal.adjustment_applied,
      season:    seasonal.season,
      label_bn:  seasonal.label_bn || null,
    },
  };
}

// ─── Batch prediction ─────────────────────────────────────────────────────────

/**
 * Predict next states for multiple customers in one call.
 *
 * @param {object}   model
 * @param {object[]} customers  — [{ id, current_state }]
 * @param {object}   options    — { steps, asOf, useSeasonal }
 * @returns {object[]}
 */
function batchPredictCustomers(model, customers = [], options = {}) {
  const { steps = 1, asOf = null, useSeasonal = true } = options;

  return customers.map((c) => {
    try {
      const prediction = predictCustomerState({
        model,
        currentState: c.current_state || c.state || FALLBACK,
        steps,
        asOf,
        useSeasonal,
      });
      return { id: c.id || c.customer_id, ...prediction, error: null };
    } catch (err) {
      return {
        id:            c.id || c.customer_id,
        current_state: c.current_state || FALLBACK,
        error:         err.message || 'prediction_failed',
      };
    }
  });
}

// ─── Convenience: build from raw transactions ────────────────────────────────

/**
 * Build snapshot rows from raw transaction arrays and then build the model.
 *
 * @param {object[]} customerTransactionSets
 *   [{ customer_id, transactions: [{ type, amount_bdt, date, delay_days, is_late }] }]
 * @param {object} options — passed to buildCustomerModel
 * @returns {object} model
 */
function buildCustomerModelFromTransactions(customerTransactionSets = [], options = {}) {
  const snapshots = [];

  for (const { customer_id, transactions } of customerTransactionSets) {
    const rows = buildCustomerSnapshotRows(customer_id, transactions, options.asOf);
    snapshots.push(...rows);
  }

  return buildCustomerModel({ ...options, snapshots });
}

// ─── Model evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate predictive accuracy and calibration on the model's own sequences.
 */
function evaluateCustomerModel(model) {
  const sequences = model?._sequences || [];
  if (sequences.length === 0) {
    return { accuracy: null, brier: null, ece: null, transitions: 0 };
  }

  const matrixResolver = () => model.global_matrix;

  const accuracy = computeNextStateAccuracy({ sequences, states: STATES, matrixResolver });
  const calibration = computeCalibrationStats({ sequences, states: STATES, matrixResolver });

  return {
    accuracy:     accuracy.accuracy,
    correct:      accuracy.correct,
    total:        accuracy.total,
    brier:        calibration.brier,
    ece:          calibration.ece,
    samples:      calibration.samples,
    transitions:  accuracy.total,
  };
}

module.exports = {
  buildCustomerModel,
  buildCustomerModelFromTransactions,
  buildCustomerSequences,
  predictCustomerState,
  batchPredictCustomers,
  evaluateCustomerModel,
};
