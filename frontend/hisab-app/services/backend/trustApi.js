import { requestBackendJson } from './httpClient';

export const fetchCustomerTrustScoreOnline = async ({ accessToken, customerId }) => {
  const normalizedId = String(customerId || '').trim();
  if (!normalizedId) {
    throw new Error('customerId is required.');
  }

  return requestBackendJson({
    path: `/api/v1/trust/${encodeURIComponent(normalizedId)}`,
    method: 'GET',
    accessToken,
    timeoutMs: 9000,
    timeoutMessage: 'Trust scoring request timed out. Please try again.',
    networkErrorMessage: 'Unable to fetch trust score from server.',
  });
};

export const fetchCustomerTrustScoresOnline = async ({ accessToken, customerIds = [] }) => {
  const ids = Array.isArray(customerIds) ? customerIds : [];

  const settled = await Promise.allSettled(
    ids.map(async (customerId) => {
      const data = await fetchCustomerTrustScoreOnline({ accessToken, customerId });
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
