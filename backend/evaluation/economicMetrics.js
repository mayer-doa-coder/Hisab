const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const ACTIONS = Object.freeze({
  HOLD: 'HOLD',
  REDUCE: 'REDUCE',
  ACCUMULATE: 'ACCUMULATE',
});

const normalizeAction = (value) => {
  const token = String(value || '').trim().toUpperCase();
  if (token === ACTIONS.HOLD || token === ACTIONS.REDUCE || token === ACTIONS.ACCUMULATE) {
    return token;
  }
  return ACTIONS.HOLD;
};

const computeMaxDrawdown = (equityCurve = []) => {
  if (!Array.isArray(equityCurve) || equityCurve.length === 0) {
    return 0;
  }

  let peak = equityCurve[0];
  let maxDrawdown = 0;

  for (const equity of equityCurve) {
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (equity - peak) / peak : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return Number(maxDrawdown.toFixed(6));
};

const classifyActionHit = ({ action, realizedReturn }) => {
  const normalizedAction = normalizeAction(action);
  const value = toNumber(realizedReturn, 0);

  if (value > 0.001) {
    return normalizedAction === ACTIONS.ACCUMULATE ? 1 : 0;
  }

  if (value < -0.001) {
    return normalizedAction === ACTIONS.REDUCE ? 1 : 0;
  }

  return normalizedAction === ACTIONS.HOLD ? 1 : 0;
};

const simulateDecisionSeries = ({
  decisions = [],
  realizedReturns = [],
  initialExposure = 0.5,
  exposureBounds = [0.1, 0.8],
  exposureStep = 0.05,
} = {}) => {
  const size = Math.min(decisions.length, realizedReturns.length);
  const lower = Math.min(toNumber(exposureBounds[0], 0.1), toNumber(exposureBounds[1], 0.8));
  const upper = Math.max(toNumber(exposureBounds[0], 0.1), toNumber(exposureBounds[1], 0.8));

  let exposure = clamp(toNumber(initialExposure, 0.5), lower, upper);
  let equity = 1;

  const exposures = [];
  const portfolioReturns = [];
  const equityCurve = [equity];
  const hitSeries = [];

  for (let index = 0; index < size; index += 1) {
    const action = normalizeAction(decisions[index]?.action);

    if (action === ACTIONS.ACCUMULATE) {
      exposure = clamp(exposure + Math.max(0, toNumber(exposureStep, 0.05)), lower, upper);
    } else if (action === ACTIONS.REDUCE) {
      exposure = clamp(exposure - Math.max(0, toNumber(exposureStep, 0.05)), lower, upper);
    }

    const realized = toNumber(realizedReturns[index], 0);
    const portfolioReturn = exposure * realized;

    equity *= (1 + portfolioReturn);

    exposures.push(Number(exposure.toFixed(6)));
    portfolioReturns.push(Number(portfolioReturn.toFixed(6)));
    hitSeries.push(classifyActionHit({ action, realizedReturn: realized }));
    equityCurve.push(Number(equity.toFixed(6)));
  }

  return {
    exposures,
    portfolio_returns: portfolioReturns,
    equity_curve: equityCurve,
    hit_series: hitSeries,
  };
};

const computeEconomicMetrics = ({
  decisions = [],
  realizedReturns = [],
  initialExposure = 0.5,
  exposureBounds = [0.1, 0.8],
  exposureStep = 0.05,
} = {}) => {
  const simulation = simulateDecisionSeries({
    decisions,
    realizedReturns,
    initialExposure,
    exposureBounds,
    exposureStep,
  });

  const returns = simulation.portfolio_returns;
  const count = returns.length;
  if (count === 0) {
    return {
      gain_loss_ratio: null,
      average_return: null,
      max_drawdown: null,
      hit_rate: null,
      risk_adjusted_return: null,
      sample_count: 0,
      equity_curve: simulation.equity_curve,
    };
  }

  const positive = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const negative = returns.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
  const avg = returns.reduce((sum, value) => sum + value, 0) / count;

  const variance = returns.reduce((sum, value) => {
    const delta = value - avg;
    return sum + (delta * delta);
  }, 0) / count;
  const std = Math.sqrt(Math.max(0, variance));

  const hitRate = simulation.hit_series.reduce((sum, value) => sum + value, 0) / simulation.hit_series.length;
  const sharpeLike = std > 0 ? (avg / std) * Math.sqrt(count) : null;

  return {
    gain_loss_ratio: negative > 0 ? Number((positive / negative).toFixed(6)) : null,
    average_return: Number(avg.toFixed(6)),
    max_drawdown: computeMaxDrawdown(simulation.equity_curve),
    hit_rate: Number(hitRate.toFixed(6)),
    risk_adjusted_return: sharpeLike === null ? null : Number(sharpeLike.toFixed(6)),
    sample_count: count,
    equity_curve: simulation.equity_curve,
  };
};

module.exports = {
  ACTIONS,
  simulateDecisionSeries,
  computeEconomicMetrics,
};
