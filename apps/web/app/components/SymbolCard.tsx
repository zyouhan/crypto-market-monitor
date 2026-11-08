"use client";

import {
  crossName,
  entryLabel,
  formatFixed,
  formatPrice,
  formatTime,
  jClass,
  trendClass,
  trendLabel
} from "../lib/format";
import {
  getEmaAlignment,
  getEmaConfig,
  getExtraNumber,
  getKdjConfig
} from "../lib/strategy";
import type { SymbolItem } from "../types";

interface SymbolCardProps {
  item: SymbolItem;
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

  const trendWaiting =
    trendStatus === "BULL_WAITING" ||
    trendStatus === "BEAR_WAITING";

  const trendConflicted =
    (trendStatus === "BULL_WAITING" &&
      alignment === "BEAR") ||
    (trendStatus === "BEAR_WAITING" &&
      alignment === "BULL");

  const entryMisaligned =
    kdj.enabled &&
    trendWaiting &&
    entryStatus === "IDLE";

  const trendText = trendConflicted
    ? `${trendLabel(trendStatus)}（排列冲突）`
    : trendLabel(trendStatus);

  const entryText = !kdj.enabled
    ? "KDJ 已停用"
    : entryMisaligned
      ? "趋势排列冲突，暂停入场"
      : entryLabel(entryStatus, kdj.oversold, kdj.overbought);

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
            entryMisaligned
              ? "warn"
              : entryStatus === "ARMED_LONG"
                ? "long"
                : entryStatus === "ARMED_SHORT"
                  ? "short"
                  : ""
          }`}
        >
          {entryText}
        </span>

        <span className="badge">{alignmentText}</span>

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
          <label>交叉时间</label>
          <strong>{formatTime(baseline?.time)}</strong>
        </div>

        <div className="detail-item">
          <label>价格差阈值</label>
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
