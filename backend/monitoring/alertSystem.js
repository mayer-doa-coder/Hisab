const DEFAULT_ALERT_THRESHOLDS = Object.freeze({
  fallback_rate_alert: 0.2,
  confidence_drift_abs_alert: 0.12,
  acceptance_rate_min: 0.35,
  stockout_rate_critical: 0.08,
  error_rate_critical: 0.05,
  drift_alert_required: true,
  stability_alert_required: true,
  unstable_outputs_alert: true,
});

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeThresholds = (overrides = null) => {
  return {
    ...DEFAULT_ALERT_THRESHOLDS,
    ...(overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}),
  };
};

const pushAlert = (list, {
  code,
  severity,
  message,
  value = null,
  threshold = null,
} = {}) => {
  list.push({
    code: String(code || 'unknown_alert').trim().toLowerCase(),
    severity: String(severity || 'warning').trim().toLowerCase(),
    message: String(message || '').trim(),
    value: value === null ? null : Number(value),
    threshold: threshold === null ? null : Number(threshold),
  });
};

const evaluateAlertThresholds = ({
  metrics = {},
  driftReport = null,
  stabilityReport = null,
  thresholds = null,
} = {}) => {
  const config = normalizeThresholds(thresholds);
  const alerts = [];

  const fallbackRate = toNumber(metrics?.fallback_rate, 0);
  if (fallbackRate > toNumber(config.fallback_rate_alert, 0.2)) {
    pushAlert(alerts, {
      code: 'fallback_rate_high',
      severity: fallbackRate > (toNumber(config.fallback_rate_alert, 0.2) * 1.5) ? 'critical' : 'warning',
      message: 'Fallback rate exceeded threshold.',
      value: Number(fallbackRate.toFixed(6)),
      threshold: toNumber(config.fallback_rate_alert, 0.2),
    });
  }

  const confidenceDriftAbs = toNumber(metrics?.confidence?.absolute_drift, 0);
  if (confidenceDriftAbs > toNumber(config.confidence_drift_abs_alert, 0.12)) {
    pushAlert(alerts, {
      code: 'confidence_drift_high',
      severity: 'warning',
      message: 'Confidence drift exceeds threshold.',
      value: Number(confidenceDriftAbs.toFixed(6)),
      threshold: toNumber(config.confidence_drift_abs_alert, 0.12),
    });
  }

  const acceptanceRate = toNumber(metrics?.suggestion_acceptance_rate, 0);
  if (acceptanceRate < toNumber(config.acceptance_rate_min, 0.35)) {
    pushAlert(alerts, {
      code: 'acceptance_rate_low',
      severity: 'warning',
      message: 'Suggestion acceptance rate dropped below threshold.',
      value: Number(acceptanceRate.toFixed(6)),
      threshold: toNumber(config.acceptance_rate_min, 0.35),
    });
  }

  const stockoutRate = toNumber(metrics?.stockout_incident_rate, 0);
  if (stockoutRate > toNumber(config.stockout_rate_critical, 0.08)) {
    pushAlert(alerts, {
      code: 'stockout_rate_high',
      severity: 'critical',
      message: 'Stockout incident rate exceeded critical threshold.',
      value: Number(stockoutRate.toFixed(6)),
      threshold: toNumber(config.stockout_rate_critical, 0.08),
    });
  }

  const errorRate = toNumber(metrics?.error_rate, 0);
  if (errorRate > toNumber(config.error_rate_critical, 0.05)) {
    pushAlert(alerts, {
      code: 'error_rate_high',
      severity: 'critical',
      message: 'Service error rate exceeded critical threshold.',
      value: Number(errorRate.toFixed(6)),
      threshold: toNumber(config.error_rate_critical, 0.05),
    });
  }

  if (Boolean(config.drift_alert_required) && Boolean(driftReport?.alert)) {
    pushAlert(alerts, {
      code: 'drift_detected',
      severity: 'warning',
      message: 'Drift detector reported an alert.',
      value: 1,
      threshold: 1,
    });
  }

  if (Boolean(config.stability_alert_required) && Boolean(stabilityReport?.unstable)) {
    pushAlert(alerts, {
      code: 'stability_unstable',
      severity: 'critical',
      message: 'Transition stability checker reported instability.',
      value: 1,
      threshold: 1,
    });
  }

  const unstableOutputs = Boolean(metrics?.unstable_outputs);
  if (Boolean(config.unstable_outputs_alert) && unstableOutputs) {
    pushAlert(alerts, {
      code: 'unstable_outputs',
      severity: 'critical',
      message: 'Unstable outputs detected in recent ensemble decisions.',
      value: 1,
      threshold: 1,
    });
  }

  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;
  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;

  return {
    alert_version: 'phase9_alert_system_v1',
    generated_at: new Date().toISOString(),
    thresholds: config,
    alerts,
    warning_count: warningCount,
    critical_count: criticalCount,
    rollback_required: criticalCount > 0,
    status: criticalCount > 0 ? 'CRITICAL' : warningCount > 0 ? 'WARNING' : 'HEALTHY',
  };
};

module.exports = {
  DEFAULT_ALERT_THRESHOLDS,
  normalizeThresholds,
  evaluateAlertThresholds,
};
