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
  horizons = ['7D', '1D'],
  allocationBase = 100,
  holidayDates = [],
  holidayImpact = 1,
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

  if (Array.isArray(holidayDates) && holidayDates.length > 0) {
    const encoded = holidayDates
      .map((item) => {
        const date = String(item?.date || '').trim();
        if (!date) {
          return '';
        }
        const name = String(item?.name || 'Holiday').trim() || 'Holiday';
        return `${date}|${name}`;
      })
      .filter(Boolean)
      .join(',');

    if (encoded) {
      params.set('holiday_dates', encoded);
    }
  }

  const safeHolidayImpact = Number(holidayImpact);
  if (Number.isFinite(safeHolidayImpact) && safeHolidayImpact >= 0 && safeHolidayImpact <= 2) {
    params.set('holiday_impact', String(safeHolidayImpact));
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
