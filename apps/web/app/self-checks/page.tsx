"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NotesDock } from "../components/NotesDock";
import { SelfCheckDock } from "../components/SelfCheckDock";
import { SelfCheckMonitor } from "../components/SelfCheckMonitor";
import { SelfCheckRecords } from "../components/SelfCheckRecords";
import { api } from "../lib/api";

export default function SelfCheckRecordsPage() {
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
          <p>开单记录与复盘</p>
        </div>
        <div className="top-actions">
          <a className="button" href="/">
            返回监控
          </a>
          <a className="button" href="/trades">
            交易记录
            <span className="nav-badge">心态监控</span>
          </a>
          <a className="button" href="/cases">
            交易案例
          </a>
          <a className="button" href="/stats">
            策略统计
          </a>
        </div>
      </header>

      <SelfCheckMonitor />
      <SelfCheckRecords />
      <SelfCheckDock />
      <NotesDock />
    </main>
  );
}
