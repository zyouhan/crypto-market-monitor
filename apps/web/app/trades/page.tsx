"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "../components/AppShell";
import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";
import { TradesPanel } from "../components/TradesPanel";
import { api } from "../lib/api";

export default function TradesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void api("/api/auth/me")
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          router.replace("/");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="login-page">
        <div>正在检查登录状态...</div>
      </main>
    );
  }

  return (
    <AppShell>
      <main className="page">
        <header className="page-top">
          <div className="brand">
            <h1>Crypto Market Monitor</h1>
            <p>交易记录与心态复盘</p>
          </div>
        </header>

        <TradesPanel />
        <SelfCheckDock />
        <NotesDock />
      </main>
    </AppShell>
  );
}
