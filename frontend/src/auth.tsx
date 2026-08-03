import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { api, clearToken, getToken, setToken, User } from "./api";

WebBrowser.maybeCompleteAuthSession();

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

// Guard against double session-exchange from re-mount or hot-link
const sentSessionIds = new Set<string>();

function extractSessionId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const m = rawUrl.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function registerPushForUser(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    let status = perms.status;
    if (status !== "granted" && perms.canAskAgain !== false) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.registerPush({
      user_id: userId,
      platform: Platform.OS,
      device_token: tokenResp.data,
    });
  } catch {
    // Non-fatal — push notifications are best-effort
  }
}

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
      // Fire and forget
      registerPushForUser(me.id);
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

  // Handle session_id from web URL (?session_id or #session_id) or deep link
  useEffect(() => {
    const processUrl = async (rawUrl: string | null | undefined) => {
      const sid = extractSessionId(rawUrl);
      if (!sid || sentSessionIds.has(sid)) return;
      sentSessionIds.add(sid);
      try {
        const res = await api.sessionExchange(sid);
        await setToken(res.session_token);
        setUser(res.user);
        registerPushForUser(res.user.id);
        // Clean the URL on web
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          const cleanHash = url.hash.replace(/(^#|&)session_id=[^&]+/, "").replace(/^&/, "#");
          window.history.replaceState(window.history.state, "", url.pathname + url.search + cleanHash);
        }
      } catch {
        // ignore
      }
    };

    // Web: check current URL
    if (Platform.OS === "web" && typeof window !== "undefined") {
      processUrl(window.location.href);
    } else {
      // Mobile: cold start
      Linking.getInitialURL().then(processUrl);
    }
    // Hot links
    const sub = Linking.addEventListener("url", (e) => processUrl(e.url));
    return () => sub.remove();
  }, []);

  const signup = useCallback(async (name: string, username: string, email: string, password: string) => {
    const res = await api.signup({ name, username, email, password });
    await setToken(res.access_token);
    setUser(res.user);
    registerPushForUser(res.user.id);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await setToken(res.access_token);
    setUser(res.user);
    registerPushForUser(res.user.id);
  }, []);

  const googleLogin = useCallback(async () => {
    // Real Emergent Google Auth via WebBrowser (also works in web preview)
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.location.href = authUrl;
      }
      return;
    }
    // Register url listener BEFORE opening
    let deepLinkUrl: string | null = null;
    const sub = Linking.addEventListener("url", (e) => {
      if (!deepLinkUrl) deepLinkUrl = e.url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      const resultUrl = (result as any).url as string | undefined;
      const raw = resultUrl || deepLinkUrl || (await Linking.getInitialURL());
      const sid = extractSessionId(raw);
      if (!sid || sentSessionIds.has(sid)) return;
      sentSessionIds.add(sid);
      const res = await api.sessionExchange(sid);
      await setToken(res.session_token);
      setUser(res.user);
      registerPushForUser(res.user.id);
    } finally {
      sub.remove();
    }
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
    } catch { /* noop */ }
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
