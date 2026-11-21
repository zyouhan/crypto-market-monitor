"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { AppShell } from "./AppShell";
import { AuthProvider, useAuth } from "./AuthProvider";
import { ConfirmProvider } from "./ConfirmDialog";
import { LoginCard } from "./LoginCard";
import { MonitorRuntimeProvider } from "./MonitorRuntimeProvider";

function restoreFocusAfterWindowActivation(): void {
  if (document.hasFocus()) {
    return;
  }

  window.focus();
}

function useWindowFocusRestore(): void {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (document.hasFocus()) {
        return;
      }

      restoreFocusAfterWindowActivation();

      const target = event.target;

      if (target instanceof HTMLElement) {
        const focusable = target.closest<HTMLElement>(
          "input, textarea, select, button, [tabindex]"
        );

        if (focusable) {
          window.setTimeout(() => focusable.focus(), 0);
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true
      );
    };
  }, []);
}

function AuthenticatedShell({
  children
}: {
  children: ReactNode;
}) {
  const auth = useAuth();

  useWindowFocusRestore();

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
      <ConfirmProvider>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </ConfirmProvider>
    </AuthProvider>
  );
}
