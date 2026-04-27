'use strict';

const { success } = require('../../utils/apiResponse');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const {
  buildCustomerModel,
  buildCustomerModelFromTransactions,
  predictCustomerState,
  batchPredictCustomers,
  evaluateCustomerModel,
} = require('../../services/customerMarkovService');
const {
  assignCustomerState,
  deriveCustomerFeatures,
} = require('../../services/prediction/customerStateEngine');
const {
  getSeasonalPeriod,
  getSeasonalMultipliers,
  SEASON_LABELS,
} = require('../../services/seasonal/bangladeshSeasons');
const {
  CUSTOMER_STATE_KEYS,
  getCustomerStateLabel,
} = require('../../config/customerMarkovStates');

// ─── Validation helpers ───────────────────────────────────────────────────────

const toDateOrNow = (value) => {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
};

const toPositiveInt = (value, fallback) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const rejectBadRequest = (res, message) =>
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });

// ─── POST /customer-markov/build ──────────────────────────────────────────────

/**
 * Build a customer Markov model from provided snapshot data.
 *
 * Body:
 *   snapshots?:           [{ customer_id, timestamp, current_state }]
 *   customer_transactions?: [{ customer_id, transactions: [...] }]
 *   smoothing_alpha?:     number  (default 0.5)
 *   max_gap_days?:        number  (default 45)
 *   use_domain_prior?:    boolean (default true)
 *   evaluate?:            boolean (default true)
 */
const postBuildCustomerModel = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const snapshots            = Array.isArray(body.snapshots)             ? body.snapshots : null;
  const customerTransactions = Array.isArray(body.customer_transactions) ? body.customer_transactions : null;

  if (!snapshots && !customerTransactions) {
    return rejectBadRequest(res, 'Provide either snapshots[] or customer_transactions[].');
  }

  const smoothingAlpha  = Math.max(0, Number(body.smoothing_alpha ?? 0.5));
  const maxGapDays      = toPositiveInt(body.max_gap_days, 45);
  const useDomainPrior  = body.use_domain_prior !== false;
  const runEval         = body.evaluate !== false;

  const model = snapshots
    ? buildCustomerModel({ snapshots, smoothingAlpha, maxGapDays, useDomainPrior })
    : buildCustomerModelFromTransactions(customerTransactions, { smoothingAlpha, maxGapDays, useDomainPrior });

  const evaluation = runEval ? evaluateCustomerModel(model) : null;

  // Strip internal sequences from response for brevity
  const { _sequences, ...publicModel } = model;

  return success(req, res, {
    model:      publicModel,
    evaluation,
    states:     CUSTOMER_STATE_KEYS,
  });
});

// ─── POST /customer-markov/predict ────────────────────────────────────────────

/**
 * Predict next state for a single customer.
 *
 * Body:
 *   model:         object   — output of /build (required)
 *   current_state: string   — current Markov state (required)
 *   steps?:        number   — forecast weeks (default 1, max 52)
 *   as_of?:        ISO date — date for seasonal factor (default now)
 *   use_seasonal?: boolean  — apply seasonal adjustment (default true)
 *
 * Alternatively, provide customer snapshot data:
 *   snapshot?: { payment_records, due_amount_bdt, transaction_count, last_activity_date }
 *   Then current_state is derived automatically.
 */
const postPredictCustomerState = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (!body.model && !body.current_state) {
    return rejectBadRequest(res, 'Provide model + current_state, or model + snapshot.');
  }

  if (!body.model || typeof body.model !== 'object') {
    return rejectBadRequest(res, 'model is required.');
  }

  const asOf       = toDateOrNow(body.as_of);
  const steps      = Math.min(52, toPositiveInt(body.steps, 1));
  const useSeasonal = body.use_seasonal !== false;

  // Derive current_state from snapshot if not provided explicitly
  let currentState = String(body.current_state || '').trim().toUpperCase();
  if (!currentState && body.snapshot && typeof body.snapshot === 'object') {
    const features = deriveCustomerFeatures({
      ...body.snapshot,
      as_of: asOf.toISOString(),
    });
    currentState = assignCustomerState(features, body.previous_state || null);
  }

  if (!CUSTOMER_STATE_KEYS.includes(currentState)) {
    return rejectBadRequest(res,
      `current_state must be one of: ${CUSTOMER_STATE_KEYS.join(', ')}`);
  }

  const prediction = predictCustomerState({
    model:    body.model,
    currentState,
    steps,
    asOf,
    useSeasonal,
  });

  return success(req, res, prediction);
});

// ─── POST /customer-markov/batch-predict ──────────────────────────────────────

/**
 * Predict next states for a list of customers in one call.
 *
 * Body:
 *   model:     object
 *   customers: [{ id, current_state }]
 *   steps?:    number
 *   as_of?:    ISO date
 *   use_seasonal?: boolean
 */
const postBatchPredictCustomers = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (!body.model || typeof body.model !== 'object') {
    return rejectBadRequest(res, 'model is required.');
  }

  const customers = Array.isArray(body.customers) ? body.customers : [];
  if (customers.length === 0) {
    return rejectBadRequest(res, 'customers[] must be a non-empty array.');
  }
  if (customers.length > 500) {
    return rejectBadRequest(res, 'Maximum 500 customers per batch request.');
  }

  const steps      = Math.min(52, toPositiveInt(body.steps, 1));
  const asOf       = toDateOrNow(body.as_of);
  const useSeasonal = body.use_seasonal !== false;

  const predictions = batchPredictCustomers(body.model, customers, { steps, asOf, useSeasonal });

  const failed = predictions.filter((p) => p.error).length;

  return success(req, res, {
    predictions,
    total:   predictions.length,
    failed,
    successful: predictions.length - failed,
    steps,
    as_of: asOf.toISOString(),
    seasonal_applied: useSeasonal,
  });
});

// ─── GET /customer-markov/seasonal ────────────────────────────────────────────

/**
 * Return the seasonal period and adjustment multipliers for a given date.
 *
 * Query params:
 *   as_of? — ISO date (default now)
 *   lang?  — 'en' | 'bn' (default 'en')
 */
const getCustomerSeasonalFactor = asyncHandler(async (req, res) => {
  const asOf = toDateOrNow(req.query?.as_of);
  const lang = String(req.query?.lang || 'en').toLowerCase() === 'bn' ? 'bn' : 'en';

  const period      = getSeasonalPeriod(asOf);
  const multipliers = getSeasonalMultipliers(asOf);

  const annotatedMultipliers = multipliers
    ? CUSTOMER_STATE_KEYS.reduce((acc, s) => {
        acc[s] = {
          multiplier: Number((multipliers[s] || 1.0).toFixed(4)),
          label:      getCustomerStateLabel(s, lang),
        };
        return acc;
      }, {})
    : null;

  return success(req, res, {
    as_of:            asOf.toISOString(),
    season:           period.season,
    season_label_bn:  period.label_bn,
    period_start:     period.start,
    period_end:       period.end,
    adjustment_active: multipliers !== null,
    state_multipliers: annotatedMultipliers,
  });
});

// ─── POST /customer-markov/classify ──────────────────────────────────────────

/**
 * Classify a customer into a Markov state from raw behavioral data.
 * Useful for one-off classification without building a full model.
 *
 * Body: customer snapshot (payment_records, due_amount_bdt, etc.)
 */
const postClassifyCustomer = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const features = deriveCustomerFeatures({
    payment_records:    Array.isArray(body.payment_records) ? body.payment_records : [],
    transaction_count:  toPositiveInt(body.transaction_count, 0),
    due_amount_bdt:     Number(body.due_amount_bdt || 0),
    last_activity_date: body.last_activity_date || null,
    as_of:              body.as_of || new Date().toISOString(),
  });

  const prevState  = String(body.previous_state || '').trim().toUpperCase() || null;
  const state      = assignCustomerState(features, prevState);
  const seasonInfo = getSeasonalPeriod(toDateOrNow(body.as_of));

  return success(req, res, {
    state,
    label:       getCustomerStateLabel(state, 'en'),
    label_bn:    getCustomerStateLabel(state, 'bn'),
    features,
    season:      seasonInfo.season,
    season_label_bn: seasonInfo.label_bn,
  });
});

module.exports = {
  postBuildCustomerModel,
  postPredictCustomerState,
  postBatchPredictCustomers,
  getCustomerSeasonalFactor,
  postClassifyCustomer,
};
