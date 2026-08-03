import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken, User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  signup: (name: string, username: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  resetPassword: (email: string, newPassword: string) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signup = useCallback(async (name: string, username: string, email: string, password: string) => {
    const res = await api.signup({ name, username, email, password });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const googleLogin = useCallback(async () => {
    // Mock Google login (Emergent-managed OAuth is deploy-only). Creates a demo Google user.
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    const res = await api.googleLogin({
      email: `googledemo${suffix}@cleanrewards.com`,
      name: "Google Demo",
      picture: "",
    });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const resetPassword = useCallback(async (email: string, newPassword: string) => {
    const r = await api.resetPassword({ email, new_password: newPassword });
    return r.message;
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      /* noop */
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signup, login, googleLogin, resetPassword, logout, refresh }),
    [user, loading, signup, login, googleLogin, resetPassword, logout, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
