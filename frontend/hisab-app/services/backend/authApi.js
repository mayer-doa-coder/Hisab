import { fetchBackendHealth } from './backendHealth';
import { requestBackendJson } from './httpClient';

const requestAuthJson = (options) => {
  return requestBackendJson({
    timeoutMs: 7000,
    timeoutMessage: 'Request timed out. Please try again.',
    networkErrorMessage: 'Unable to reach server.',
    ...options,
  });
};

export const isBackendOnline = async () => {
  const health = await fetchBackendHealth();
  return Boolean(health?.ok);
};

export const signupOnline = async ({ email, pin, rememberMe = false }) => {
  return requestAuthJson({
    path: '/api/auth/signup',
    method: 'POST',
    body: { email, pin, rememberMe },
  });
};

export const loginOnline = async ({ email, pin, deviceId = null, rememberMe = false }) => {
  return requestAuthJson({
    path: '/api/auth/login',
    method: 'POST',
    body: { email, pin, deviceId, rememberMe },
  });
};

export const loginWithPinOnline = async ({ email, pin, deviceId, rememberMe = true }) => {
  return requestAuthJson({
    path: '/api/auth/pin/login',
    method: 'POST',
    body: { email, pin, deviceId, rememberMe },
  });
};

export const setupPinOnline = async ({ accessToken, pin, deviceId, trustDevice = true }) => {
  return requestAuthJson({
    path: '/api/auth/pin/setup',
    method: 'POST',
    body: { pin, deviceId, trustDevice },
    accessToken,
  });
};

export const requestEmailVerificationOnline = async ({ email }) => {
  return requestAuthJson({
    path: '/api/auth/verify-email/request',
    method: 'POST',
    body: { email },
  });
};

export const verifyEmailCodeOnline = async ({ email, verificationCode, rememberMe = false }) => {
  return requestAuthJson({
    path: '/api/auth/verify-email/confirm',
    method: 'POST',
    body: { email, verificationCode, rememberMe },
  });
};

export const refreshOnlineToken = async ({ refreshToken }) => {
  return requestAuthJson({
    path: '/api/auth/refresh',
    method: 'POST',
    body: { refreshToken },
  });
};

export const fetchOnlineProfile = async ({ accessToken }) => {
  return requestAuthJson({
    path: '/api/user/profile',
    method: 'GET',
    accessToken,
  });
};

export const requestPinRecoveryOnline = async ({ email }) => {
  return requestAuthJson({
    path: '/api/auth/recover/request-pin',
    method: 'POST',
    body: { email },
  });
};

export const resetPinOnline = async ({ resetToken, newPin }) => {
  return requestAuthJson({
    path: '/api/auth/recover/reset-pin',
    method: 'POST',
    body: { resetToken, newPin },
  });
};

export const updatePinOnline = async ({ accessToken, currentPin, newPin }) => {
  return requestAuthJson({
    path: '/api/auth/update-pin',
    method: 'POST',
    body: { currentPin, newPin },
    accessToken,
  });
};

export const requestPasswordRecoveryOnline = async ({ email }) => requestPinRecoveryOnline({ email });
export const resetPasswordOnline = async ({ resetToken, newPassword }) => resetPinOnline({ resetToken, newPin: newPassword });
export const updatePasswordOnline = async ({ accessToken, currentPassword, newPassword }) => updatePinOnline({ accessToken, currentPin: currentPassword, newPin: newPassword });

export const logoutOnline = async ({ refreshToken }) => {
  return requestAuthJson({
    path: '/api/auth/logout',
    method: 'POST',
    body: { refreshToken },
  });
};
