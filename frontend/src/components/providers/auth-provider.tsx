"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, refreshSession, setAccessToken, setSessionExpiredHandler, type AuthPayload } from "@/lib/api";
import type { User } from "@/lib/types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Restores the session from the refresh cookie on load and keeps the access token in memory only. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUserState] = useState<User | null>(null);

  const apply = useCallback((payload: AuthPayload | null) => {
    setAccessToken(payload?.accessToken ?? null);
    setUserState(payload?.user ?? null);
    setStatus(payload ? "authenticated" : "anonymous");
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession().then((p) => active && apply(p));
    setSessionExpiredHandler(() => {
      apply(null);
      queryClient.clear();
    });
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, [apply, queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const p = await api<AuthPayload>("/auth/login", { method: "POST", body: { email, password }, anonymous: true });
      apply(p);
      return p.user;
    },
    [apply],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const p = await api<AuthPayload>("/auth/register", { method: "POST", body: { name, email, password }, anonymous: true });
      apply(p);
      return p.user;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST", anonymous: true }).catch(() => undefined);
    apply(null);
    queryClient.clear();
  }, [apply, queryClient]);

  const value = useMemo(() => ({ status, user, login, register, logout, setUser: setUserState }), [status, user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
