"use client";

import {
  crossName,
  entryLabel,
  eventTypeLabel,
  formatFixed,
  formatPrice,
  formatTime,
  jClass,
  signalJValue,
  signalTone,
  trendClass,
  trendLabel
} from "../lib/format";
import {
  getEmaAlignment,
  getEmaConfig,
  getExtraNumber,
  getKdjConfig
} from "../lib/strategy";
import type { SignalItem, SymbolItem } from "../types";

interface SymbolCardProps {
  item: SymbolItem;
  latestSignal: SignalItem | null;
  onToggle: (
    id: number,
    patch: {
      enabled?: boolean;
      notify_enabled?: boolean;
    }
  ) => void;
  onEdit: (item: SymbolItem) => void;
  onDelete: (item: SymbolItem) => void;
}

export function SymbolCard({
  item,
  latestSignal,
  onToggle,
  onEdit,
  onDelete
}: SymbolCardProps) {
  const ema = getEmaConfig(item);
  const kdj = getKdjConfig(item);

  const trendStatus = item.states.EMA_TREND?.status;
  const entryStatus = item.states.KDJ_ENTRY?.status;
  const baseline = item.states.EMA_TREND?.baseline;

  const j = getExtraNumber(item, "KDJ_ENTRY", "j");
  const k = getExtraNumber(item, "KDJ_ENTRY", "k");
  const d = getExtraNumber(item, "KDJ_ENTRY", "d");

  const alignment = getEmaAlignment(item);

  const trendText = trendLabel(trendStatus);

  const entryText = kdj.enabled
    ? entryLabel(entryStatus, kdj.oversold, kdj.overbought)
    : "KDJ 已停用";

  const alignmentText =
    alignment === "BULL"
      ? "多头排列"
      : alignment === "BEAR"
        ? "空头排列"
        : "排列未知";

  return (
    <article className="symbol-card">
      <div className="symbol-card-top">
        <div>
          <div className="symbol-name">{item.symbol}</div>
          <div className="symbol-period">
            {item.interval} · EMA {ema.fast}/{ema.slow}
            {ema.enabled ? "" : "（已停用）"}
          </div>
        </div>

        <span
          className={`status ${trendClass(trendStatus)}`}
        >
          {trendText}
        </span>
      </div>

      <div className="price">
        {formatPrice(item.last_price)}
      </div>
      <div className="price-label">最新已收盘 K 线价格</div>

      <div className="badge-row">
        <span
          className={`badge ${
            entryStatus === "ARMED_LONG"
              ? "long"
              : entryStatus === "ARMED_SHORT"
                ? "short"
                : ""
          }`}
        >
          {entryText}
        </span>

        <span
          className={`badge ${
            alignment === "BULL"
              ? "long"
              : alignment === "BEAR"
                ? "short"
                : ""
          }`}
        >
          {alignmentText}
        </span>

        <span className="badge">
          J{" "}
          <span
            className={`j-value ${jClass(
              j,
              kdj.oversold,
              kdj.overbought
            )}`}
          >
            {formatFixed(j, 2)}
          </span>
        </span>

        <span className="badge">
          K {formatFixed(k, 2)} / D {formatFixed(d, 2)}
        </span>
      </div>

      {latestSignal && (
        <div
          className={`signal-hint ${signalTone(latestSignal)}`}
        >
          <span>最近信号</span>
          <strong>
            {eventTypeLabel(latestSignal.event_type)}
          </strong>
          {signalJValue(latestSignal) !== null && (
            <span>
              J{" "}
              {formatFixed(signalJValue(latestSignal), 2)}
            </span>
          )}
          <span>{formatTime(latestSignal.event_time)}</span>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-item">
          <label>最近交叉</label>
          <strong>{crossName(baseline?.type)}</strong>
        </div>

        <div className="detail-item">
          <label>交叉价格</label>
          <strong>{formatPrice(baseline?.price)}</strong>
        </div>

        <div className="detail-item">
          <label>交叉 EMA</label>
          <strong>{formatPrice(baseline?.ema)}</strong>
        </div>

        <div className="detail-item">
          <label>交叉时间</label>
          <strong>{formatTime(baseline?.time)}</strong>
        </div>

        <div className="detail-item">
          <label>EMA 距离阈值</label>
          <strong>{formatPrice(ema.threshold)}</strong>
        </div>
      </div>

      <div className="symbol-actions">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={item.enabled === 1}
            onChange={(event) =>
              onToggle(item.id, {
                enabled: event.target.checked
              })
            }
          />
          监控
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={item.notify_enabled === 1}
            onChange={(event) =>
              onToggle(item.id, {
                notify_enabled: event.target.checked
              })
            }
          />
          微信通知
        </label>

        <button
          className="button small"
          onClick={() => onEdit(item)}
        >
          编辑
        </button>

        <button
          className="button small danger"
          onClick={() => onDelete(item)}
        >
          删除
        </button>
      </div>
    </article>
  );
}
