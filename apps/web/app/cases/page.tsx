"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CasesPanel } from "../components/CasesPanel";
import { NotesDock } from "../components/NotesDock";
import { api } from "../lib/api";

export default function CasesPage() {
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
          <p>交易案例与复盘截图</p>
        </div>

        <div className="top-actions">
          <a className="button" href="/">
            返回监控
          </a>
          <a className="button" href="/stats">
            策略统计
          </a>
        </div>
      </header>

      <CasesPanel />
      <NotesDock />
    </main>
  );
}
