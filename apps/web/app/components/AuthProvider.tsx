"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import { api, errorMessage } from "../lib/api";

interface AuthContextValue {
  checking: boolean;
  authenticated: boolean;
  loading: boolean;
  error: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void api("/api/auth/me")
      .then(() => {
        if (active) {
          setAuthenticated(true);
        }
      })
      .catch(() => {
        if (active) {
          setAuthenticated(false);
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError("");

      try {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        setAuthenticated(true);
      } catch (loginError) {
        const message = errorMessage(loginError);
        setError(message);
        throw loginError;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setError("");
    }
  }, []);

  const value = useMemo(
    () => ({
      checking,
      authenticated,
      loading,
      error,
      login,
      logout
    }),
    [checking, authenticated, loading, error, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
