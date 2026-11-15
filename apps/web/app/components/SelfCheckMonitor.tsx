"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import {
  notifySelfCheckChanged,
  SELF_CHECK_CHANGED_EVENT
} from "../lib/self-check-events";

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
  const [closing, setClosing] = useState<ActiveSelfCheck | null>(
    null
  );
  const [closeResult, setCloseResult] = useState<
    "success" | "failed"
  >("success");
  const [closeNote, setCloseNote] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);

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
    const handleChanged = () => {
      void load();
    };

    window.addEventListener(
      SELF_CHECK_CHANGED_EVENT,
      handleChanged
    );

    return () => {
      window.removeEventListener(
        SELF_CHECK_CHANGED_EVENT,
        handleChanged
      );
    };
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

  async function closeCheck(): Promise<void> {
    if (!closing || closingSaving) {
      return;
    }

    setClosingSaving(true);
    setError("");

    try {
      await api(`/api/self-checks/${closing.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          result: closeResult,
          note: closeNote
        })
      });
      setClosing(null);
      setCloseNote("");
      setCloseResult("success");
      await load();
      notifySelfCheckChanged();
    } catch (closeError) {
      setError(errorMessage(closeError));
    } finally {
      setClosingSaving(false);
    }
  }

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

                <div className="self-check-monitor-actions">
                  <button
                    type="button"
                    className="button small primary"
                    onClick={() => {
                      setClosing(item);
                      setCloseResult("success");
                      setCloseNote("");
                      setError("");
                    }}
                  >
                    关闭开单
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {closing && (
        <div
          className="modal-backdrop self-check-close-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !closingSaving
            ) {
              setClosing(null);
            }
          }}
        >
          <section className="modal self-check-close-modal">
            <div className="self-check-modal-head">
              <div>
                <h2>关闭开单监控</h2>
                <p>
                  {closing.symbol} · {closing.target_interval}
                </p>
              </div>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setClosing(null)}
              >
                ×
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="self-check-result-row">
              <span>结果</span>
              <label>
                <input
                  type="radio"
                  checked={closeResult === "success"}
                  onChange={() => setCloseResult("success")}
                />
                成功
              </label>
              <label>
                <input
                  type="radio"
                  checked={closeResult === "failed"}
                  onChange={() => setCloseResult("failed")}
                />
                失败
              </label>
            </div>

            <label className="self-check-note-label">
              备注（可选）
              <textarea
                rows={4}
                value={closeNote}
                maxLength={1000}
                placeholder="记录平仓原因或复盘"
                onChange={(event) => setCloseNote(event.target.value)}
              />
            </label>

            <div className="note-form-actions">
              <button
                type="button"
                className="button small"
                disabled={closingSaving}
                onClick={() => setClosing(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button small primary"
                disabled={closingSaving}
                onClick={() => void closeCheck()}
              >
                {closingSaving ? "关闭中…" : "确认关闭"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
