import { requestBackendJson } from './httpClient';

const DEFAULT_TRUST_HORIZON = '1_month';

export const fetchCustomerTrustScoreOnline = async ({ accessToken, customerId, horizon = DEFAULT_TRUST_HORIZON }) => {
  const normalizedId = String(customerId || '').trim();
  if (!normalizedId) {
    throw new Error('customerId is required.');
  }

  const normalizedHorizon = String(horizon || DEFAULT_TRUST_HORIZON).trim();
  const query = normalizedHorizon ? `?horizon=${encodeURIComponent(normalizedHorizon)}` : '';

  return requestBackendJson({
    path: `/api/v1/trust/${encodeURIComponent(normalizedId)}${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Trust scoring request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch trust score from server.',
  });
};

export const fetchCustomerTrustScoresOnline = async ({
  accessToken,
  customerIds = [],
  horizon = DEFAULT_TRUST_HORIZON,
}) => {
  const ids = Array.isArray(customerIds) ? customerIds : [];

  const settled = await Promise.allSettled(
    ids.map(async (customerId) => {
      const data = await fetchCustomerTrustScoreOnline({ accessToken, customerId, horizon });
      return [String(customerId), data];
    })
  );

  const byCustomerId = {};
  for (const row of settled) {
    if (row.status === 'fulfilled') {
      const [customerId, data] = row.value;
      byCustomerId[customerId] = data;
    }
  }

  return byCustomerId;
};

export const fetchTrustObjectiveOnline = async ({ accessToken = null }) => {
  return requestBackendJson({
    path: '/api/v1/trust/objective',
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Trust objective request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch trust objective definition from server.',
  });
};
