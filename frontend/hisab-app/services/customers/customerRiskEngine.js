export const CUSTOMER_RISK_LEVELS = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
};

export const RISK_MODEL_TYPES = {
  RULE_BASED: 'rule-based',
};

const toNonNegative = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric;
};

const roundToTwo = (value) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
};

const classifyByRules = (metrics) => {
  const totalDue = toNonNegative(metrics.total_due);
  const numberOfTransactions = Math.trunc(toNonNegative(metrics.number_of_transactions));
  const numberOfLatePayments = Math.trunc(toNonNegative(metrics.number_of_late_payments));
  const averagePaymentDelayRaw = Number(metrics.average_payment_delay);
  const averagePaymentDelay = Number.isFinite(averagePaymentDelayRaw) ? Math.max(0, averagePaymentDelayRaw) : null;

  const reasons = [];
  let score = 20;

  if (totalDue >= 5000) {
    score += 50;
    reasons.push('High outstanding due amount.');
  } else if (totalDue >= 2000) {
    score += 30;
    reasons.push('Moderate outstanding due amount.');
  } else if (totalDue > 0) {
    score += 10;
    reasons.push('Some due amount exists.');
  }

  if (numberOfLatePayments >= 3) {
    score += 35;
    reasons.push('Frequent late payments detected.');
  } else if (numberOfLatePayments >= 1) {
    score += 15;
    reasons.push('At least one late payment detected.');
  }

  if (averagePaymentDelay !== null && averagePaymentDelay >= 20) {
    score += 25;
    reasons.push('Average payment delay is high.');
  } else if (averagePaymentDelay !== null && averagePaymentDelay >= 10) {
    score += 10;
    reasons.push('Average payment delay is moderate.');
  }

  if (numberOfTransactions <= 1 && totalDue > 0) {
    score += 10;
    reasons.push('Very limited repayment history.');
  } else if (numberOfTransactions >= 10 && totalDue === 0) {
    score -= 10;
    reasons.push('Strong transaction history with no due.');
  }

  score = Math.max(0, Math.min(100, Math.trunc(score)));
  const trustScore = 100 - score;

  let riskLevel = CUSTOMER_RISK_LEVELS.LOW;
  if (score >= 70) {
    riskLevel = CUSTOMER_RISK_LEVELS.HIGH;
  } else if (score >= 40) {
    riskLevel = CUSTOMER_RISK_LEVELS.MEDIUM;
  }

  if (!reasons.length) {
    reasons.push('Healthy repayment pattern.');
  }

  return {
    riskLevel,
    riskScore: score,
    trustScore,
    reasons,
    metrics: {
      total_due: roundToTwo(totalDue) || 0,
      number_of_transactions: numberOfTransactions,
      number_of_late_payments: numberOfLatePayments,
      average_payment_delay: roundToTwo(averagePaymentDelay),
    },
  };
};

export const createCustomerRiskModel = (type = RISK_MODEL_TYPES.RULE_BASED) => {
  return {
    type: RISK_MODEL_TYPES.RULE_BASED,
    predict: classifyByRules,
  };
};

export const applyCustomerRiskClassification = (customers, riskMetricsRows, model) => {
  const metricsMap = new Map();

  for (const row of riskMetricsRows || []) {
    const customerId = Number(row.customer_id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      continue;
    }

    metricsMap.set(customerId, row);
  }

  return (customers || []).map((customer) => {
    const customerId = Number(customer.id);
    const metricRow = metricsMap.get(customerId) || {
      customer_id: customerId,
      total_due: Number(customer.total_due || 0),
      number_of_transactions: 0,
      number_of_late_payments: 0,
      average_payment_delay: null,
    };

    const risk = model.predict(metricRow);

    return {
      ...customer,
      risk_level: risk.riskLevel,
      risk_score: risk.riskScore,
      trust_score: risk.trustScore,
      risk_reasons: risk.reasons,
      number_of_transactions: risk.metrics.number_of_transactions,
      number_of_late_payments: risk.metrics.number_of_late_payments,
      average_payment_delay: risk.metrics.average_payment_delay,
    };
  });
};
