import { requestBackendJson } from './httpClient';

export const syncOnline = async ({ accessToken, payload }) => {
  return requestBackendJson({
    path: '/api/v1/sync',
    method: 'POST',
    body: payload,
    accessToken,
    timeoutMs: 10000,
    timeoutMessage: 'Sync request timed out. Please try again.',
    networkErrorMessage: 'Unable to reach sync server.',
  });
};
