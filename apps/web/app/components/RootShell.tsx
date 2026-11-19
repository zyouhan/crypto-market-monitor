"use client";

import type { ReactNode } from "react";

import { AppShell } from "./AppShell";
import { AuthProvider, useAuth } from "./AuthProvider";
import { LoginCard } from "./LoginCard";
import { MonitorRuntimeProvider } from "./MonitorRuntimeProvider";

function AuthenticatedShell({
  children
}: {
  children: ReactNode;
}) {
  const auth = useAuth();

  if (auth.checking) {
    return (
      <main className="login-page">
        <div>正在检查登录状态...</div>
      </main>
    );
  }

  if (!auth.authenticated) {
    return (
      <LoginCard
        loading={auth.loading}
        error={auth.error}
        onLogin={auth.login}
      />
    );
  }

  return (
    <MonitorRuntimeProvider>
      <AppShell>{children}</AppShell>
    </MonitorRuntimeProvider>
  );
}

export function RootShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AuthProvider>
  );
}
