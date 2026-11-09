"use client";

import { useState } from "react";

import {
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import type { MonitorItem, MonitorSignalItem } from "../types";

interface MonitorRowProps {
  item: MonitorItem;
  latestSignal: MonitorSignalItem | null;
  onToggle: (
    id: number,
    patch: {
      enabled?: boolean;
      wechat_enabled?: boolean;
      sound_enabled?: boolean;
    }
  ) => void;
  onEdit: (item: MonitorItem) => void;
  onDelete: (item: MonitorItem) => void;
  onRefresh: (item: MonitorItem) => void;
}

function statusTone(
  item: MonitorItem
): "error" | "pending" | "off" | "ok" {
  if (item.last_error) {
    return "error";
  }

  if (item.pending) {
    return "pending";
  }

  if (item.enabled !== 1) {
    return "off";
  }

  return "ok";
}

function statusText(item: MonitorItem): string {
  if (item.last_error) {
    return "接口异常";
  }

  if (item.pending) {
    return "请求中";
  }

  if (item.enabled !== 1) {
    return "已停用";
  }

  return "运行中";
}

export function MonitorRow({
  item,
  latestSignal,
  onToggle,
  onEdit,
  onDelete,
  onRefresh
}: MonitorRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = statusTone(item);

  return (
    <article className="monitor-row">
      <div className="monitor-row-head">
        <div className="monitor-title-block">
          <div className="monitor-title-line">
            <strong>{item.name}</strong>
            <span className="monitor-symbol">
              {item.symbol} · {item.interval}
            </span>
          </div>

          <div className="condition-chips">
            {item.conditions.map((condition) => (
              <span
                key={condition.id}
                className={`condition-chip ${condition.role}`}
              >
                <span className="condition-role">
                  {condition.role === "filter" ? "过滤" : "触发"}
                </span>
                <span className="condition-interval">
                  {condition.interval}
                </span>
                {condition.summary}
              </span>
            ))}
          </div>
        </div>

        <div className="monitor-status-block">
          <span className={`monitor-status ${tone}`}>
            {item.pending && <span className="spinner" />}
            {statusText(item)}
          </span>

          {item.source && (
            <span className="source-badge">
              {item.source === "MIXED"
                ? "OKX + Binance"
                : item.source}
            </span>
          )}

          <div className="monitor-row-actions">
            <button
              type="button"
              className="button small"
              disabled={item.pending}
              onClick={() => onRefresh(item)}
            >
              {item.pending ? "请求中" : "立即请求"}
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "收起" : "详情"}
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => onEdit(item)}
            >
              编辑
            </button>
            <button
              type="button"
              className="button small danger"
              onClick={() => onDelete(item)}
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <div className="monitor-main">
        <div className="monitor-price-block">
          <div className="monitor-price">
            {formatPrice(item.last_price)}
          </div>
          <div className="price-label">最新已收盘价</div>

          <div className="monitor-toggles">
            <label className="switch-chip">
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
            <label className="switch-chip">
              <input
                type="checkbox"
                checked={item.wechat_enabled === 1}
                onChange={(event) =>
                  onToggle(item.id, {
                    wechat_enabled: event.target.checked
                  })
                }
              />
              微信
            </label>
            <label className="switch-chip">
              <input
                type="checkbox"
                checked={item.sound_enabled === 1}
                onChange={(event) =>
                  onToggle(item.id, {
                    sound_enabled: event.target.checked
                  })
                }
              />
              声音
            </label>
          </div>
        </div>

        <div className="monitor-conditions">
          {item.conditions.map((condition) => (
            <div
              className={`condition-card ${condition.role}`}
              key={condition.id}
            >
              <div className="condition-card-head">
                <span className="condition-role">
                  {condition.role === "filter" ? "过滤" : "触发"}
                </span>
                <strong>{condition.summary}</strong>
                <span className="condition-interval">
                  {condition.interval}
                </span>
              </div>

              <div className="condition-status-text">
                {condition.snapshot?.statusText ?? "等待预热"}
              </div>

              <div className="condition-values">
                {(condition.snapshot?.display ?? [])
                  .slice(0, expanded ? undefined : 3)
                  .map((display) => (
                    <div
                      className={`condition-value ${
                        display.tone ?? "neutral"
                      }`}
                      key={`${condition.id}-${display.label}`}
                    >
                      <span>{display.label}</span>
                      <strong>{display.value}</strong>
                    </div>
                  ))}
              </div>

              {expanded && condition.snapshot?.source && (
                <div className="condition-meta">
                  数据源：{condition.snapshot.source}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="monitor-signal-block">
          <div className="monitor-signal-label">最近信号</div>

          {latestSignal ? (
            <div
              className={`signal-hint ${
                latestSignal.direction === "BULL"
                  ? "bull"
                  : latestSignal.direction === "BEAR"
                    ? "bear"
                    : "neutral"
              }`}
            >
              <strong>
                {eventTypeLabel(latestSignal.event_type)}
              </strong>
              <span>{formatPrice(latestSignal.price)}</span>
              <span>{formatTime(latestSignal.event_time)}</span>
            </div>
          ) : (
            <div className="signal-hint empty">
              <span className="signal-hint-empty">
                暂无触发信号
              </span>
            </div>
          )}

          {item.last_error && (
            <div className="monitor-error" title={item.last_error}>
              {item.last_error}
            </div>
          )}

          {expanded && item.source_note && (
            <div className="monitor-meta">{item.source_note}</div>
          )}
        </div>
      </div>
    </article>
  );
}
