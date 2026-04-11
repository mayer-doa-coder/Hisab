import { getBackendBaseUrl } from './backendHealth';

const pickErrorMessage = (payload, status) => {
  return payload?.error?.message || payload?.message || `Request failed with status ${status}`;
};

const pickErrorCode = (payload) => payload?.error?.code || payload?.code || null;
const pickErrorDetails = (payload) => payload?.error?.details || payload?.details || null;

export const createApiError = ({
  message,
  status = null,
  code = null,
  details = null,
  isNetworkError = false,
}) => {
  const error = new Error(message || 'Request failed.');
  error.status = status;
  error.code = code;
  error.details = details;
  error.isNetworkError = isNetworkError;
  return error;
};

export const requestBackendJson = async ({
  path,
  method = 'GET',
  body = null,
  accessToken = null,
  timeoutMs = 8000,
  timeoutMessage = 'Request timed out. Please try again.',
  networkErrorMessage = 'Unable to reach server.',
}) => {
  const baseUrl = getBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
        message: pickErrorMessage(payload, response.status),
        status: response.status,
        code: pickErrorCode(payload),
        details: pickErrorDetails(payload),
      });
    }

    return payload?.data || payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createApiError({
        message: timeoutMessage,
        isNetworkError: true,
      });
    }

    if (error?.status || error?.code || error?.isNetworkError) {
      throw error;
    }

    throw createApiError({
      message: error?.message || networkErrorMessage,
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};
