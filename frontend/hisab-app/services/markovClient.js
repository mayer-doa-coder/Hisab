import { requestBackendJson } from './backend/httpClient';

const HORIZON_TO_FORECAST_TOKEN = Object.freeze({
  '1W': '1_week',
  '1M': '1_month',
});

const HIGH_DEMAND_STATES = new Set([
  'STRONG_UPTREND',
  'WEAK_UPTREND',
  'RECOVERY_PHASE',
]);

const LOW_DEMAND_STATES = new Set([
  'DOWNTREND',
  'LIQUIDITY_STRESS',
]);

const STABLE_STATES = new Set([
  'SIDEWAYS_STABLE',
  'QUEUE_PRESSURE',
  'HIGH_VOLATILITY',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const roundToSix = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(6));
};

const normalizeHorizon = (value) => {
  const token = String(value || '').trim().toUpperCase();
  return token === '1M' ? '1M' : '1W';
};

const mapHorizonToForecastToken = (value) => HORIZON_TO_FORECAST_TOKEN[normalizeHorizon(value)] || '1_week';

const normalizeDistribution = (distribution) => {
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution)) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  const highExplicit = toNumberOrNull(distribution.HIGH_DEMAND ?? distribution.high_demand);
  const lowExplicit = toNumberOrNull(distribution.LOW_DEMAND ?? distribution.low_demand);
  const stableExplicit = toNumberOrNull(distribution.STABLE ?? distribution.stable);

  if (highExplicit !== null || lowExplicit !== null || stableExplicit !== null) {
    const high = Math.max(0, Number(highExplicit || 0));
    const low = Math.max(0, Number(lowExplicit || 0));
    const stable = Math.max(0, Number(stableExplicit || 0));
    const sum = high + low + stable;

    if (sum <= 0) {
      return {
        HIGH_DEMAND: 0,
        LOW_DEMAND: 0,
        STABLE: 0,
      };
    }

    return {
      HIGH_DEMAND: roundToSix(high / sum),
      LOW_DEMAND: roundToSix(low / sum),
      STABLE: roundToSix(stable / sum),
    };
  }

  let high = 0;
  let low = 0;
  let stable = 0;

  for (const [stateKey, probabilityRaw] of Object.entries(distribution)) {
    const probability = Math.max(0, Number(probabilityRaw || 0));
    const state = String(stateKey || '').trim().toUpperCase();

    if (HIGH_DEMAND_STATES.has(state)) {
      high += probability;
      continue;
    }

    if (LOW_DEMAND_STATES.has(state)) {
      low += probability;
      continue;
    }

    if (STABLE_STATES.has(state)) {
      stable += probability;
      continue;
    }

    stable += probability;
  }

  const sum = high + low + stable;
  if (sum <= 0) {
    return {
      HIGH_DEMAND: 0,
      LOW_DEMAND: 0,
      STABLE: 0,
    };
  }

  return {
    HIGH_DEMAND: roundToSix(high / sum),
    LOW_DEMAND: roundToSix(low / sum),
    STABLE: roundToSix(stable / sum),
  };
};

const computeNormalizedEntropy = (distribution) => {
  const probabilities = [
    Number(distribution?.HIGH_DEMAND || 0),
    Number(distribution?.LOW_DEMAND || 0),
    Number(distribution?.STABLE || 0),
  ]
    .map((value) => Math.max(0, value))
    .filter((value) => value > 0);

  if (probabilities.length === 0) {
    return 1;
  }

  const entropy = probabilities.reduce((sum, probability) => {
    return sum - (probability * Math.log2(probability));
  }, 0);

  return clamp(entropy / Math.log2(3), 0, 1);
};

const resolveMarkovState = (distribution) => {
  const entries = Object.entries(distribution || {});
  if (entries.length === 0) {
    return 'STABLE';
  }

  const sorted = [...entries].sort((left, right) => Number(right[1]) - Number(left[1]));
  return String(sorted[0][0] || 'STABLE').trim().toUpperCase() || 'STABLE';
};

const resolveEmaSignalByHorizon = ({ response, horizon }) => {
  const token = normalizeHorizon(horizon);
  const rows = Array.isArray(response?.ema_signals) ? response.ema_signals : [];
  const match = rows.find((row) => String(row?.horizon || '').trim().toUpperCase() === token);

  return {
    score: clamp(Number(match?.ema_score || 0), 0, 1),
    trend: String(match?.trend || 'NEUTRAL').trim().toUpperCase() || 'NEUTRAL',
    strength: clamp(Number(match?.strength || 0), 0, 1),
  };
};

const resolveForecastHorizonPayload = ({ response, horizon }) => {
  const forecastToken = mapHorizonToForecastToken(horizon);
  const horizons = response?.horizons && typeof response.horizons === 'object'
    ? response.horizons
    : {};

  if (horizons[forecastToken] && typeof horizons[forecastToken] === 'object') {
    return {
      token: forecastToken,
      payload: horizons[forecastToken],
    };
  }

  const first = Object.entries(horizons)[0] || null;
  if (!first) {
    return {
      token: forecastToken,
      payload: null,
    };
  }

  return {
    token: String(first[0] || forecastToken),
    payload: first[1] && typeof first[1] === 'object' ? first[1] : null,
  };
};

const resolveExpectedDemand = ({ response, horizonPayload, baselineDemand }) => {
  const explicit = toNumberOrNull(response?.expected_demand ?? horizonPayload?.expected_demand);
  if (explicit !== null) {
    return Math.max(0, explicit);
  }

  const distribution = normalizeDistribution(
    horizonPayload?.terminal_state_distribution
    || response?.next_state_distribution
  );

  const weightedMultiplier =
    (distribution.HIGH_DEMAND * 1.25)
    + (distribution.STABLE * 1)
    + (distribution.LOW_DEMAND * 0.75);

  return Math.max(0, baselineDemand * weightedMultiplier);
};

const resolveUncertainty = ({ response, horizonPayload, distribution }) => {
  const explicit = toNumberOrNull(response?.uncertainty);
  if (explicit !== null) {
    return clamp(explicit, 0, 1);
  }

  const entropy = computeNormalizedEntropy(distribution);
  const stddev = Number(horizonPayload?.metrics?.uncertainty?.standard_deviation || 0);
  const normalizedStddev = clamp(stddev / 0.2, 0, 1);
  return clamp((0.6 * entropy) + (0.4 * normalizedStddev), 0, 1);
};

const resolveConfidence = ({ response, horizonPayload, uncertainty }) => {
  const explicit = toNumberOrNull(response?.confidence);
  if (explicit !== null) {
    return clamp(explicit, 0, 1);
  }

  const decisionConfidence = toNumberOrNull(horizonPayload?.decision?.confidence);
  const fallbackDecisionConfidence = toNumberOrNull(horizonPayload?.failure_report?.confidence?.score);
  const sourceConfidence = decisionConfidence !== null
    ? decisionConfidence
    : fallbackDecisionConfidence !== null
      ? fallbackDecisionConfidence
      : 0.5;

  return clamp(sourceConfidence * (1 - (0.35 * uncertainty)), 0.05, 0.99);
};

const normalizeSymbol = (product = {}) => {
  const raw = product?.symbol || product?.sku || product?.code || product?.name || `PRODUCT_${product?.id || 'UNKNOWN'}`;
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
};

export const mapMarkovForecastResponseToDemandSignal = ({
  response,
  horizon = '1W',
  baselineDemand = 0,
} = {}) => {
  if (!response || typeof response !== 'object') {
    throw new Error('Markov forecast response must be an object.');
  }

  const { token, payload } = resolveForecastHorizonPayload({ response, horizon });
  if (!payload) {
    throw new Error('Markov forecast response missing horizons payload.');
  }

  const nextStateDistribution = normalizeDistribution(
    response?.next_state_distribution
    || payload?.terminal_state_distribution
  );

  const expectedDemand = resolveExpectedDemand({
    response,
    horizonPayload: payload,
    baselineDemand,
  });

  const uncertainty = resolveUncertainty({
    response,
    horizonPayload: payload,
    distribution: nextStateDistribution,
  });

  const confidence = resolveConfidence({
    response,
    horizonPayload: payload,
    uncertainty,
  });

  const markovState = resolveMarkovState(nextStateDistribution);
  const ema = resolveEmaSignalByHorizon({
    response,
    horizon,
  });

  return {
    next_state_distribution: nextStateDistribution,
    expected_demand: roundToSix(expectedDemand),
    uncertainty: roundToSix(uncertainty),
    confidence: roundToSix(confidence),
    diagnostics: {
      markov_state: markovState,
      uncertainty: roundToSix(uncertainty),
      confidence: roundToSix(confidence),
      distribution: nextStateDistribution,
      forecast_horizon_token: token,
    },
    ema,
  };
};

export const fetchMarkovEnsembleDecision = async ({
  accessToken = null,
  payload = {},
} = {}) => {
  const data = await requestBackendJson({
    path: '/api/v1/markov/ensemble/decision',
    method: 'POST',
    accessToken,
    timeoutMs: 10000,
    timeoutMessage: 'Ensemble decision request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch ensemble decision from server.',
    body: payload && typeof payload === 'object' ? payload : {},
  });

  const decision = String(data?.decision || '').trim().toUpperCase();
  const confidence = Number(data?.confidence);

  if (!decision || !Number.isFinite(confidence)) {
    throw new Error('Ensemble decision response is missing required fields.');
  }

  return data;
};

export const fetchMarkovForecastForReorder = async ({
  accessToken = null,
  product = {},
  thresholdSuggestion = {},
  config = {},
  horizon = '1W',
  currentState = 'SIDEWAYS_STABLE',
  features = {},
} = {}) => {
  const normalizedHorizon = normalizeHorizon(horizon);
  const forecastHorizon = mapHorizonToForecastToken(normalizedHorizon);

  const quantity = Math.max(0, Math.trunc(Number(product?.quantity || 0)));
  const leadTimeDays = Math.max(1, Math.trunc(Number(config?.leadTimeDays || 3)));
  const dailySalesRate = Math.max(0, Number(thresholdSuggestion?.dailySalesRate || 0));
  const baselineDemand = Math.max(0, Number(thresholdSuggestion?.targetLevel || 0));

  const response = await requestBackendJson({
    path: '/api/v1/markov/forecast',
    method: 'POST',
    accessToken,
    timeoutMs: 12000,
    timeoutMessage: 'Markov reorder forecast request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch Markov reorder forecast from server.',
    body: {
      product_id: String(product?.id || ''),
      symbol: normalizeSymbol(product),
      features: features && typeof features === 'object' ? features : {},
      feature_input: {
        current_inventory: quantity,
        lead_time_days: leadTimeDays,
        historical_average_sales_velocity: dailySalesRate,
        minimum_safe_stock_level: Math.max(0, Number(product?.low_stock_threshold || 0)),
        ...(features && typeof features === 'object' ? features : {}),
      },
      current_state: String(currentState || 'SIDEWAYS_STABLE').trim().toUpperCase(),
      horizon: normalizedHorizon,
      horizons: [forecastHorizon],
    },
  });

  const mapped = mapMarkovForecastResponseToDemandSignal({
    response,
    horizon: normalizedHorizon,
    baselineDemand,
  });

  return {
    symbol: normalizeSymbol(product),
    horizon: normalizedHorizon,
    ...mapped,
  };
};
