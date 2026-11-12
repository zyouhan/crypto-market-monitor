"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StrategyStatsPanel } from "../components/StrategyStatsPanel";
import { NotesDock } from "../components/NotesDock";
import { api } from "../lib/api";

export default function StrategyStatsPage() {
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
    <main className="page">
      <header className="page-top">
        <div className="brand">
          <h1>Crypto Market Monitor</h1>
          <p>策略统计与复盘</p>
        </div>

        <div className="top-actions">
          <Link className="button" href="/">
            返回监控
          </Link>
        </div>
      </header>

      <StrategyStatsPanel pageMode onChanged={() => undefined} />

      <NotesDock />
    </main>
  );
}
