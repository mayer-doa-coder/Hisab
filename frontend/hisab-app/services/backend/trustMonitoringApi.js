import { requestBackendJson } from './httpClient';

export const pushTrustMonitoringSnapshotOnline = async ({ accessToken, snapshot, source = 'phase8_runtime', appVersion = '1.0.0' }) => {
  return requestBackendJson({
    path: '/api/v1/reports/trust-monitoring-snapshot',
    method: 'POST',
    accessToken,
    timeoutMs: 8000,
    timeoutMessage: 'Trust monitoring upload timed out. Please try again.',
    networkErrorMessage: 'Unable to upload trust monitoring snapshot.',
    body: {
      source,
      app_version: appVersion,
      snapshot,
    },
  });
};

export const fetchTrustMonitoringSnapshotOnline = async ({ accessToken }) => {
  return requestBackendJson({
    path: '/api/v1/reports/trust-monitoring-snapshot',
    method: 'GET',
    accessToken,
    timeoutMs: 8000,
    timeoutMessage: 'Trust monitoring upload timed out. Please try again.',
    networkErrorMessage: 'Unable to upload trust monitoring snapshot.',
  });
};