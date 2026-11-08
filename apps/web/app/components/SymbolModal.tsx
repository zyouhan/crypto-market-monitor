"use client";

import {
  useState,
  type FormEvent
} from "react";

import {
  DEFAULT_EMA,
  DEFAULT_KDJ,
  DEFAULT_KDJ_TIMING,
  getEmaConfig,
  getKdjConfig,
  getKdjTimingConfig
} from "../lib/strategy";
import type {
  SaveSymbolPayload,
  SymbolItem
} from "../types";

const intervals = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
];

interface SymbolModalProps {
  item: SymbolItem | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: SaveSymbolPayload) => Promise<void>;
}

interface FormState {
  symbol: string;
  interval: string;
  emaEnabled: boolean;
  emaNotify: boolean;
  fast: number;
  slow: number;
  threshold: number;
  kdjEnabled: boolean;
  kdjNotify: boolean;
  period: number;
  kSmooth: number;
  dSmooth: number;
  oversold: number;
  overbought: number;
  longEnabled: boolean;
  shortEnabled: boolean;
  timingEnabled: boolean;
  timingNotify: boolean;
  timingOversold: number;
  timingOverbought: number;
  timingLongEnabled: boolean;
  timingShortEnabled: boolean;
}

function initialState(item: SymbolItem | null): FormState {
  const ema = item ? getEmaConfig(item) : null;
  const kdj = item ? getKdjConfig(item) : null;
  const timing = item ? getKdjTimingConfig(item) : null;

  return {
    symbol: item?.symbol ?? "",
    interval: item?.interval ?? "1m",
    emaEnabled: ema ? ema.enabled : true,
    emaNotify: ema ? ema.notify : true,
    fast: ema ? ema.fast : DEFAULT_EMA.fast,
    slow: ema ? ema.slow : DEFAULT_EMA.slow,
    threshold: ema ? ema.threshold : DEFAULT_EMA.threshold,
    kdjEnabled: kdj ? kdj.enabled : true,
    kdjNotify: kdj ? kdj.notify : true,
    period: kdj ? kdj.period : DEFAULT_KDJ.period,
    kSmooth: kdj ? kdj.kSmooth : DEFAULT_KDJ.kSmooth,
    dSmooth: kdj ? kdj.dSmooth : DEFAULT_KDJ.dSmooth,
    oversold: kdj ? kdj.oversold : DEFAULT_KDJ.oversold,
    overbought: kdj ? kdj.overbought : DEFAULT_KDJ.overbought,
    longEnabled: kdj ? kdj.longEnabled : true,
    shortEnabled: kdj ? kdj.shortEnabled : true,
    timingEnabled: timing ? timing.enabled : false,
    timingNotify: timing ? timing.notify : true,
    timingOversold: timing
      ? timing.oversold
      : DEFAULT_KDJ_TIMING.oversold,
    timingOverbought: timing
      ? timing.overbought
      : DEFAULT_KDJ_TIMING.overbought,
    timingLongEnabled: timing ? timing.longEnabled : true,
    timingShortEnabled: timing ? timing.shortEnabled : true
  };
}

export function SymbolModal({
  item,
  loading,
  error,
  onClose,
  onSave
}: SymbolModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialState(item)
  );
  const [localError, setLocalError] = useState("");

  const isEditing = item !== null;

  function setField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setLocalError("");

    const symbol = form.symbol.trim().toUpperCase();

    if (!symbol) {
      setLocalError("请输入交易标的");
      return;
    }

    if (form.fast >= form.slow) {
      setLocalError("快线 EMA 必须小于慢线 EMA");
      return;
    }

    if (form.oversold >= form.overbought) {
      setLocalError("超卖阈值必须小于超买阈值");
      return;
    }

    if (form.timingEnabled) {
      if (form.timingOversold >= form.timingOverbought) {
        setLocalError("简易监控的 J 超卖阈值必须小于超买阈值");
        return;
      }

      if (
        !form.timingLongEnabled &&
        !form.timingShortEnabled
      ) {
        setLocalError("简易监控至少选择一个监控方向");
        return;
      }
    }

    const strategies: SaveSymbolPayload["strategies"] = [
      {
        kind: "EMA_TREND",
        enabled: form.emaEnabled,
        notify_enabled: form.emaNotify,
        params: {
          fast: Number(form.fast),
          slow: Number(form.slow),
          threshold: Number(form.threshold)
        }
      },
      {
        kind: "KDJ_ENTRY",
        enabled: form.kdjEnabled,
        notify_enabled: form.kdjNotify,
        params: {
          period: Number(form.period),
          kSmooth: Number(form.kSmooth),
          dSmooth: Number(form.dSmooth),
          oversold: Number(form.oversold),
          overbought: Number(form.overbought),
          longEnabled: form.longEnabled,
          shortEnabled: form.shortEnabled
        }
      }
    ];

    // 已有简易策略或本次启用时才写入，避免编辑旧标的时无谓重置状态
    const hasTimingStrategy =
      item?.strategies.some(
        (strategy) => strategy.kind === "KDJ_TIMING"
      ) ?? false;

    if (form.timingEnabled || hasTimingStrategy) {
      strategies.push({
        kind: "KDJ_TIMING",
        enabled: form.timingEnabled,
        notify_enabled: form.timingNotify,
        params: {
          oversold: Number(form.timingOversold),
          overbought: Number(form.timingOverbought),
          longEnabled: form.timingLongEnabled,
          shortEnabled: form.timingShortEnabled
        }
      });
    }

    const payload: SaveSymbolPayload = {
      symbol,
      interval: form.interval,
      strategies
    };

    try {
      await onSave(payload);
    } catch {
      // 错误由页面统一展示
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <h2>
          {isEditing ? "编辑监控配置" : "添加监控标的"}
        </h2>

        {(localError || error) && (
          <div className="message error">
            {localError || error}
          </div>
        )}

        <div className="form-grid">
          <div className="form-field">
            <label>交易标的</label>
            <input
              value={form.symbol}
              disabled={isEditing}
              placeholder="例如 BTCUSDT"
              onChange={(event) =>
                setField(
                  "symbol",
                  event.target.value.toUpperCase()
                )
              }
              required
            />
          </div>

          <div className="form-field">
            <label>K 线周期</label>
            <select
              value={form.interval}
              onChange={(event) =>
                setField("interval", event.target.value)
              }
            >
              {intervals.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="strategy-block">
          <div className="strategy-head">
            <div className="strategy-heading">
              <div className="strategy-title">
                EMA 趋势（定方向）
              </div>
              <div className="strategy-desc">
                快慢线交叉，且 EMA 距离超过阈值后确认趋势
              </div>
            </div>

            <div className="strategy-switches">
              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.emaEnabled}
                  onChange={(event) =>
                    setField(
                      "emaEnabled",
                      event.target.checked
                    )
                  }
                />
                启用策略
              </label>

              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.emaNotify}
                  onChange={(event) =>
                    setField(
                      "emaNotify",
                      event.target.checked
                    )
                  }
                />
                微信通知
              </label>
            </div>
          </div>

          <div className="strategy-body">
            <div className="form-grid three">
              <div className="form-field">
                <label>快线 EMA</label>
                <input
                  type="number"
                  min="2"
                  value={form.fast}
                  onChange={(event) =>
                    setField(
                      "fast",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>慢线 EMA</label>
                <input
                  type="number"
                  min="3"
                  value={form.slow}
                  onChange={(event) =>
                    setField(
                      "slow",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>EMA 距离阈值</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.threshold}
                  onChange={(event) =>
                    setField(
                      "threshold",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="strategy-block">
          <div className="strategy-head">
            <div className="strategy-heading">
              <div className="strategy-title">
                KDJ 入场（找时机）
              </div>
              <div className="strategy-desc">
                趋势等待中，J 值穿越超卖或超买阈值后提示入场
              </div>
            </div>

            <div className="strategy-switches">
              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.kdjEnabled}
                  onChange={(event) =>
                    setField(
                      "kdjEnabled",
                      event.target.checked
                    )
                  }
                />
                启用策略
              </label>

              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.kdjNotify}
                  onChange={(event) =>
                    setField(
                      "kdjNotify",
                      event.target.checked
                    )
                  }
                />
                微信通知
              </label>
            </div>
          </div>

          <div className="strategy-body">
            <div className="form-grid three">
              <div className="form-field">
                <label>KDJ 周期</label>
                <input
                  type="number"
                  min="2"
                  value={form.period}
                  onChange={(event) =>
                    setField(
                      "period",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>K 平滑</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.kSmooth}
                  onChange={(event) =>
                    setField(
                      "kSmooth",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>D 平滑</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.dSmooth}
                  onChange={(event) =>
                    setField(
                      "dSmooth",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>超卖阈值（做多）</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="any"
                  value={form.oversold}
                  onChange={(event) =>
                    setField(
                      "oversold",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>超买阈值（做空）</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  step="any"
                  value={form.overbought}
                  onChange={(event) =>
                    setField(
                      "overbought",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="direction-row">
              <span className="direction-row-label">
                入场方向
              </span>

              <div className="direction-options">
                <label className="switch-chip">
                  <input
                    type="checkbox"
                    checked={form.longEnabled}
                    onChange={(event) =>
                      setField(
                        "longEnabled",
                        event.target.checked
                      )
                    }
                  />
                  超卖做多
                </label>

                <label className="switch-chip">
                  <input
                    type="checkbox"
                    checked={form.shortEnabled}
                    onChange={(event) =>
                      setField(
                        "shortEnabled",
                        event.target.checked
                      )
                    }
                  />
                  超买做空
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="strategy-block">
          <div className="strategy-head">
            <div className="strategy-heading">
              <div className="strategy-title">
                简易 J 值入场（不看趋势）
              </div>
              <div className="strategy-desc">
                固定 KDJ 9/3/3，仅看 J 值穿越阈值；不要求 EMA
                趋势，只产生做多/做空入场提示
              </div>
            </div>

            <div className="strategy-switches">
              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.timingEnabled}
                  onChange={(event) =>
                    setField(
                      "timingEnabled",
                      event.target.checked
                    )
                  }
                />
                启用策略
              </label>

              <label className="switch-chip">
                <input
                  type="checkbox"
                  checked={form.timingNotify}
                  onChange={(event) =>
                    setField(
                      "timingNotify",
                      event.target.checked
                    )
                  }
                />
                微信通知
              </label>
            </div>
          </div>

          <div className="strategy-body">
            <div className="form-grid">
              <div className="form-field">
                <label>J 超卖阈值（做多）</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="any"
                  value={form.timingOversold}
                  onChange={(event) =>
                    setField(
                      "timingOversold",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label>J 超买阈值（做空）</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  step="any"
                  value={form.timingOverbought}
                  onChange={(event) =>
                    setField(
                      "timingOverbought",
                      Number(event.target.value)
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="direction-row">
              <span className="direction-row-label">
                监控方向
              </span>

              <div className="direction-options">
                <label className="switch-chip">
                  <input
                    type="checkbox"
                    checked={form.timingLongEnabled}
                    onChange={(event) =>
                      setField(
                        "timingLongEnabled",
                        event.target.checked
                      )
                    }
                  />
                  超卖做多
                </label>

                <label className="switch-chip">
                  <input
                    type="checkbox"
                    checked={form.timingShortEnabled}
                    onChange={(event) =>
                      setField(
                        "timingShortEnabled",
                        event.target.checked
                      )
                    }
                  />
                  超买做空
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
          >
            取消
          </button>

          <button
            type="submit"
            className="button primary"
            disabled={loading}
          >
            {loading ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
