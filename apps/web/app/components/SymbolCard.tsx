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
  getKdjConfig,
  getKdjTimingConfig
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
  const timing = getKdjTimingConfig(item);

  const trendStatus = item.states.EMA_TREND?.status;
  const entryStatus = item.states.KDJ_ENTRY?.status;
  const baseline = item.states.EMA_TREND?.baseline;

  const displayKind = kdj.enabled
    ? "KDJ_ENTRY"
    : timing.enabled
      ? "KDJ_TIMING"
      : "KDJ_ENTRY";

  const j = getExtraNumber(item, displayKind, "j");
  const k = getExtraNumber(item, displayKind, "k");
  const d = getExtraNumber(item, displayKind, "d");

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

  const timingDirectionText =
    timing.longEnabled && timing.shortEnabled
      ? "超卖做多 / 超买做空"
      : timing.longEnabled
        ? "仅超卖做多"
        : timing.shortEnabled
          ? "仅超买做空"
          : "未选择";

  const headerStatusText =
    !ema.enabled && timing.enabled
      ? "简易 J 监控"
      : trendText;

  const headerStatusClass =
    !ema.enabled && timing.enabled
      ? "timing"
      : trendClass(trendStatus);

  const jOversold = kdj.enabled
    ? kdj.oversold
    : timing.oversold;

  const jOverbought = kdj.enabled
    ? kdj.overbought
    : timing.overbought;

  return (
    <article className="symbol-card">
      <div className="symbol-card-top">
        <div>
          <div className="symbol-name">{item.symbol}</div>
          <div className="symbol-period">
            {item.interval} ·{" "}
            {!ema.enabled && timing.enabled
              ? "简易 J 9/3/3"
              : `EMA ${ema.fast}/${ema.slow}${
                  ema.enabled ? "" : "（已停用）"
                }`}
          </div>
        </div>

        <span className={`status ${headerStatusClass}`}>
          {headerStatusText}
        </span>
      </div>

      <div className="symbol-summary">
        <div className="price-block">
          <div className="price">
            {formatPrice(item.last_price)}
          </div>
          <div className="price-label">最新已收盘价</div>
        </div>

        <div
          className={`signal-hint ${
            latestSignal ? signalTone(latestSignal) : "empty"
          }`}
        >
          {latestSignal ? (
            <>
              <span>最近信号</span>
              <strong>
                {latestSignal.kind === "KDJ_TIMING"
                  ? "简易J "
                  : ""}
                {eventTypeLabel(latestSignal.event_type)}
              </strong>
              {signalJValue(latestSignal) !== null && (
                <span>
                  J{" "}
                  {formatFixed(signalJValue(latestSignal), 2)}
                </span>
              )}
              <span>{formatTime(latestSignal.event_time)}</span>
            </>
          ) : (
            <span className="signal-hint-empty">
              暂无触发信号
            </span>
          )}
        </div>
      </div>

      <div className="badge-row">
        {kdj.enabled && (
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
        )}

        {timing.enabled && timing.longEnabled && (
          <span className="badge long">
            做多 J≤{formatPrice(timing.oversold)}
          </span>
        )}

        {timing.enabled && timing.shortEnabled && (
          <span className="badge short">
            做空 J≥{formatPrice(timing.overbought)}
          </span>
        )}

        {timing.enabled &&
          !timing.longEnabled &&
          !timing.shortEnabled && (
            <span className="badge timing">
              简易J 未选方向
            </span>
          )}

        {ema.enabled && (
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
        )}

        {(kdj.enabled || timing.enabled) && (
          <>
            <span className="badge">
              J{" "}
              <span
                className={`j-value ${jClass(
                  j,
                  jOversold,
                  jOverbought
                )}`}
              >
                {formatFixed(j, 2)}
              </span>
            </span>

            <span className="badge">
              K {formatFixed(k, 2)} / D {formatFixed(d, 2)}
            </span>
          </>
        )}
      </div>

      {ema.enabled ? (
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
      ) : timing.enabled ? (
        <div className="detail-grid">
          <div className="detail-item">
            <label>监控方向</label>
            <strong>{timingDirectionText}</strong>
          </div>

          <div className="detail-item">
            <label>J 超卖阈值</label>
            <strong>{formatFixed(timing.oversold, 2)}</strong>
          </div>

          <div className="detail-item">
            <label>J 超买阈值</label>
            <strong>{formatFixed(timing.overbought, 2)}</strong>
          </div>

          <div className="detail-item">
            <label>KDJ 参数</label>
            <strong>9 / 3 / 3（固定）</strong>
          </div>
        </div>
      ) : null}

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
