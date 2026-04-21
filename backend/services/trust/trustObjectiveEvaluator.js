const {
  normalizeTrustHorizon,
  getTrustHorizonDefinition,
} = require('../../config/trustObjective');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toDateMs = (value) => {
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const sumAmounts = (rows = []) => rows.reduce((sum, row) => sum + toNumber(row?.amount, 0), 0);

const inWindow = (rows = [], days = 30) => {
  const now = Date.now();
  const windowStart = now - (Math.max(1, days) * 24 * 60 * 60 * 1000);

  return rows.filter((row) => {
    const ts = toDateMs(row?.occurred_at || row?.occurredAt);
    return ts !== null && ts >= windowStart;
  });
};

const determineReturnBucket = (riskScore, thresholds = {}) => {
  const score = clamp(Math.round(toNumber(riskScore, 0)), 0, 100);

  for (const [bucketKey, range] of Object.entries(thresholds)) {
    const min = toNumber(range?.min_risk_score, 0);
    const max = toNumber(range?.max_risk_score, 100);
    if (score >= min && score <= max) {
      return bucketKey;
    }
  }

  return score >= 70 ? 'HIGH_RISK' : score >= 40 ? 'MEDIUM_RISK' : 'LOW_RISK';
};

const evaluateDirectionClass = ({ signals, labelRules }) => {
  const improving = labelRules?.improvement || {};
  const deterioration = labelRules?.deterioration || {};

  const improvingHit =
    signals.payment_event_count >= toNumber(improving.minimum_payment_events, 0)
    && signals.on_time_ratio >= toNumber(improving.on_time_ratio_min, 0)
    && signals.late_payment_rate <= toNumber(improving.late_payment_rate_max, 1)
    && signals.payment_coverage_ratio >= toNumber(improving.payment_coverage_ratio_min, 0)
    && signals.due_change_ratio <= toNumber(improving.due_change_ratio_max, 0);

  if (improvingHit) {
    return 'IMPROVING';
  }

  const deteriorationHit =
    signals.payment_event_count >= toNumber(deterioration.minimum_payment_events, 0)
    && (
      signals.on_time_ratio <= toNumber(deterioration.on_time_ratio_max, 1)
      || signals.late_payment_rate >= toNumber(deterioration.late_payment_rate_min, 1)
      || signals.payment_coverage_ratio <= toNumber(deterioration.payment_coverage_ratio_max, 0)
      || signals.due_change_ratio >= toNumber(deterioration.due_change_ratio_min, 1)
    );

  if (deteriorationHit) {
    return 'WORSENING';
  }

  return 'STABLE';
};

const evaluateDefaultRisk = ({ signals, riskScore, labelRules }) => {
  const defaultRisk = labelRules?.default_risk || {};

  return {
    is_default_risk:
      riskScore >= toNumber(defaultRisk.risk_score_min, 100)
      || signals.late_payment_rate >= toNumber(defaultRisk.late_payment_rate_min, 1)
      || signals.current_due_amount >= toNumber(defaultRisk.absolute_due_min, Number.MAX_SAFE_INTEGER),
    thresholds: {
      risk_score_min: toNumber(defaultRisk.risk_score_min, 100),
      late_payment_rate_min: toNumber(defaultRisk.late_payment_rate_min, 1),
      absolute_due_min: toNumber(defaultRisk.absolute_due_min, Number.MAX_SAFE_INTEGER),
    },
  };
};

const buildSignals = ({ customerData = {}, features = {}, horizonDays = 30 }) => {
  const paymentsAll = Array.isArray(customerData.payment_records) ? customerData.payment_records : [];
  const ledgerAll = Array.isArray(customerData.ledger_entries) ? customerData.ledger_entries : [];

  const paymentsWindow = inWindow(paymentsAll, horizonDays);
  const ledgerWindow = inWindow(ledgerAll, horizonDays);
  const windowCredits = ledgerWindow.filter((row) => String(row?.type || '').toLowerCase() === 'credit');

  const paymentAmountWindow = sumAmounts(paymentsWindow);
  const creditAmountWindow = sumAmounts(windowCredits);
  const paymentCoverage = creditAmountWindow > 0
    ? paymentAmountWindow / creditAmountWindow
    : paymentAmountWindow > 0
      ? 1
      : 0;

  const currentDue = toNumber(features.due_amount ?? customerData.due_amount, 0);
  const paymentFlowInWindow = paymentAmountWindow;
  const creditFlowInWindow = creditAmountWindow;
  const windowNetDueChange = creditFlowInWindow - paymentFlowInWindow;
  const dueChangeRatio = currentDue > 0
    ? windowNetDueChange / currentDue
    : windowNetDueChange > 0
      ? 1
      : 0;

  const paymentCount = Math.max(1, Math.trunc(toNumber(features.payment_count, paymentsWindow.length || 0)));
  const lateCount = Math.max(0, Math.trunc(toNumber(features.late_payment_count, 0)));

  return {
    on_time_ratio: clamp(toNumber(features.on_time_ratio, 0.5), 0, 1),
    late_payment_rate: clamp(lateCount / paymentCount, 0, 1),
    payment_coverage_ratio: clamp(paymentCoverage, 0, 2),
    due_change_ratio: dueChangeRatio,
    current_due_amount: currentDue,
    payment_event_count: paymentsWindow.length,
    credit_event_count: windowCredits.length,
  };
};

const evaluateHorizonTargets = ({
  horizon,
  customerData = {},
  features = {},
  riskScore,
} = {}) => {
  const normalizedHorizon = normalizeTrustHorizon(horizon);
  const objective = getTrustHorizonDefinition(normalizedHorizon);

  if (!normalizedHorizon || !objective) {
    return null;
  }

  const horizonDays = toNumber(objective.time_window_days, 30);
  const signals = buildSignals({ customerData, features, horizonDays });

  const directionClass = evaluateDirectionClass({
    signals,
    labelRules: objective.label_definitions,
  });

  const returnBucket = determineReturnBucket(
    riskScore,
    objective?.target_types?.return_bucket_thresholds || {}
  );

  const riskProbability = clamp(toNumber(riskScore, 0) / 100, 0, 1);
  const halfWidth = clamp(
    toNumber(objective?.target_types?.expected_return_interval?.interval_half_width, 0.1),
    0,
    0.5
  );

  const defaultRisk = evaluateDefaultRisk({
    signals,
    riskScore: toNumber(riskScore, 0),
    labelRules: objective.label_definitions,
  });

  return {
    horizon: normalizedHorizon,
    time_window_days: horizonDays,
    direction_class: directionClass,
    return_bucket: returnBucket,
    expected_return_interval: {
      type: 'risk_probability_range',
      range: [
        Number(clamp(riskProbability - halfWidth, 0, 1).toFixed(4)),
        Number(clamp(riskProbability + halfWidth, 0, 1).toFixed(4)),
      ],
    },
    default_risk: defaultRisk,
    evaluation_signals: {
      on_time_ratio: Number(signals.on_time_ratio.toFixed(4)),
      late_payment_rate: Number(signals.late_payment_rate.toFixed(4)),
      payment_coverage_ratio: Number(signals.payment_coverage_ratio.toFixed(4)),
      due_change_ratio: Number(signals.due_change_ratio.toFixed(4)),
      current_due_amount: Number(signals.current_due_amount.toFixed(2)),
      payment_event_count: signals.payment_event_count,
      credit_event_count: signals.credit_event_count,
    },
    metrics_thresholds: objective.metrics_thresholds,
  };
};

module.exports = {
  evaluateHorizonTargets,
};
