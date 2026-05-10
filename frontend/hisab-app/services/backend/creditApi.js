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

const requestBackendText = async ({ path, accessToken = null, timeoutMs = 10000 }) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: 'text/csv,text/plain,*/*',
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

    return response.text();
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

export const fetchCollectionsDashboardOnline = async ({ accessToken }) => {
  return requestBackendJson({
    path: '/api/v1/baki/collections/dashboard',
    method: 'GET',
    accessToken,
  });
};

export const fetchCustomerStatementOnline = async ({ accessToken, customerId, fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ from: fromDateIso, to: toDateIso });
  return requestBackendJson({
    path: `/api/v1/baki/customers/${customerId}/statement${query}`,
    method: 'GET',
    accessToken,
  });
};

export const exportCustomerStatementCsvOnline = async ({ accessToken, customerId, fromDateIso = null, toDateIso = null }) => {
  const query = buildQuery({ from: fromDateIso, to: toDateIso });
  return requestBackendText({
    path: `/api/v1/baki/customers/${customerId}/statement/export${query}`,
    accessToken,
  });
};

export const createCustomerReminderOnline = async ({
  accessToken,
  customerId,
  bakiEntryId = null,
  channel = 'manual',
  message = null,
  sentAt = null,
  status = 'sent',
  referenceId = null,
}) => {
  return requestBackendJson({
    path: `/api/v1/baki/customers/${customerId}/reminders`,
    method: 'POST',
    body: {
      bakiEntryId,
      channel,
      message,
      sentAt,
      status,
      referenceId,
    },
    accessToken,
  });
};

export const listCustomerRemindersOnline = async ({ accessToken, customerId, limit = 50 }) => {
  const query = buildQuery({ limit });
  return requestBackendJson({
    path: `/api/v1/baki/customers/${customerId}/reminders${query}`,
    method: 'GET',
    accessToken,
  });
};

export const createPaymentPromiseOnline = async ({ accessToken, customerId, promisedAmount, promiseDate, note = null }) => {
  return requestBackendJson({
    path: `/api/v1/baki/customers/${customerId}/promises`,
    method: 'POST',
    body: {
      promisedAmount,
      promiseDate,
      note,
    },
    accessToken,
  });
};

export const listPaymentPromisesOnline = async ({ accessToken, customerId, status = null }) => {
  const query = buildQuery({ status });
  return requestBackendJson({
    path: `/api/v1/baki/customers/${customerId}/promises${query}`,
    method: 'GET',
    accessToken,
  });
};

export const updatePaymentPromiseStatusOnline = async ({ accessToken, promiseId, status }) => {
  return requestBackendJson({
    path: `/api/v1/baki/promises/${promiseId}/status`,
    method: 'PATCH',
    body: { status },
    accessToken,
  });
};
