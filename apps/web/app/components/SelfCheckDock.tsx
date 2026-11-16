"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  notifySelfCheckChanged,
  SELF_CHECK_CHANGED_EVENT
} from "../lib/self-check-events";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h"] as const;
const MAX_ACTIVE = 2;

interface SelfCheckItem {
  id: number;
}

interface CreateForm {
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  stop_condition: string;
  note: string;
}

const EMPTY_FORM: CreateForm = {
  symbol: "",
  direction: "BULL",
  target_interval: "15m",
  stop_condition: "",
  note: ""
};

export function SelfCheckDock() {
  const [items, setItems] = useState<SelfCheckItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadActive = useCallback(async () => {
    setLoading(true);

    try {
      const data = await api<SelfCheckItem[]>("/api/self-checks");
      setItems(data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

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

  async function createCheck(): Promise<void> {
    if (saving) {
      return;
    }

    if (items.length >= MAX_ACTIVE) {
      setError("最多同时保留 2 条持仓中的开单自查");
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
          stop_condition: form.stop_condition,
          note: form.note
        })
      });
      setForm(EMPTY_FORM);
      setOpen(false);
      await loadActive();
      notifySelfCheckChanged();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  const limitReached = items.length >= MAX_ACTIVE;

  return (
    <>
      <button
        type="button"
        className="self-check-fab"
        aria-label="新建开单自查"
        onClick={() => {
          setOpen(true);
          setForm(EMPTY_FORM);
          setError("");
          void loadActive();
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
                <h2>新建开单自查</h2>
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

            {loading ? (
              <div className="empty">加载中…</div>
            ) : limitReached ? (
              <div className="self-check-limit">
                <strong>最多同时保留 2 条持仓中的开单自查</strong>
                <p>
                  请先到「开单记录」页关闭一条持仓，再新建。
                </p>
                <button
                  type="button"
                  className="button small"
                  onClick={() => setOpen(false)}
                >
                  知道了
                </button>
              </div>
            ) : (
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
                  <AutoGrowTextarea
                    value={form.stop_condition}
                    maxLength={1000}
                    placeholder="例如：跌破 62000 止损"
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        stop_condition: value
                      }))
                    }
                  />
                </label>
                <label>
                  备注（可选）
                  <AutoGrowTextarea
                    value={form.note}
                    maxLength={1000}
                    placeholder="记录开单理由或计划"
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        note: value
                      }))
                    }
                  />
                </label>
                <div className="note-form-actions">
                  <button
                    type="button"
                    className="button small"
                    disabled={saving}
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="button small primary"
                    disabled={saving || limitReached}
                    onClick={() => void createCheck()}
                  >
                    {saving ? "创建中…" : "创建自查"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
