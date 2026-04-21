import { requestBackendJson } from './httpClient';

const assertSuggestionRow = (row, index) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Suggestion at index ${index} must be an object.`);
  }

  const requiredFields = ['symbol', 'buy_quantity', 'confidence', 'horizon', 'decision', 'rationale'];
  for (const field of requiredFields) {
    if (row[field] === undefined || row[field] === null) {
      throw new Error(`Suggestion at index ${index} is missing field ${field}.`);
    }
  }
};

export const fetchStockSuggestionsOnline = async ({
  accessToken = null,
  currentState = 'SIDEWAYS_STABLE',
  symbol = '',
  horizons = ['1W', '1M'],
  allocationBase = 100,
} = {}) => {
  const params = new URLSearchParams();

  if (symbol) {
    params.set('symbol', String(symbol).trim().toUpperCase());
  }

  if (currentState) {
    params.set('current_state', String(currentState).trim().toUpperCase());
  }

  if (Array.isArray(horizons) && horizons.length > 0) {
    params.set('horizons', horizons.map((item) => String(item || '').trim()).filter(Boolean).join(','));
  }

  params.set('allocation_base', String(Math.max(0, Number(allocationBase) || 0)));

  const data = await requestBackendJson({
    path: `/api/v1/suggestions?${params.toString()}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
    timeoutMessage: 'Stock suggestions request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch stock suggestions from server.',
  });

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  suggestions.forEach((row, index) => {
    assertSuggestionRow(row, index);
  });

  return {
    ...data,
    suggestions,
  };
};
