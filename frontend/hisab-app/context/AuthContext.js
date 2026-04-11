import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createTables,
  getAuthDeviceProfile,
  getCurrentUser,
  logoutCurrentUser,
  saveAuthenticatedUserSession,
  setAuthDeviceProfile,
  updateSessionServerStatus,
  updateSessionTokens,
} from '../database/db';
import {
  fetchOnlineProfile,
  isBackendOnline,
  loginOnline,
  loginWithPinOnline,
  logoutOnline,
  requestPinRecoveryOnline,
  requestEmailVerificationOnline,
  resetPinOnline,
  refreshOnlineToken,
  setupPinOnline,
  signupOnline,
  updatePinOnline,
  verifyEmailCodeOnline,
} from '../services/backend/authApi';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};

const isLikelyExpired = (isoDate, skewMs = 30 * 1000) => {
  if (!isoDate) {
    return true;
  }

  const time = new Date(isoDate).getTime();
  if (!Number.isFinite(time)) {
    return true;
  }

  return time <= Date.now() + skewMs;
};

const toServerTokenShape = (payload) => ({
  accessToken: payload?.accessToken || null,
  refreshToken: payload?.refreshToken || null,
  accessTokenExpiresAt: payload?.accessTokenExpiresAt || null,
  refreshTokenExpiresAt: payload?.refreshTokenExpiresAt || null,
});

const SESSION_STATES = {
  BOOTING: 'booting',
  ONLINE_VALID: 'online-valid',
  OFFLINE_VALID: 'offline-valid',
  REFRESHING: 'refreshing',
  FORCED_LOGOUT: 'forced-logout',
  UNAUTHENTICATED: 'unauthenticated',
};

const ONLINE_AUTH_REQUIRED_CODE = 'ONLINE_AUTH_REQUIRED';
const PIN_LOGIN_EMAIL_REQUIRED_CODE = 'PIN_LOGIN_EMAIL_REQUIRED';

const buildStateSnapshot = (state, message = '', reason = '') => ({
  state,
  message,
  reason,
  updatedAt: new Date().toISOString(),
});

const mergeLocalAndServerUser = (localUser, serverUser = null) => {
  const localId = Number(localUser?.id || 0);
  const normalizedLocalId = Number.isInteger(localId) && localId > 0 ? localId : null;

  return {
    ...(localUser || {}),
    ...(serverUser || {}),
    id: normalizedLocalId ?? localUser?.id ?? null,
    local_id: normalizedLocalId,
    server_id: serverUser?.id ? String(serverUser.id) : localUser?.server_id || null,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [authDeviceProfile, setAuthDeviceProfileState] = useState({
    deviceId: null,
    preferredEmail: null,
    pinEnabled: false,
  });
  const [authStatus, setAuthStatus] = useState(buildStateSnapshot(SESSION_STATES.BOOTING, 'Restoring saved session...'));

  const updateAuthStatus = useCallback((state, message = '', reason = '') => {
    setAuthStatus(buildStateSnapshot(state, message, reason));
  }, []);

  const syncAuthDeviceProfile = useCallback(async () => {
    const profile = await getAuthDeviceProfile();
    setAuthDeviceProfileState(profile || {
      deviceId: null,
      preferredEmail: null,
      pinEnabled: false,
    });
    return profile;
  }, []);

  const hardLogout = useCallback(async ({ sessionToken = null, message = 'Your session has ended.', reason = 'FORCED_LOGOUT' } = {}) => {
    await logoutCurrentUser({ sessionToken });
    setUser(null);
    setSession(null);
    updateAuthStatus(SESSION_STATES.FORCED_LOGOUT, message, reason);
  }, [updateAuthStatus]);

  const refreshSessionWithServer = useCallback(
    async ({ sessionToken, refreshToken, fallbackUser }) => {
      updateAuthStatus(SESSION_STATES.REFRESHING, 'Refreshing session token...');
      const refreshed = await refreshOnlineToken({ refreshToken });

      const updatedSession = await updateSessionTokens({
        sessionToken,
        ...toServerTokenShape(refreshed),
        authMode: 'hybrid',
        serverStatus: 'token-refreshed',
        syncPending: false,
      });

      setSession(updatedSession);
      setUser((prev) => mergeLocalAndServerUser(fallbackUser || prev, refreshed?.user || null));
      updateAuthStatus(SESSION_STATES.ONLINE_VALID, 'Session is valid and synced.', 'TOKEN_REFRESHED');

      return updatedSession;
    },
    [updateAuthStatus]
  );

  const validateSessionOnline = useCallback(
    async (currentPayload) => {
      if (!currentPayload?.user || !currentPayload?.session?.token) {
        updateAuthStatus(SESSION_STATES.UNAUTHENTICATED, 'No active session found.', 'NO_LOCAL_SESSION');
        return { valid: false, reason: 'NO_LOCAL_SESSION' };
      }

      const sessionToken = currentPayload.session.token;
      const accessToken = currentPayload.session.access_token;
      const refreshToken = currentPayload.session.refresh_token;

      if (!accessToken) {
        await updateSessionServerStatus({ sessionToken, serverStatus: 'local-only' });
        updateAuthStatus(SESSION_STATES.OFFLINE_VALID, 'Session is available in offline mode.', 'NO_ACCESS_TOKEN');
        return { valid: true, mode: 'offline-local' };
      }

      try {
        const profile = await fetchOnlineProfile({ accessToken });

        const updatedSession = await updateSessionTokens({
          sessionToken,
          accessToken,
          refreshToken,
          accessTokenExpiresAt: currentPayload.session.access_expires_at,
          refreshTokenExpiresAt: currentPayload.session.refresh_expires_at,
          authMode: 'hybrid',
          serverStatus: 'ok',
          syncPending: false,
        });

        setSession(updatedSession);
        setUser((prev) => mergeLocalAndServerUser(currentPayload.user || prev, profile?.user || null));
        updateAuthStatus(SESSION_STATES.ONLINE_VALID, 'Session is valid and synced.');
        return { valid: true, mode: 'online' };
      } catch (error) {
        if (error?.isNetworkError) {
          updateAuthStatus(SESSION_STATES.OFFLINE_VALID, 'Internet unavailable. Using cached session.', 'NO_INTERNET');
          return { valid: true, mode: 'offline-fallback', reason: 'NO_INTERNET' };
        }

        const errorCode = String(error?.code || '');
        const isAccessExpired = errorCode === 'ACCESS_TOKEN_EXPIRED' || Number(error?.status) === 401;

        if (isAccessExpired && refreshToken) {
          try {
            await refreshSessionWithServer({
              sessionToken,
              refreshToken,
              fallbackUser: currentPayload.user,
            });
            return { valid: true, mode: 'token-refreshed' };
          } catch (refreshError) {
            const refreshCode = String(refreshError?.code || '');
            if (refreshCode === 'REFRESH_TOKEN_EXPIRED' || refreshCode === 'INVALID_REFRESH_TOKEN' || Number(refreshError?.status) === 401) {
              await hardLogout({
                sessionToken,
                message: 'Session expired. Please login again.',
                reason: refreshCode || 'REFRESH_INVALID_FORCE_LOGOUT',
              });
              return { valid: false, reason: refreshCode || 'REFRESH_INVALID_FORCE_LOGOUT' };
            }

            if (refreshError?.isNetworkError) {
              updateAuthStatus(SESSION_STATES.OFFLINE_VALID, 'Internet unavailable. Using cached session.', 'NO_INTERNET');
              return { valid: true, mode: 'offline-fallback', reason: 'NO_INTERNET' };
            }

            throw refreshError;
          }
        }

        if (isAccessExpired && !refreshToken) {
          await hardLogout({
            sessionToken,
            message: 'Session expired and no refresh token is available.',
            reason: 'ACCESS_EXPIRED_NO_REFRESH',
          });
          return { valid: false, reason: 'ACCESS_EXPIRED_NO_REFRESH' };
        }

        if (errorCode === 'INVALID_ACCESS_TOKEN') {
          await hardLogout({
            sessionToken,
            message: 'Session token is invalid. Please login again.',
            reason: 'INVALID_ACCESS_TOKEN',
          });
          return { valid: false, reason: 'INVALID_ACCESS_TOKEN' };
        }

        throw error;
      }
    },
    [hardLogout, refreshSessionWithServer, updateAuthStatus]
  );

  useEffect(() => {
    const restoreAuth = async () => {
      try {
        await createTables();

        const [, payload, online] = await Promise.all([
          syncAuthDeviceProfile(),
          getCurrentUser(),
          isBackendOnline(),
        ]);

        setIsOnline(online);

        if (payload?.user) {
          setUser(payload.user);
          setSession(payload.session || null);

          if (online) {
            await validateSessionOnline(payload);
          } else {
            updateAuthStatus(SESSION_STATES.OFFLINE_VALID, 'Offline. Using cached authenticated session.', 'OFFLINE_AT_BOOT');
          }
        } else {
          setUser(null);
          setSession(null);
          updateAuthStatus(SESSION_STATES.UNAUTHENTICATED, 'Please login to continue.');
        }
      } catch {
        setUser(null);
        setSession(null);
        updateAuthStatus(SESSION_STATES.UNAUTHENTICATED, 'Failed to restore saved session. Please login again.', 'RESTORE_FAILED');
      } finally {
        setAuthBooting(false);
      }
    };

    restoreAuth();
  }, [syncAuthDeviceProfile, updateAuthStatus, validateSessionOnline]);

  useEffect(() => {
    let cancelled = false;

    const checkConnectivity = async () => {
      const online = await isBackendOnline();
      if (cancelled) {
        return;
      }

      setIsOnline((prev) => {
        if (!prev && online) {
          Promise.resolve()
            .then(async () => {
              const current = await getCurrentUser();
              if (current?.user) {
                await validateSessionOnline(current);
              }
            })
            .catch(() => null);
        }
        return online;
      });
    };

    checkConnectivity();
    const timer = setInterval(checkConnectivity, 20000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [validateSessionOnline]);

  useEffect(() => {
    if (!user || !session?.token || !isOnline) {
      return;
    }

    const timer = setInterval(async () => {
      const current = await getCurrentUser();
      if (!current?.session?.token || !current.session.access_token || !current.session.refresh_token) {
        return;
      }

      if (!isLikelyExpired(current.session.access_expires_at, 60 * 1000)) {
        return;
      }

      try {
        await refreshSessionWithServer({
          sessionToken: current.session.token,
          refreshToken: current.session.refresh_token,
          fallbackUser: current.user,
        });
      } catch (error) {
        const refreshCode = String(error?.code || '');
        if (refreshCode === 'REFRESH_TOKEN_EXPIRED' || refreshCode === 'INVALID_REFRESH_TOKEN' || Number(error?.status) === 401) {
          await hardLogout({
            sessionToken: current.session.token,
            message: 'Session expired. Please login again.',
            reason: refreshCode || 'REFRESH_INVALID_FORCE_LOGOUT',
          });
        }
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [hardLogout, isOnline, refreshSessionWithServer, session?.token, user]);

  const persistOnlineSession = useCallback(async ({ serverPayload, rememberMe = false, statusMessage = 'Login successful.' } = {}) => {
    const localPayload = await saveAuthenticatedUserSession({
      user: serverPayload?.user,
      rememberMe: Boolean(rememberMe),
      serverTokens: toServerTokenShape(serverPayload),
      authMode: 'hybrid',
      serverStatus: 'ok',
      syncPending: false,
    });

    setUser(mergeLocalAndServerUser(localPayload.user, serverPayload?.user || null));
    setSession(localPayload.session || null);
    updateAuthStatus(SESSION_STATES.ONLINE_VALID, statusMessage);

    await setAuthDeviceProfile({
      preferredEmail: serverPayload?.user?.email || localPayload?.user?.email || null,
      pinEnabled: Boolean(serverPayload?.user?.pinEnabled),
    });
    await syncAuthDeviceProfile();

    return localPayload?.user || null;
  }, [syncAuthDeviceProfile, updateAuthStatus]);

  const login = useCallback(async (email, pin, options = {}) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for login.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    const rememberMe = Boolean(options?.rememberMe);
    const profile = await getAuthDeviceProfile();

    const serverPayload = await loginOnline({
      email,
      pin,
      rememberMe,
      deviceId: profile?.deviceId || null,
    });
    if (!serverPayload?.accessToken || !serverPayload?.refreshToken || !serverPayload?.user) {
      const error = new Error('Login response is incomplete. Please try again.');
      error.code = 'AUTH_INVALID_LOGIN_RESPONSE';
      throw error;
    }

    return persistOnlineSession({
      serverPayload,
      rememberMe,
      statusMessage: 'Login successful.',
    });
  }, [persistOnlineSession]);

  const signup = useCallback(async (email, pin, options = {}) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for signup.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    const rememberMe = Boolean(options?.rememberMe);
    const signupPayload = await signupOnline({ email, pin, rememberMe });

    if (signupPayload?.verificationRequired) {
      await setAuthDeviceProfile({
        preferredEmail: signupPayload?.email || email,
        pinEnabled: false,
      });
      await syncAuthDeviceProfile();
      updateAuthStatus(SESSION_STATES.UNAUTHENTICATED, 'Signup complete. Enter the code sent to your email.');

      return {
        verificationRequired: true,
        email: signupPayload?.email || email,
        emailDelivery: signupPayload?.emailDelivery || null,
      };
    }

    if (!signupPayload?.accessToken || !signupPayload?.refreshToken || !signupPayload?.user) {
      const error = new Error('Signup response is incomplete. Please try again.');
      error.code = 'AUTH_INVALID_SIGNUP_RESPONSE';
      throw error;
    }

    return persistOnlineSession({
      serverPayload: signupPayload,
      rememberMe,
      statusMessage: 'Signup successful.',
    });
  }, [persistOnlineSession, syncAuthDeviceProfile, updateAuthStatus]);

  const requestEmailVerification = useCallback(async (email) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for email verification.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    const payload = await requestEmailVerificationOnline({ email });
    await setAuthDeviceProfile({ preferredEmail: email });
    await syncAuthDeviceProfile();

    return payload;
  }, [syncAuthDeviceProfile]);

  const verifyEmailCode = useCallback(async ({ email, verificationCode, rememberMe = false }) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required to verify email code.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    const payload = await verifyEmailCodeOnline({ email, verificationCode, rememberMe });
    if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
      const error = new Error('Verification succeeded but login data is missing.');
      error.code = 'AUTH_INVALID_VERIFY_RESPONSE';
      throw error;
    }

    return persistOnlineSession({
      serverPayload: payload,
      rememberMe,
      statusMessage: 'Email verified and login successful.',
    });
  }, [persistOnlineSession]);

  const loginWithPin = useCallback(async ({ pin, email = null, rememberMe = true } = {}) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for PIN login.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    const profile = await getAuthDeviceProfile();
    const selectedEmail = String(email || profile?.preferredEmail || '').trim();
    if (!selectedEmail) {
      const error = new Error('Email is required for PIN login.');
      error.code = PIN_LOGIN_EMAIL_REQUIRED_CODE;
      throw error;
    }

    const payload = await loginWithPinOnline({
      email: selectedEmail,
      pin,
      deviceId: profile?.deviceId || null,
      rememberMe,
    });

    if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
      const error = new Error('PIN login response is incomplete.');
      error.code = 'AUTH_INVALID_PIN_LOGIN_RESPONSE';
      throw error;
    }

    return persistOnlineSession({
      serverPayload: payload,
      rememberMe,
      statusMessage: 'PIN login successful.',
    });
  }, [persistOnlineSession]);

  const setupPin = useCallback(async ({ pin, trustDevice = true } = {}) => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      const error = new Error('Active authenticated session is required.');
      error.code = 'NO_ACTIVE_SESSION';
      throw error;
    }

    const profile = await getAuthDeviceProfile();
    const result = await setupPinOnline({
      accessToken,
      pin,
      deviceId: profile?.deviceId || null,
      trustDevice,
    });

    await setAuthDeviceProfile({
      preferredEmail: user?.email || profile?.preferredEmail || null,
      pinEnabled: true,
    });
    await syncAuthDeviceProfile();
    updateAuthStatus(SESSION_STATES.ONLINE_VALID, 'PIN setup completed.');

    return result;
  }, [session?.access_token, syncAuthDeviceProfile, updateAuthStatus, user?.email]);

  const logout = useCallback(async () => {
    const online = await isBackendOnline();

    if (online && session?.refresh_token) {
      try {
        await logoutOnline({ refreshToken: session.refresh_token });
      } catch {
        // local logout always continues even when server revoke fails
      }
    }

    await logoutCurrentUser({ sessionToken: session?.token || null });
    setUser(null);
    setSession(null);
    updateAuthStatus(SESSION_STATES.UNAUTHENTICATED, 'You have been logged out.');
    await syncAuthDeviceProfile();
  }, [session?.refresh_token, session?.token, syncAuthDeviceProfile, updateAuthStatus]);

  const requestPinRecovery = useCallback(async (email) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for account recovery.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    return requestPinRecoveryOnline({ email });
  }, []);

  const resetPin = useCallback(async ({ resetToken, newPin }) => {
    const online = await isBackendOnline();
    setIsOnline(online);

    if (!online) {
      const error = new Error('Internet connection is required for PIN reset.');
      error.code = ONLINE_AUTH_REQUIRED_CODE;
      throw error;
    }

    return resetPinOnline({ resetToken, newPin });
  }, []);

  const updatePin = useCallback(async ({ currentPin, newPin }) => {
    const accessToken = session?.access_token;
    const sessionToken = session?.token;
    if (!accessToken || !sessionToken) {
      const error = new Error('Active authenticated session is required.');
      error.code = 'NO_ACTIVE_SESSION';
      throw error;
    }

    await updatePinOnline({
      accessToken,
      currentPin,
      newPin,
    });

    await hardLogout({
      sessionToken,
      message: 'PIN updated. Please login again.',
      reason: 'PIN_UPDATED',
    });

    await setAuthDeviceProfile({ pinEnabled: false });
    await syncAuthDeviceProfile();
  }, [hardLogout, session?.access_token, session?.token, syncAuthDeviceProfile]);

  const requestPasswordRecovery = requestPinRecovery;
  const resetPassword = useCallback(async ({ resetToken, newPassword }) => {
    return resetPin({ resetToken, newPin: newPassword });
  }, [resetPin]);
  const updatePassword = useCallback(async ({ currentPassword, newPassword }) => {
    return updatePin({ currentPin: currentPassword, newPin: newPassword });
  }, [updatePin]);

  const value = useMemo(
    () => ({
      user,
      session,
      isAuthenticated: Boolean(user),
      isOnline,
      authDeviceProfile,
      authStatus,
      authBooting,
      login,
      loginWithPin,
      signup,
      requestEmailVerification,
      verifyEmailCode,
      requestPinRecovery,
      resetPin,
      updatePin,
      requestPasswordRecovery,
      resetPassword,
      updatePassword,
      setupPin,
      logout,
    }),
    [
      authBooting,
      authDeviceProfile,
      authStatus,
      isOnline,
      login,
      loginWithPin,
      logout,
      requestEmailVerification,
      requestPinRecovery,
      requestPasswordRecovery,
      resetPin,
      resetPassword,
      session,
      setupPin,
      signup,
      updatePin,
      updatePassword,
      user,
      verifyEmailCode,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
