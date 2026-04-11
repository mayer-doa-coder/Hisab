import { getBackendBaseUrl } from './backendHealth';

const REQUEST_TIMEOUT_MS = 10000;

const createApiError = ({ message, status = null, code = null, isNetworkError = false }) => {
  const error = new Error(message || 'Request failed.');
  error.status = status;
  error.code = code;
  error.isNetworkError = isNetworkError;
  return error;
};

const requestJson = async ({ path, method = 'GET', body = null, accessToken = null }) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = {
      Accept: 'application/json',
    };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw createApiError({
        message: payload?.error?.message || payload?.message || `Request failed with status ${response.status}`,
        status: response.status,
        code: payload?.error?.code || payload?.code || null,
      });
    }

    return payload?.data || payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createApiError({
        message: 'Sync request timed out. Please try again.',
        isNetworkError: true,
      });
    }

    if (error?.status || error?.code || error?.isNetworkError) {
      throw error;
    }

    throw createApiError({
      message: error?.message || 'Unable to reach sync server.',
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const syncOnline = async ({ accessToken, payload }) => {
  return requestJson({
    path: '/api/v1/sync',
    method: 'POST',
    body: payload,
    accessToken,
  });
};
