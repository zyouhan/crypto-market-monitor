"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import {
  emaArrangementLabel,
  emaArrangementTone,
  formatDurationMinutes,
  intervalLabel,
  kdjText,
  macdText,
  mergeSnapshots,
  scenarioLabel,
  spreadLabel,
  spreadTone,
  trendStrengthLabel,
  trendStrengthOf,
  volumeText
} from "../lib/self-check";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  notifySelfCheckChanged,
  requestSelfCheckCreate,
  SELF_CHECK_CHANGED_EVENT
} from "../lib/self-check-events";
import type { SelfCheckIntervalSnapshot } from "../types";

type TradeQuality = "excellent" | "good" | "fair" | "poor";

const QUALITY_OPTIONS: Array<{
  value: TradeQuality;
  label: string;
}> = [
  { value: "excellent", label: "优" },
  { value: "good", label: "良" },
  { value: "fair", label: "中" },
  { value: "poor", label: "差" }
];

interface CloseForm {
  pnl: string;
  open_quality: TradeQuality;
  close_quality: TradeQuality;
  take_profit_quality: TradeQuality;
  stop_loss_quality: TradeQuality;
  note: string;
}

const EMPTY_CLOSE_FORM: CloseForm = {
  pnl: "",
  open_quality: "good",
  close_quality: "good",
  take_profit_quality: "good",
  stop_loss_quality: "good",
  note: ""
};

interface ActiveSelfCheck {
  id: number;
  symbol: string;
  direction: "BULL" | "BEAR";
  target_interval: string;
  scenario: string | null;
  stop_condition: string;
  snapshot: SelfCheckIntervalSnapshot[] | null;
  live?: SelfCheckIntervalSnapshot[] | null;
  close_note: string | null;
  created_at: number;
}

function LevelStats({
  snapshot,
  compact = false
}: {
  snapshot: SelfCheckIntervalSnapshot | null | undefined;
  compact?: boolean;
}) {
  if (!snapshot) {
    return (
      <div className="self-check-level-neutral">数据不足</div>
    );
  }

  const duration =
    typeof snapshot.ema_duration_minutes === "number"
      ? `运行 ${formatDurationMinutes(
          snapshot.ema_duration_minutes
        )}`
      : "时长未知";

  return (
    <>
      <div
        className={`self-check-level-tags ${
          compact ? "compact" : ""
        }`}
      >
        <span
          className={`self-check-ema-tag ${emaArrangementTone(
            snapshot
          )}`}
        >
          {emaArrangementLabel(snapshot)}
        </span>
        <span className="self-check-duration-tag">
          {duration}
        </span>
        <span
          className={`self-check-spread-tag ${spreadTone(
            snapshot
          )}`}
        >
          {spreadLabel(snapshot)}
        </span>
        <span
          className={`self-check-strength-tag ${trendStrengthOf(
            snapshot
          )}`}
        >
          {trendStrengthLabel(snapshot)}
        </span>
      </div>
      <div className="self-check-level-extra">
        {kdjText(snapshot)} · {macdText(snapshot)} ·{" "}
        {volumeText(snapshot)}
      </div>
      {snapshot.error && (
        <div className="self-check-analysis-error">
          {snapshot.error}
        </div>
      )}
    </>
  );
}

export function SelfCheckMonitor() {
  const [items, setItems] = useState<ActiveSelfCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<ActiveSelfCheck | null>(
    null
  );
  const [closeForm, setCloseForm] =
    useState<CloseForm>(EMPTY_CLOSE_FORM);
  const [closingSaving, setClosingSaving] = useState(false);
  const [editing, setEditing] =
    useState<ActiveSelfCheck | null>(null);
  const [editStop, setEditStop] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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

  async function saveEdit(): Promise<void> {
    if (!editing || editSaving) {
      return;
    }

    if (!editStop.trim()) {
      setError("请输入止损条件");
      return;
    }

    setEditSaving(true);
    setError("");

    try {
      await api(`/api/self-checks/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          stop_condition: editStop,
          note: editNote
        })
      });
      setEditing(null);
      await load();
      notifySelfCheckChanged();
    } catch (editError) {
      setError(errorMessage(editError));
    } finally {
      setEditSaving(false);
    }
  }

  async function closeCheck(): Promise<void> {
    if (!closing || closingSaving) {
      return;
    }

    if (closeForm.pnl.trim() === "") {
      setError("请输入收益");
      return;
    }

    const pnl = Number(closeForm.pnl);

    if (!Number.isFinite(pnl)) {
      setError("收益必须是有效数字");
      return;
    }

    setClosingSaving(true);
    setError("");

    try {
      await api(`/api/self-checks/${closing.id}/close`, {
        method: "POST",
        body: JSON.stringify({
          pnl,
          open_quality: closeForm.open_quality,
          close_quality: closeForm.close_quality,
          take_profit_quality: closeForm.take_profit_quality,
          stop_loss_quality: closeForm.stop_loss_quality,
          note: closeForm.note
        })
      });
      setClosing(null);
      setCloseForm(EMPTY_CLOSE_FORM);
      await load();
      notifySelfCheckChanged();
    } catch (closeError) {
      setError(errorMessage(closeError));
    } finally {
      setClosingSaving(false);
    }
  }

  function openCloseForm(item: ActiveSelfCheck): void {
    setClosing(item);
    setCloseForm({
      ...EMPTY_CLOSE_FORM,
      note: item.close_note ?? ""
    });
    setError("");
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
        <div className="self-check-monitor-head-actions">
          <span className="self-check-monitor-count">
            {items.length} / 2
          </span>
          <button
            type="button"
            className="button small primary"
            onClick={requestSelfCheckCreate}
          >
            + 开单
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="empty">暂无持仓中的开单自查</div>
      ) : (
        <div className="self-check-monitor-grid">
          {items.map((item) => {
            const snapshots = mergeSnapshots(
              item.snapshot,
              item.live
            );
            const target =
              snapshots.find(
                (snapshot) =>
                  snapshot.interval === item.target_interval
              ) ?? null;
            const otherLevels = snapshots.filter(
              (snapshot) =>
                snapshot.interval !== item.target_interval &&
                snapshot.interval !== "1m"
            );

            return (
              <article
                className={`self-check-monitor-card ${
                  item.direction === "BULL" ? "bull" : "bear"
                }`}
                key={item.id}
              >
                <div className="self-check-monitor-head">
                  <div className="self-check-monitor-title">
                    <strong>{item.symbol}</strong>
                    <span
                      className={`self-check-direction-tag ${
                        item.direction === "BULL" ? "bull" : "bear"
                      }`}
                    >
                      {item.direction === "BULL" ? "做多" : "做空"}
                    </span>
                  </div>
                  <span className="self-check-monitor-time">
                    {formatTime(item.created_at)}
                  </span>
                </div>

                <div className="self-check-scenario-line">
                  <span
                    className={`self-check-scenario-tag ${
                      item.direction === "BULL" ? "bull" : "bear"
                    }`}
                  >
                    {scenarioLabel(item.scenario)}
                  </span>
                </div>

                <div className="self-check-target-block">
                  <div className="self-check-target-label">
                    主目标 ·{" "}
                    {intervalLabel(item.target_interval)}
                  </div>
                  <div className="self-check-target-summary">
                    <LevelStats snapshot={target} />
                  </div>
                </div>

                {otherLevels.length > 0 ? (
                  <div className="self-check-level-grid">
                    {otherLevels.map((snapshot) => (
                      <div
                        className="self-check-level-card"
                        key={snapshot.interval}
                      >
                        <div className="self-check-level-top">
                          <b>
                            {intervalLabel(snapshot.interval)}
                          </b>
                        </div>
                        <LevelStats snapshot={snapshot} compact />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="self-check-level-neutral">
                    暂无其他级别数据
                  </div>
                )}

                <div className="self-check-monitor-stop">
                  止损：{item.stop_condition}
                </div>

                {item.close_note && (
                  <div className="self-check-monitor-note">
                    备注：{item.close_note}
                  </div>
                )}

                <div className="self-check-monitor-actions">
                  <button
                    type="button"
                    className="button small"
                    onClick={() => {
                      setEditing(item);
                      setEditStop(item.stop_condition);
                      setEditNote(item.close_note ?? "");
                      setError("");
                    }}
                  >
                    编辑止损/备注
                  </button>
                  <button
                    type="button"
                    className="button small primary"
                    onClick={() => openCloseForm(item)}
                  >
                    关闭开单
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          className="modal-backdrop self-check-close-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !editSaving
            ) {
              setEditing(null);
            }
          }}
        >
          <section className="modal self-check-close-modal">
            <div className="self-check-modal-head">
              <div>
                <h2>编辑止损和备注</h2>
                <p>
                  {editing.symbol} · {editing.target_interval}
                </p>
              </div>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="note-form">
              <label>
                止损条件
                <AutoGrowTextarea
                  value={editStop}
                  maxLength={1000}
                  onChange={setEditStop}
                />
              </label>
              <label>
                备注
                <AutoGrowTextarea
                  value={editNote}
                  maxLength={1000}
                  onChange={setEditNote}
                />
              </label>
              <div className="note-form-actions">
                <button
                  type="button"
                  className="button small"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button small primary"
                  disabled={editSaving}
                  onClick={() => void saveEdit()}
                >
                  {editSaving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
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

            <div className="self-check-close-meta">
              <span>
                开仓时间：{formatTime(closing.created_at)}
              </span>
              <span>清仓时间：现在</span>
            </div>

            <label className="self-check-close-pnl">
              收益（USDT）
              <input
                type="number"
                step="any"
                value={closeForm.pnl}
                placeholder="盈利填正数，亏损填负数"
                onChange={(event) =>
                  setCloseForm((current) => ({
                    ...current,
                    pnl: event.target.value
                  }))
                }
              />
            </label>

            <div className="self-check-close-qualities">
              {[
                ["open_quality", "开仓时机"],
                ["close_quality", "清仓时机"],
                ["take_profit_quality", "止盈"],
                ["stop_loss_quality", "止损"]
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    value={
                      closeForm[key as keyof CloseForm] as string
                    }
                    onChange={(event) =>
                      setCloseForm((current) => ({
                        ...current,
                        [key]: event.target.value
                      }))
                    }
                  >
                    {QUALITY_OPTIONS.map((option) => (
                      <option
                        value={option.value}
                        key={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="self-check-close-rule">
              任意一项为「差」或三项及以上为「中」判定失败，否则判定成功；
              成功/失败不受盈亏影响。
            </div>

            <label className="self-check-note-label">
              备注（可选）
              <AutoGrowTextarea
                value={closeForm.note}
                maxLength={1000}
                placeholder="记录平仓原因或复盘"
                onChange={(value) =>
                  setCloseForm((current) => ({
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
