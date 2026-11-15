"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import {
  notifySelfCheckChanged,
  SELF_CHECK_CHANGED_EVENT
} from "../lib/self-check-events";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"] as const;
const MAX_ACTIVE = 2;

interface IntervalSnapshot {
  interval: string;
  trend: "up" | "down";
  strength: "强" | "中" | "弱" | "拐头";
  strength_pct: number;
  j: number | null;
  k: number | null;
  d: number | null;
  demand: "上涨需求" | "下跌需求" | null;
  source: string | null;
  time: number | null;
  error: string | null;
}

interface SelfCheckItem {
  id: number;
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  stop_condition: string;
  snapshot: IntervalSnapshot[] | null;
  live?: IntervalSnapshot[] | null;
  status: "active" | "closed";
  result: "success" | "failed" | null;
  close_note: string | null;
  closed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface CreateForm {
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  stop_condition: string;
}

const EMPTY_FORM: CreateForm = {
  symbol: "",
  direction: "BULL",
  target_interval: "15m",
  stop_condition: ""
};

export function SelfCheckDock() {
  const [items, setItems] = useState<SelfCheckItem[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<SelfCheckItem | null>(
    null
  );
  const [closeResult, setCloseResult] = useState<
    "success" | "failed"
  >("success");
  const [closeNote, setCloseNote] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);
  const requestIdRef = useRef(0);

  const loadActive = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const data = await api<SelfCheckItem[]>("/api/self-checks");

      if (requestId === requestIdRef.current) {
        setItems(data);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  useEffect(() => {
    if (open) {
      void loadActive();
    }
  }, [open, loadActive]);

  useEffect(() => {
    const handleChanged = () => {
      if (open) {
        void loadActive();
      }
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
  }, [open, loadActive]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let active = true;

    const refresh = async () => {
      if (document.hidden) {
        return;
      }

      try {
        const data = await api<SelfCheckItem[]>(
          "/api/self-checks/live"
        );

        if (active) {
          setItems(data);
        }
      } catch {
        // 保留上一次可用快照
      }
    };

    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    const handleVisibility = () => {
      if (!document.hidden) {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [items.length]);

  async function createCheck(): Promise<void> {
    if (saving) {
      return;
    }

    if (!form.symbol.trim()) {
      setError("请输入交易标的");
      return;
    }

    if (!form.stop_condition.trim()) {
      setError("请输入止损条件");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api("/api/self-checks", {
        method: "POST",
        body: JSON.stringify({
          symbol: form.symbol,
          direction: form.direction,
          target_interval: form.target_interval,
          stop_condition: form.stop_condition
        })
      });
      setForm(EMPTY_FORM);
      setMode("list");
      await loadActive();
      notifySelfCheckChanged();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function editStop(item: SelfCheckItem): Promise<void> {
    const next = window.prompt(
      "修改止损条件",
      item.stop_condition
    );

    if (next === null || !next.trim()) {
      return;
    }

    try {
      await api(`/api/self-checks/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ stop_condition: next })
      });
      await loadActive();
      notifySelfCheckChanged();
    } catch (updateError) {
      setError(errorMessage(updateError));
    }
  }

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
      await loadActive();
      notifySelfCheckChanged();
    } catch (closeError) {
      setError(errorMessage(closeError));
    } finally {
      setClosingSaving(false);
    }
  }

  function openCreate(): void {
    if (items.length >= MAX_ACTIVE) {
      setError("最多同时保留 2 条持仓中的开单自查");
      return;
    }

    setMode("create");
    setForm(EMPTY_FORM);
    setError("");
  }

  return (
    <>
      <button
        type="button"
        className="self-check-fab"
        aria-label="打开开单自查"
        onClick={() => {
          setOpen(true);
          setMode("list");
          setError("");
        }}
      >
        <span aria-hidden="true">✓</span>
        开单自查
      </button>


      {open && (
        <div
          className="modal-backdrop self-check-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <section className="modal self-check-modal">
            <div className="self-check-modal-head">
              <div>
                <h2>开单自查</h2>
                <p>
                  持仓中 {items.length} / {MAX_ACTIVE}
                </p>
              </div>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            {mode === "create" ? (
              <div className="note-form">
                <label>
                  标的
                  <input
                    value={form.symbol}
                    placeholder="例如 BTCUSDT"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        symbol: event.target.value.toUpperCase()
                      }))
                    }
                  />
                </label>
                <label>
                  开单方向
                  <select
                    value={form.direction}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        direction: event.target.value as
                          | "BULL"
                          | "BEAR"
                      }))
                    }
                  >
                    <option value="BULL">做多</option>
                    <option value="BEAR">做空</option>
                  </select>
                </label>
                <label>
                  目标级别
                  <select
                    value={form.target_interval}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        target_interval: event.target.value
                      }))
                    }
                  >
                    {INTERVALS.map((interval) => (
                      <option value={interval} key={interval}>
                        {interval}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  止损条件
                  <textarea
                    rows={4}
                    value={form.stop_condition}
                    placeholder="例如：跌破 62000 止损"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        stop_condition: event.target.value
                      }))
                    }
                  />
                </label>
                <div className="note-form-actions">
                  <button
                    type="button"
                    className="button small"
                    disabled={saving}
                    onClick={() => setMode("list")}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="button small primary"
                    disabled={saving}
                    onClick={() => void createCheck()}
                  >
                    {saving ? "创建中…" : "创建自查"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="self-check-list-toolbar">
                  <button
                    type="button"
                    className="button small primary"
                    disabled={
                      loading || items.length >= MAX_ACTIVE
                    }
                    onClick={openCreate}
                  >
                    + 新建自查
                  </button>
                  <span>
                    {items.length >= MAX_ACTIVE
                      ? "已满 2 条，关闭一条后才能新建"
                      : "最多同时 2 条"}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="empty">暂无持仓中的开单自查</div>
                ) : (
                  <div className="self-check-list">
                    {items.map((item) => (
                      <div className="self-check-list-row" key={item.id}>
                        <div>
                          <strong>{item.symbol}</strong>
                          <span>
                            {item.direction === "BULL" ? "做多" : "做空"} ·{" "}
                            {item.target_interval} ·{" "}
                            {formatTime(item.created_at)}
                          </span>
                        </div>
                        <div className="self-check-list-actions">
                          <button
                            type="button"
                            className="button small"
                            onClick={() => void editStop(item)}
                          >
                            修改止损
                          </button>
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
                            关闭
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
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
                <h2>关闭开单自查</h2>
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
    </>
  );
}
