const STOCK_SUGGESTION_HORIZONS = Object.freeze(['1D', '7D', '1W', '1M']);
const STOCK_SUGGESTION_DECISIONS = Object.freeze(['BUY_NOW', 'WATCH', 'HOLD']);

const HORIZON_ALIASES = Object.freeze({
  '1w': '1W',
  '7d': '7D',
  '7_day': '7D',
  '1_week': '1W',
  weekly: '1W',
  '1d': '1D',
  '1_day': '1D',
  daily: '1D',
  '1m': '1M',
  '1_month': '1M',
  monthly: '1M',
});

const STOCK_SUGGESTION_SCHEMA = Object.freeze({
  symbol: 'string',
  buy_quantity: 'number',
  confidence: 'number',
  horizon: '1D | 7D | 1W | 1M',
  decision: 'BUY_NOW | WATCH | HOLD',
  model_votes: {
    markov: 'number',
    baseline: 'number',
  },
  rationale: 'string',
});

const STOCK_SUGGESTION_VALIDATION_RULES = Object.freeze({
  confidence_range: '[0,1]',
  buy_quantity_min: 0,
  decision_enum: STOCK_SUGGESTION_DECISIONS,
  horizon_enum: STOCK_SUGGESTION_HORIZONS,
  model_votes_sum_max: 1,
});

const STOCK_SUGGESTION_CONTRACT = Object.freeze({
  contract_name: 'stock_suggestion_contract',
  contract_version: 'stock_suggestion_contract_v1',
  locked: true,
  schema: STOCK_SUGGESTION_SCHEMA,
  validation_rules: STOCK_SUGGESTION_VALIDATION_RULES,
});

const toNumber = (value, fallback = NaN) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeSuggestionHorizonToken = (value) => {
  const token = String(value || '').trim();
  if (!token) {
    return null;
  }

  const normalized = HORIZON_ALIASES[token.toLowerCase()];
  return normalized || (STOCK_SUGGESTION_HORIZONS.includes(token) ? token : null);
};

const assertFiniteInRange = (value, {
  field,
  min = null,
  max = null,
} = {}) => {
  const numeric = toNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number.`);
  }
  if (min !== null && numeric < min) {
    throw new Error(`${field} must be >= ${min}.`);
  }
  if (max !== null && numeric > max) {
    throw new Error(`${field} must be <= ${max}.`);
  }

  return numeric;
};

const validateModelVotes = (modelVotes = {}, { enforceVoteSum = true } = {}) => {
  if (!modelVotes || typeof modelVotes !== 'object' || Array.isArray(modelVotes)) {
    throw new Error('model_votes must be an object.');
  }

  const allowedVoteFields = new Set(['markov', 'baseline']);
  const extraVoteFields = Object.keys(modelVotes).filter((field) => !allowedVoteFields.has(field));
  if (extraVoteFields.length > 0) {
    throw new Error(`Unknown model_votes fields: ${extraVoteFields.join(', ')}`);
  }

  const markov = assertFiniteInRange(modelVotes.markov, {
    field: 'model_votes.markov',
    min: 0,
    max: 1,
  });
  const baseline = assertFiniteInRange(modelVotes.baseline, {
    field: 'model_votes.baseline',
    min: 0,
    max: 1,
  });

  const voteSum = markov + baseline;
  if (enforceVoteSum && voteSum > 1.000001) {
    throw new Error('model_votes sum must be <= 1.');
  }

  return {
    markov: Number(markov.toFixed(6)),
    baseline: Number(baseline.toFixed(6)),
  };
};

const validateStockSuggestionRow = (row = {}, {
  enforceVoteSum = true,
} = {}) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Stock suggestion row must be an object.');
  }

  const allowedFields = new Set([
    'symbol',
    'buy_quantity',
    'confidence',
    'horizon',
    'decision',
    'model_votes',
    'rationale',
  ]);
  const extraFields = Object.keys(row).filter((field) => !allowedFields.has(field));
  if (extraFields.length > 0) {
    throw new Error(`Unknown fields in stock suggestion row: ${extraFields.join(', ')}`);
  }

  const symbol = String(row.symbol || '').trim().toUpperCase();
  if (!symbol) {
    throw new Error('symbol must be a non-empty string.');
  }

  const buyQuantity = assertFiniteInRange(row.buy_quantity, {
    field: 'buy_quantity',
    min: 0,
  });
  const confidence = assertFiniteInRange(row.confidence, {
    field: 'confidence',
    min: 0,
    max: 1,
  });

  const horizon = normalizeSuggestionHorizonToken(row.horizon);
  if (!horizon) {
    throw new Error('horizon must be one of: 1D, 7D, 1W, 1M.');
  }

  const decision = String(row.decision || '').trim().toUpperCase();
  if (!STOCK_SUGGESTION_DECISIONS.includes(decision)) {
    throw new Error('decision must be one of: BUY_NOW, WATCH, HOLD.');
  }

  const rationale = String(row.rationale || '').trim();
  if (!rationale) {
    throw new Error('rationale must be a non-empty string.');
  }

  const modelVotes = validateModelVotes(row.model_votes, { enforceVoteSum });

  const normalized = {
    symbol,
    buy_quantity: Number(buyQuantity.toFixed(6)),
    confidence: Number(confidence.toFixed(6)),
    horizon,
    decision,
    model_votes: modelVotes,
    rationale,
  };

  return normalized;
};

const validateStockSuggestionRows = (rows = [], { enforceVoteSum = true } = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => validateStockSuggestionRow(row, {
    enforceVoteSum,
  }));
};

module.exports = {
  STOCK_SUGGESTION_HORIZONS,
  STOCK_SUGGESTION_DECISIONS,
  STOCK_SUGGESTION_SCHEMA,
  STOCK_SUGGESTION_VALIDATION_RULES,
  STOCK_SUGGESTION_CONTRACT,
  normalizeSuggestionHorizonToken,
  validateStockSuggestionRow,
  validateStockSuggestionRows,
};
