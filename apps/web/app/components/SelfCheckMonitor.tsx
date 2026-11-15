"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";

const INTERVALS = ["5m", "15m", "1h", "4h"] as const;

interface IntervalSnapshot {
  interval: string;
  trend: "up" | "down";
  strength: "强" | "中" | "弱" | "拐头";
  j: number | null;
  demand: "上涨需求" | "下跌需求" | null;
  error: string | null;
}

interface ActiveSelfCheck {
  id: number;
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  stop_condition: string;
  snapshot: IntervalSnapshot[] | null;
  live?: IntervalSnapshot[] | null;
  created_at: number;
}

function formatJ(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(2) : "--";
}

function tagTone(snapshot: IntervalSnapshot): string {
  if (snapshot.demand === "上涨需求") {
    return "bull";
  }

  if (snapshot.demand === "下跌需求") {
    return "bear";
  }

  return snapshot.trend === "up" ? "bull-soft" : "bear-soft";
}

export function SelfCheckMonitor() {
  const [items, setItems] = useState<ActiveSelfCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true);
    }

    try {
      const data = await api<ActiveSelfCheck[]>(
        "/api/self-checks/live"
      );
      setItems(data);
      setError("");
    } catch (loadError) {
      if (initial) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (initial) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        void load();
      }
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  return (
    <section className="panel self-check-monitor-panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">开单监控</div>
          <div className="panel-subtitle">
            持仓中的开单自查，最多同时 2 条
          </div>
        </div>
        <span className="self-check-monitor-count">
          {items.length} / 2
        </span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="empty">暂无持仓中的开单自查</div>
      ) : (
        <div className="self-check-monitor-grid">
          {items.map((item) => {
            const snapshots = item.live ?? item.snapshot ?? [];
            const target = snapshots.find(
              (snapshot) =>
                snapshot.interval === item.target_interval
            );

            return (
              <article
                className={`self-check-monitor-card ${
                  item.direction === "BULL" ? "bull" : "bear"
                }`}
                key={item.id}
              >
                <div className="self-check-monitor-head">
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>
                      {item.direction === "BULL" ? "做多" : "做空"} · 目标{" "}
                      {item.target_interval}
                    </span>
                  </div>
                  <span className="self-check-monitor-time">
                    {formatTime(item.created_at)}
                  </span>
                </div>

                <div className="self-check-monitor-target">
                  <span>目标 J</span>
                  <strong>{formatJ(target?.j)}</strong>
                  {target?.demand && (
                    <span
                      className={`self-check-j-tag ${tagTone(target)}`}
                    >
                      {target.trend === "up" ? "向上" : "向下"} ·{" "}
                      {target.strength} · {target.demand}
                    </span>
                  )}
                </div>

                <div className="self-check-j-tags">
                  {INTERVALS.map((interval) => {
                    const snapshot = snapshots.find(
                      (entry) => entry.interval === interval
                    );

                    if (!snapshot) {
                      return null;
                    }

                    return (
                      <span
                        className={`self-check-j-tag ${tagTone(
                          snapshot
                        )} ${
                          interval === item.target_interval
                            ? "target"
                            : ""
                        }`}
                        key={interval}
                      >
                        {interval}{" "}
                        {snapshot.error
                          ? "数据失败"
                          : `${snapshot.trend === "up" ? "向上" : "向下"} · ${
                              snapshot.strength
                            } · J ${formatJ(snapshot.j)}${
                              snapshot.demand
                                ? ` · ${snapshot.demand}`
                                : ""
                            }`}
                      </span>
                    );
                  })}
                </div>

                <div className="self-check-monitor-stop">
                  止损：{item.stop_condition}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
