import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createTables,
  enqueuePendingSyncItem,
  getCurrentUser,
  getPendingSyncItems,
  loginUser,
  markPendingSyncItemDone,
  markPendingSyncItemFailed,
  logoutCurrentUser,
  signupUser,
  updateSessionServerStatus,
  updateSessionTokens,
} from '../database/db';
import {
  fetchOnlineProfile,
  isBackendOnline,
  loginOnline,
  refreshOnlineToken,
  signupOnline,
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [syncingPending, setSyncingPending] = useState(false);

  const hardLogout = useCallback(async (sessionToken = null) => {
    await logoutCurrentUser({ sessionToken });
    setUser(null);
    setSession(null);
  }, []);

  const refreshSessionWithServer = useCallback(
    async ({ sessionToken, refreshToken, fallbackUser }) => {
      const refreshed = await refreshOnlineToken({ refreshToken });

      const updatedSession = await updateSessionTokens({
        sessionToken,
        ...toServerTokenShape(refreshed),
        authMode: 'hybrid',
        serverStatus: 'token-refreshed',
        syncPending: false,
      });

      setSession(updatedSession);
      setUser((prev) => ({ ...prev, ...(fallbackUser || {}), ...(refreshed?.user || {}) }));

      return updatedSession;
    },
    []
  );

  const validateSessionOnline = useCallback(
    async (currentPayload) => {
      if (!currentPayload?.user || !currentPayload?.session?.token) {
        return { valid: false, reason: 'NO_LOCAL_SESSION' };
      }

      const sessionToken = currentPayload.session.token;
      const accessToken = currentPayload.session.access_token;
      const refreshToken = currentPayload.session.refresh_token;

      if (!accessToken) {
        await updateSessionServerStatus({ sessionToken, serverStatus: 'local-only' });
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
        setUser((prev) => ({ ...prev, ...(currentPayload.user || {}), ...(profile?.user || {}) }));
        return { valid: true, mode: 'online' };
      } catch (error) {
        if (error?.isNetworkError) {
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
              await hardLogout(sessionToken);
              return { valid: false, reason: refreshCode || 'REFRESH_INVALID_FORCE_LOGOUT' };
            }

            if (refreshError?.isNetworkError) {
              return { valid: true, mode: 'offline-fallback', reason: 'NO_INTERNET' };
            }

            throw refreshError;
          }
        }

        if (isAccessExpired && !refreshToken) {
          await hardLogout(sessionToken);
          return { valid: false, reason: 'ACCESS_EXPIRED_NO_REFRESH' };
        }

        if (errorCode === 'INVALID_ACCESS_TOKEN') {
          await hardLogout(sessionToken);
          return { valid: false, reason: 'INVALID_ACCESS_TOKEN' };
        }

        throw error;
      }
    },
    [hardLogout, refreshSessionWithServer]
  );

  const syncPendingData = useCallback(async () => {
    try {
      setSyncingPending(true);
      const items = await getPendingSyncItems({ limit: 100, entityTypes: ['auth'], forCurrentUser: true });
      if (!items.length) {
        return 0;
      }

      let syncedCount = 0;
      for (const item of items) {
        if (item.entity_type === 'auth' && item.operation === 'session_verify') {
          const current = await getCurrentUser();
          if (!current?.session?.token) {
            await markPendingSyncItemDone(item.id);
            syncedCount += 1;
            continue;
          }

          const targetToken = String(item?.payload?.sessionToken || '');
          if (!targetToken || targetToken === current.session.token) {
            const validation = await validateSessionOnline(current);
            if (validation.valid) {
              await markPendingSyncItemDone(item.id);
              syncedCount += 1;
            } else {
              await markPendingSyncItemFailed({ id: item.id, errorMessage: validation.reason || 'Session validation failed' });
            }
          } else {
            await markPendingSyncItemDone(item.id);
            syncedCount += 1;
          }
        }
      }

      return syncedCount;
    } finally {
      setSyncingPending(false);
    }
  }, [validateSessionOnline]);

  useEffect(() => {
    const restoreAuth = async () => {
      try {
        await createTables();
        const payload = await getCurrentUser();
        const online = await isBackendOnline();
        setIsOnline(online);

        if (payload?.user) {
          setUser(payload.user);
          setSession(payload.session || null);

          if (online) {
            await validateSessionOnline(payload);
            await syncPendingData();
          }
        } else {
          setUser(null);
          setSession(null);
        }
      } catch {
        setUser(null);
        setSession(null);
      } finally {
        setAuthBooting(false);
      }
    };

    restoreAuth();
  }, [syncPendingData, validateSessionOnline]);

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
              await syncPendingData();
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
  }, [syncPendingData, validateSessionOnline]);

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
          await hardLogout(current.session.token);
        }
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [hardLogout, isOnline, refreshSessionWithServer, session?.token, user]);

  const login = useCallback(async (email, password, options = {}) => {
    let localPayload = null;
    let localLoginError = null;

    try {
      localPayload = await loginUser({
        email,
        password,
        rememberMe: Boolean(options?.rememberMe),
      });
    } catch (error) {
      localLoginError = error;
    }

    if (localPayload?.user) {
      setUser(localPayload.user);
      setSession(localPayload.session || null);
    }

    const online = await isBackendOnline();
    setIsOnline(online);

    if (!localPayload?.user && !online) {
      throw localLoginError || new Error('Invalid email or password.');
    }

    if (online) {
      try {
        const serverPayload = await loginOnline({ email, password });

        if (!localPayload?.user) {
          try {
            localPayload = await signupUser({
              email,
              password,
              rememberMe: Boolean(options?.rememberMe),
            });
          } catch {
            localPayload = await loginUser({
              email,
              password,
              rememberMe: Boolean(options?.rememberMe),
            });
          }

          setUser(localPayload?.user || null);
          setSession(localPayload?.session || null);
        }

        const updatedSession = await updateSessionTokens({
          sessionToken: localPayload?.session?.token,
          ...toServerTokenShape(serverPayload),
          authMode: 'hybrid',
          serverStatus: 'ok',
          syncPending: false,
        });

        setSession(updatedSession);
        setUser((prev) => ({ ...prev, ...(serverPayload?.user || {}) }));
      } catch (error) {
        if (!error?.isNetworkError && Number(error?.status) === 401 && !localPayload?.user) {
          throw error;
        }

        await updateSessionServerStatus({
          sessionToken: localPayload?.session?.token,
          serverStatus: !error?.isNetworkError && Number(error?.status) === 401 ? 'server-credential-mismatch' : 'offline-fallback',
        });

        await enqueuePendingSyncItem({
          entityType: 'auth',
          operation: 'session_verify',
          payload: { sessionToken: localPayload?.session?.token || null },
        });
      }
    } else {
      await enqueuePendingSyncItem({
        entityType: 'auth',
        operation: 'session_verify',
        payload: { sessionToken: localPayload?.session?.token || null },
      });
    }

    if (!localPayload?.user) {
      throw localLoginError || new Error('Invalid email or password.');
    }

    return localPayload.user;
  }, []);

  const signup = useCallback(async (email, password, options = {}) => {
    const localPayload = await signupUser({
      email,
      password,
      rememberMe: Boolean(options?.rememberMe),
    });

    setUser(localPayload?.user || null);
    setSession(localPayload?.session || null);

    const online = await isBackendOnline();
    setIsOnline(online);

    if (online) {
      try {
        const signupPayload = await signupOnline({ email, password });

        const updatedSession = await updateSessionTokens({
          sessionToken: localPayload?.session?.token,
          ...toServerTokenShape(signupPayload),
          authMode: 'hybrid',
          serverStatus: 'ok',
          syncPending: false,
        });

        setSession(updatedSession);
        setUser((prev) => ({ ...prev, ...(signupPayload?.user || {}) }));
      } catch (error) {
        await updateSessionServerStatus({
          sessionToken: localPayload?.session?.token,
          serverStatus: error?.isNetworkError ? 'offline-fallback' : 'server-signup-failed',
        });

        await enqueuePendingSyncItem({
          entityType: 'auth',
          operation: 'session_verify',
          payload: { sessionToken: localPayload?.session?.token || null },
        });
      }
    } else {
      await enqueuePendingSyncItem({
        entityType: 'auth',
        operation: 'session_verify',
        payload: { sessionToken: localPayload?.session?.token || null },
      });
    }

    return localPayload?.user || null;
  }, []);

  const logout = useCallback(async () => {
    await logoutCurrentUser({ sessionToken: session?.token || null });
    setUser(null);
    setSession(null);
  }, [session?.token]);

  const value = useMemo(
    () => ({
      user,
      session,
      isAuthenticated: Boolean(user),
      isOnline,
      syncingPending,
      authBooting,
      login,
      signup,
      logout,
    }),
    [authBooting, isOnline, login, logout, session, signup, syncingPending, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
