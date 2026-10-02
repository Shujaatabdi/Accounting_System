"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api/client";
import type { SessionUser } from "@/lib/auth/session";

type AuthState = {
  user: SessionUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      return;
    }
    const result = await api<{ user: SessionUser }>("/api/v1/auth/me");
    setUser(result.user);
  }

  useEffect(() => {
    refresh()
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  async function signIn(email: string, password: string) {
    const result = await api<{ token: string; user: SessionUser }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }

  async function signOut() {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
      setUser(null);
    }
  }

  return <AuthContext.Provider value={{ user, ready, refresh, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
