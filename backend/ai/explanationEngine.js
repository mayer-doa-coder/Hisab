const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundTwo = (value) => Math.round(toNumber(value, 0) * 100) / 100;

const describeTrend = (trendPct) => {
  if (trendPct >= 0.12) {
    return 'rising';
  }
  if (trendPct <= -0.12) {
    return 'falling';
  }
  return 'stable';
};

const describeCoverage = (coverageDays, leadTimeDays) => {
  const coverage = toNumber(coverageDays, Number.POSITIVE_INFINITY);
  const lead = Math.max(1, toNumber(leadTimeDays, 7));

  if (!Number.isFinite(coverage)) {
    return 'Inventory coverage is unbounded because recent sales are near zero.';
  }

  if (coverage <= lead) {
    return `Inventory coverage is only ${roundTwo(coverage)} days against ${lead} days lead time.`;
  }

  if (coverage <= (lead * 2)) {
    return `Inventory coverage is moderate at ${roundTwo(coverage)} days.`;
  }

  return `Inventory coverage is healthy at ${roundTwo(coverage)} days.`;
};

const describeDemandRegime = (distribution = {}) => {
  const high = toNumber(distribution.HIGH_DEMAND, 0);
  const low = toNumber(distribution.LOW_DEMAND, 0);
  const stable = toNumber(distribution.STABLE, 0);

  if (high >= Math.max(low, stable)) {
    return `Markov demand regime leans high (${Math.round(high * 100)}%).`;
  }
  if (low >= Math.max(high, stable)) {
    return `Markov demand regime leans low (${Math.round(low * 100)}%).`;
  }
  return `Markov demand regime is stable (${Math.round(stable * 100)}%).`;
};

const buildSuggestionExplanation = ({
  horizon = '1W',
  decision = 'HOLD',
  buyQuantity = 0,
  confidenceBand = {},
  features = {},
  modelBreakdown = {},
} = {}) => {
  const horizonLabel = String(horizon || '').trim().toUpperCase() === '1M' ? '30 days' : '7 days';
  const trendPct = toNumber(features?.trend_pct, 0);
  const trendLabel = describeTrend(trendPct);

  const summary = decision === 'BUY_NOW'
    ? `Recommend buying ${Math.max(0, Math.trunc(toNumber(buyQuantity, 0)))} units for the next ${horizonLabel}.`
    : decision === 'WATCH'
      ? `Recommend watch mode for the next ${horizonLabel} while demand uncertainty remains moderate.`
      : `Recommend hold for the next ${horizonLabel} because demand can be covered by current stock.`;

  const drivers = [
    `Expected demand: ${roundTwo(confidenceBand.expected)} units (${roundTwo(confidenceBand.lower)} to ${roundTwo(confidenceBand.upper)}).`,
    `Recent sales trend is ${trendLabel} (${roundTwo(trendPct * 100)}%).`,
    describeCoverage(features?.inventory_coverage_days, features?.lead_time_days),
    describeDemandRegime(features?.markov?.next_state_distribution || {}),
  ];

  const modelContext = [
    `EMA contribution ${Math.round(toNumber(modelBreakdown.ema, 0) * 100)}%.`,
    `Threshold contribution ${Math.round(toNumber(modelBreakdown.threshold, 0) * 100)}%.`,
    `Markov contribution ${Math.round(toNumber(modelBreakdown.markov, 0) * 100)}%.`,
  ];

  return {
    summary,
    drivers,
    model_context: modelContext,
    trust_note: 'Demand signal uses only sales_header and sales_items records.',
  };
};

module.exports = {
  buildSuggestionExplanation,
};
