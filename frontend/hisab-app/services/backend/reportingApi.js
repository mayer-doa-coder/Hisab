import { getBackendBaseUrl } from './backendHealth';
import { createApiError, requestBackendJson } from './httpClient';

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
};

const requestBackendExport = async ({ path, accessToken = null, expectBinary = false, timeoutMs = 15000 }) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: expectBinary ? 'application/pdf,*/*' : 'text/csv,text/plain,*/*',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createApiError({
        message: `Request failed with status ${response.status}`,
        status: response.status,
      });
    }

    if (expectBinary) {
      const buffer = await response.arrayBuffer();
      return {
        byteLength: buffer.byteLength,
        contentType: response.headers.get('content-type') || 'application/pdf',
      };
    }

    const text = await response.text();
    return {
      text,
      byteLength: text.length,
      contentType: response.headers.get('content-type') || 'text/csv',
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createApiError({
        message: 'Request timed out. Please try again.',
        isNetworkError: true,
      });
    }

    if (error?.status || error?.code || error?.isNetworkError) {
      throw error;
    }

    throw createApiError({
      message: error?.message || 'Unable to reach server.',
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const fetchComplianceDashboardOnline = async ({
  accessToken,
  period = 'daily',
  fromDateIso = null,
  toDateIso = null,
}) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/dashboard/compliance${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchSalesReportOnline = async ({ accessToken, period = 'daily', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/sales-report${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchInventoryReportOnline = async ({ accessToken, period = 'daily', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/inventory-report${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchFinanceReportOnline = async ({ accessToken, period = 'daily', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/finance-report${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchCollectionsReportOnline = async ({ accessToken, period = 'daily', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/collections-report${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchTaxSummaryOnline = async ({ accessToken, period = 'monthly', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/tax-summary${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const fetchReconciliationOverviewOnline = async ({ accessToken, period = 'daily', fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ period, from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/reports/reconciliation${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const captureAuditSnapshotOnline = async ({ accessToken, snapshotDateIso = null }) => {
  return requestBackendJson({
    path: '/api/v1/reports/audit-snapshots/capture',
    method: 'POST',
    body: {
      snapshotDate: snapshotDateIso,
    },
    accessToken,
    timeoutMs: 12000,
  });
};

export const listAuditSnapshotsOnline = async ({ accessToken, fromDateIso = null, toDateIso = null, limit = 30 }) => {
  const query = buildQuery({ from: fromDateIso, to: toDateIso, limit });
  return requestBackendJson({
    path: `/api/v1/reports/audit-snapshots${query}`,
    method: 'GET',
    accessToken,
    timeoutMs: 12000,
  });
};

export const exportReportCsvOnline = async ({
  accessToken,
  reportType,
  period = 'daily',
  fromDateIso = null,
  toDateIso = null,
}) => {
  const query = buildQuery({ format: 'csv', period, from: fromDateIso, to: toDateIso });
  return requestBackendExport({
    path: `/api/v1/reports/export/${reportType}${query}`,
    accessToken,
    expectBinary: false,
  });
};

export const exportReportPdfOnline = async ({
  accessToken,
  reportType,
  period = 'daily',
  fromDateIso = null,
  toDateIso = null,
}) => {
  const query = buildQuery({ format: 'pdf', period, from: fromDateIso, to: toDateIso });
  return requestBackendExport({
    path: `/api/v1/reports/export/${reportType}${query}`,
    accessToken,
    expectBinary: true,
  });
};
