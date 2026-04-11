const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const mean = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + toNumber(value, 0), 0);
  return total / values.length;
};

const standardDeviation = (values) => {
  if (!Array.isArray(values) || values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((sum, value) => {
    const delta = toNumber(value, 0) - avg;
    return sum + delta * delta;
  }, 0) / values.length;

  return Math.sqrt(variance);
};

const toRiskLevel = (riskScore) => {
  if (riskScore >= 70) {
    return RISK_LEVELS.HIGH;
  }

  if (riskScore >= 40) {
    return RISK_LEVELS.MEDIUM;
  }

  return RISK_LEVELS.LOW;
};

const normalizeCustomerData = (customerData = {}) => {
  const paymentRecords = Array.isArray(customerData.payment_records) ? customerData.payment_records : [];
  const transactionHistory = Array.isArray(customerData.transaction_history) ? customerData.transaction_history : [];

  const dueAmount = clamp(
    toNumber(
      customerData.due_amount
      ?? customerData.total_due
      ?? customerData.outstanding_due,
      0
    ),
    0,
    Number.MAX_SAFE_INTEGER
  );

  const latePayments = paymentRecords.filter((row) => {
    if (!row || typeof row !== 'object') {
      return false;
    }

    if (row.is_late === true) {
      return true;
    }

    if (String(row.status || '').toLowerCase() === 'late') {
      return true;
    }

    return toNumber(row.delay_days, 0) > 0;
  }).length;

  const delays = paymentRecords
    .map((row) => toNumber(row?.delay_days, 0))
    .filter((value) => value >= 0);

  const paymentAmounts = paymentRecords
    .map((row) => toNumber(row?.amount, 0))
    .filter((value) => value > 0);

  const transactionAmounts = transactionHistory
    .map((row) => toNumber(row?.amount, 0))
    .filter((value) => value > 0);

  const transactionCountFromRows = Math.max(transactionHistory.length, paymentRecords.length);
  const transactionCount = Math.max(transactionCountFromRows, Math.trunc(toNumber(customerData.transaction_count, 0)));
  const paymentCount = Math.max(paymentRecords.length, Math.trunc(toNumber(customerData.payment_count, 0)));

  const avgDelay = delays.length > 0 ? mean(delays) : 0;
  const paymentVolatility = standardDeviation(paymentAmounts.length > 0 ? paymentAmounts : transactionAmounts);
  const onTimeRatio = paymentCount > 0 ? clamp((paymentCount - latePayments) / paymentCount, 0, 1) : 0.5;

  return {
    due_amount: dueAmount,
    transaction_count: transactionCount,
    payment_count: paymentCount,
    late_payment_count: latePayments,
    average_payment_delay_days: avgDelay,
    payment_volatility: paymentVolatility,
    on_time_ratio: onTimeRatio,
    payment_records: paymentRecords,
    transaction_history: transactionHistory,
  };
};

const computeRuleBasedRisk = (features) => {
  const reasons = [];
  let risk = 20;

  if (features.due_amount >= 5000) {
    risk += 45;
    reasons.push('High due amount observed.');
  } else if (features.due_amount >= 2000) {
    risk += 25;
    reasons.push('Moderate due amount observed.');
  } else if (features.due_amount > 0) {
    risk += 10;
    reasons.push('Existing due amount detected.');
  }

  if (features.late_payment_count >= 3) {
    risk += 30;
    reasons.push('Frequent late payments detected.');
  } else if (features.late_payment_count > 0) {
    risk += 15;
    reasons.push('Late payment activity detected.');
  }

  if (features.average_payment_delay_days >= 20) {
    risk += 20;
    reasons.push('Average delay is high.');
  } else if (features.average_payment_delay_days >= 10) {
    risk += 10;
    reasons.push('Average delay is moderate.');
  }

  if (features.transaction_count <= 1 && features.due_amount > 0) {
    risk += 10;
    reasons.push('Limited transaction history with due amount.');
  }

  if (features.transaction_count >= 10 && features.due_amount === 0 && features.late_payment_count === 0) {
    risk -= 12;
    reasons.push('Strong payment history with zero due.');
  }

  const riskScore = clamp(Math.round(risk), 0, 100);
  return {
    risk_score: riskScore,
    trust_score: 100 - riskScore,
    risk_level: toRiskLevel(riskScore),
    risk_reasons: reasons.length > 0 ? reasons : ['Healthy repayment behavior.'],
    scoring_method: 'rule_based_fallback',
  };
};

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const computeLogisticRisk = (features) => {
  const dueNorm = clamp(features.due_amount / 10000, 0, 3);
  const delayNorm = clamp(features.average_payment_delay_days / 30, 0, 2);
  const lateRate = features.payment_count > 0
    ? clamp(features.late_payment_count / features.payment_count, 0, 1)
    : 0;
  const depthNorm = clamp(features.transaction_count / 25, 0, 1.2);
  const consistency = clamp(features.on_time_ratio, 0, 1);
  const volatilityNorm = clamp(features.payment_volatility / 5000, 0, 2);

  const linear =
    -1.8
    + (1.2 * dueNorm)
    + (1.0 * delayNorm)
    + (1.6 * lateRate)
    + (0.6 * volatilityNorm)
    - (0.9 * consistency)
    - (0.5 * depthNorm);

  const probability = clamp(sigmoid(linear), 0, 1);
  const riskScore = clamp(Math.round(probability * 100), 0, 100);

  const reasons = [];
  if (features.due_amount > 0) {
    reasons.push('Outstanding due amount contributes to risk.');
  }
  if (features.late_payment_count > 0) {
    reasons.push('Late payments contribute to risk.');
  }
  if (features.average_payment_delay_days >= 10) {
    reasons.push('Payment delay trend contributes to risk.');
  }
  if (reasons.length === 0) {
    reasons.push('Model predicts low repayment risk from available history.');
  }

  return {
    risk_score: riskScore,
    trust_score: 100 - riskScore,
    risk_level: toRiskLevel(riskScore),
    risk_reasons: reasons,
    scoring_method: 'logistic_phase3',
  };
};

const shouldUseChallenger = (features, options) => {
  if (options?.useChallenger !== true) {
    return false;
  }

  return features.transaction_count >= 6 && features.payment_volatility >= 500;
};

const computeChallengerAdjustment = (baseResult, features) => {
  const volatilityBoost = clamp(features.payment_volatility / 2000, 0, 15);
  const lateRateBoost = features.payment_count > 0
    ? clamp((features.late_payment_count / features.payment_count) * 15, 0, 15)
    : 0;
  const adjustedRisk = clamp(Math.round(baseResult.risk_score + volatilityBoost + lateRateBoost), 0, 100);

  const adjustedReasons = [...baseResult.risk_reasons];
  adjustedReasons.push('Challenger model increased risk for volatile repayment segment.');

  return {
    risk_score: adjustedRisk,
    trust_score: 100 - adjustedRisk,
    risk_level: toRiskLevel(adjustedRisk),
    risk_reasons: adjustedReasons,
    scoring_method: 'challenger_phase4',
  };
};

const hasInsufficientData = (features) => {
  const hasHistory = features.transaction_count >= 2 || features.payment_count >= 2;
  const hasExposure = features.due_amount > 0;
  return !hasHistory && !hasExposure;
};

const calculateTrustScore = (customerData = {}, options = {}) => {
  const features = normalizeCustomerData(customerData);

  if (hasInsufficientData(features)) {
    const fallbackResult = computeRuleBasedRisk(features);
    return {
      trust_score: fallbackResult.trust_score,
      risk_score: fallbackResult.risk_score,
      risk_level: fallbackResult.risk_level,
      risk_reasons: [
        'Insufficient historical data, using rule-based fallback.',
        ...fallbackResult.risk_reasons,
      ],
      scoring_method: fallbackResult.scoring_method,
      feature_snapshot: {
        due_amount: features.due_amount,
        transaction_count: features.transaction_count,
        payment_count: features.payment_count,
        late_payment_count: features.late_payment_count,
        average_payment_delay_days: Number(features.average_payment_delay_days.toFixed(2)),
      },
    };
  }

  const logisticResult = computeLogisticRisk(features);
  const finalResult = shouldUseChallenger(features, options)
    ? computeChallengerAdjustment(logisticResult, features)
    : logisticResult;

  return {
    trust_score: finalResult.trust_score,
    risk_score: finalResult.risk_score,
    risk_level: finalResult.risk_level,
    risk_reasons: finalResult.risk_reasons,
    scoring_method: finalResult.scoring_method,
    feature_snapshot: {
      due_amount: features.due_amount,
      transaction_count: features.transaction_count,
      payment_count: features.payment_count,
      late_payment_count: features.late_payment_count,
      average_payment_delay_days: Number(features.average_payment_delay_days.toFixed(2)),
    },
  };
};

module.exports = {
  RISK_LEVELS,
  calculateTrustScore,
};
