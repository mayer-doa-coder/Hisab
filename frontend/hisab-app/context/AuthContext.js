import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createTables,
  getCurrentUser,
  loginUser,
  logoutCurrentUser,
  signupUser,
} from '../database/db';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authBooting, setAuthBooting] = useState(true);

  useEffect(() => {
    const restoreAuth = async () => {
      try {
        await createTables();
        const payload = await getCurrentUser();

        if (payload?.user) {
          setUser(payload.user);
          setSession(payload.session || null);
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
  }, []);

  const login = useCallback(async (email, password, options = {}) => {
    const payload = await loginUser({
      email,
      password,
      rememberMe: Boolean(options?.rememberMe),
    });

    setUser(payload?.user || null);
    setSession(payload?.session || null);

    return payload?.user || null;
  }, []);

  const signup = useCallback(async (email, password, options = {}) => {
    const payload = await signupUser({
      email,
      password,
      rememberMe: Boolean(options?.rememberMe),
    });

    setUser(payload?.user || null);
    setSession(payload?.session || null);

    return payload?.user || null;
  }, []);

  const logout = useCallback(async () => {
    await logoutCurrentUser();
    setUser(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isAuthenticated: Boolean(user),
      authBooting,
      login,
      signup,
      logout,
    }),
    [authBooting, login, logout, session, signup, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
