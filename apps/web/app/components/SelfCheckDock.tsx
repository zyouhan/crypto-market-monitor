"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import {
  SELF_CHECK_ANALYSIS_INTERVALS,
  SELF_CHECK_SCENARIOS,
  emaArrangementLabel,
  emaArrangementTone,
  formatDurationMinutes,
  intervalLabel,
  kdjDetailText,
  macdText,
  scenarioDirection,
  scenarioDirectionLabel,
  sortSnapshots,
  spreadLabel,
  spreadTone,
  trendStrengthLabel,
  trendStrengthOf,
  volumeText,
  type SelfCheckScenarioValue
} from "../lib/self-check";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  notifySelfCheckChanged,
  SELF_CHECK_CHANGED_EVENT,
  SELF_CHECK_CREATE_EVENT
} from "../lib/self-check-events";
import type {
  SelfCheckIntervalSnapshot,
  SelfCheckPreviewResponse
} from "../types";

const MAX_ACTIVE = 2;

interface SelfCheckItem {
  id: number;
}

interface CreateForm {
  symbol: string;
  target_interval: string;
  scenario: SelfCheckScenarioValue;
  stop_condition: string;
  note: string;
}

const EMPTY_FORM: CreateForm = {
  symbol: "",
  target_interval: "15m",
  scenario: "bull_pullback_long",
  stop_condition: "",
  note: ""
};

export function SelfCheckDock() {
  const [items, setItems] = useState<SelfCheckItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [preview, setPreview] = useState<
    SelfCheckIntervalSnapshot[] | null
  >(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewRequestRef = useRef(0);

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
    const requestId = ++previewRequestRef.current;

    if (!open) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }

    const symbol = form.symbol.trim().toUpperCase();

    if (!/^[A-Z0-9]{2,30}$/.test(symbol)) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }

    setPreview(null);
    setPreviewError("");
    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      api<SelfCheckPreviewResponse>(
        `/api/self-checks/preview?symbol=${encodeURIComponent(
          symbol
        )}`
      )
        .then((data) => {
          if (requestId !== previewRequestRef.current) {
            return;
          }

          setPreview(data.snapshot);
        })
        .catch((loadError) => {
          if (requestId !== previewRequestRef.current) {
            return;
          }

          setPreview(null);
          setPreviewError(errorMessage(loadError));
        })
        .finally(() => {
          if (requestId !== previewRequestRef.current) {
            return;
          }

          setPreviewLoading(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [open, form.symbol, previewNonce]);

  useEffect(() => {
    const handleChanged = () => {
      if (open) {
        void loadActive();
      }
    };
    const handleCreate = () => {
      setOpen(true);
      setForm(EMPTY_FORM);
      setPreview(null);
      setPreviewError("");
      setError("");
      void loadActive();
    };

    window.addEventListener(
      SELF_CHECK_CHANGED_EVENT,
      handleChanged
    );
    window.addEventListener(
      SELF_CHECK_CREATE_EVENT,
      handleCreate
    );

    return () => {
      window.removeEventListener(
        SELF_CHECK_CHANGED_EVENT,
        handleChanged
      );
      window.removeEventListener(
        SELF_CHECK_CREATE_EVENT,
        handleCreate
      );
    };
  }, [open, loadActive]);

  function openCreateForm(): void {
    setOpen(true);
    setForm(EMPTY_FORM);
    setPreview(null);
    setPreviewError("");
    setError("");
    void loadActive();
  }

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
      const direction = scenarioDirection(form.scenario);

      await api("/api/self-checks", {
        method: "POST",
        body: JSON.stringify({
          symbol: form.symbol,
          direction,
          target_interval: form.target_interval,
          scenario: form.scenario,
          stop_condition: form.stop_condition,
          note: form.note
        })
      });
      setForm(EMPTY_FORM);
      setOpen(false);
      setPreview(null);
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
        onClick={openCreateForm}
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

                <section className="self-check-analysis-panel">
                  <div className="self-check-analysis-panel-head">
                    <div>
                      <strong>各级别分析</strong>
                      <span>
                        日线 / 4h / 1h / 15m / 5m 自动获取
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button small"
                      disabled={
                        previewLoading ||
                        !/^[A-Z0-9]{2,30}$/.test(
                          form.symbol.trim().toUpperCase()
                        )
                      }
                      onClick={() =>
                        setPreviewNonce((current) => current + 1)
                      }
                    >
                      {previewLoading ? "分析中…" : "刷新分析"}
                    </button>
                  </div>

                  {previewError && (
                    <div className="self-check-analysis-error">
                      {previewError}
                    </div>
                  )}

                  {!preview && !previewLoading && !previewError && (
                    <div className="self-check-analysis-empty">
                      输入标的后自动获取五个级别分析
                    </div>
                  )}

                  {previewLoading && !preview && (
                    <div className="self-check-analysis-empty">
                      正在获取日线 / 4h / 1h / 15m / 5m 分析…
                    </div>
                  )}

                  {preview && (
                    <div className="self-check-analysis-list">
                      {sortSnapshots(preview).map((snapshot) => (
                        <div
                          className={`self-check-analysis-card ${
                            snapshot.interval ===
                            form.target_interval
                              ? "target"
                              : ""
                          }`}
                          key={snapshot.interval}
                        >
                          <div className="self-check-analysis-card-head">
                            <b>{intervalLabel(snapshot.interval)}</b>
                            <span
                              className={`self-check-ema-tag ${emaArrangementTone(
                                snapshot
                              )}`}
                            >
                              {emaArrangementLabel(snapshot)}
                            </span>
                            <span className="self-check-analysis-duration">
                              {typeof snapshot.ema_duration_minutes ===
                              "number"
                                ? `运行 ${formatDurationMinutes(
                                    snapshot.ema_duration_minutes
                                  )}`
                                : "时长未知"}
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
                          <div className="self-check-analysis-extra">
                            {kdjDetailText(snapshot)} ·{" "}
                            {macdText(snapshot)} ·{" "}
                            {volumeText(snapshot)}
                          </div>
                          {snapshot.error && (
                            <div className="self-check-analysis-error">
                              {snapshot.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

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
                    {SELF_CHECK_ANALYSIS_INTERVALS.map((interval) => (
                      <option value={interval} key={interval}>
                        {intervalLabel(interval)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  做单场景
                  <select
                    value={form.scenario}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scenario: event.target
                          .value as SelfCheckScenarioValue
                      }))
                    }
                  >
                    {(["BULL", "BEAR"] as const).map((direction) => (
                      <optgroup
                        key={direction}
                        label={
                          direction === "BULL" ? "做多" : "做空"
                        }
                      >
                        {SELF_CHECK_SCENARIOS.filter(
                          (scenario) =>
                            scenario.direction === direction
                        ).map((scenario) => (
                          <option
                            value={scenario.value}
                            key={scenario.value}
                          >
                            {scenario.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <div className="self-check-scenario-hint">
                  方向：
                  {scenarioDirectionLabel(
                    scenarioDirection(form.scenario)
                  )}
                </div>

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
