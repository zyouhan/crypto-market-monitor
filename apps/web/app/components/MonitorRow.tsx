"use client";

import { useState } from "react";

import {
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import type {
  ConditionDisplayItem,
  MonitorItem,
  MonitorSignalItem
} from "../types";

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

interface Tag {
  label: string;
  tone: string;
}

function statusTags(item: MonitorItem): Tag[] {
  const tags: Tag[] = [];
  const seen = new Set<string>();

  function add(label: string, tone = "neutral"): void {
    if (!label || seen.has(label)) {
      return;
    }

    seen.add(label);
    tags.push({ label, tone });
  }

  if (item.enabled !== 1) {
    add("已停用", "neutral");
  }

  if (item.pending) {
    add("请求中", "pending");
  }

  if (item.last_error) {
    add("接口异常", "bear");
  }

  for (const condition of item.conditions) {
    const display = condition.snapshot?.display ?? [];

    for (const label of ["状态", "排列", "最近交叉"]) {
      const entry = display.find(
        (itemDisplay) => itemDisplay.label === label
      );

      if (entry) {
        add(entry.value, entry.tone ?? "neutral");
      }
    }

    if (
      condition.kind === "KDJ_EXTREME" &&
      condition.snapshot?.statusText
    ) {
      add(condition.snapshot.statusText, "neutral");
    }
  }

  return tags.slice(0, 5);
}

function displayTone(
  entry: ConditionDisplayItem
): string {
  return entry.tone ?? "neutral";
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
  const tags = statusTags(item);

  return (
    <article className={`monitor-row ${expanded ? "expanded" : ""}`}>
      <div className="monitor-row-grid">
        <div className="monitor-cell monitor-identity">
          <div className="monitor-name-line">
            <strong>{item.name}</strong>
            {item.enabled !== 1 && (
              <span className="row-muted">已停用</span>
            )}
          </div>

          <div className="monitor-meta-line">
            <span>{item.symbol}</span>
            <span>{item.interval}</span>
            {item.source && (
              <span className="source-badge">
                {item.source === "MIXED"
                  ? "OKX + Binance"
                  : item.source}
              </span>
            )}
          </div>
        </div>

        <div className="monitor-cell monitor-condition-list">
          {item.conditions.map((condition) => (
            <div
              className="row-condition"
              key={condition.id}
            >
              <span
                className={`row-role ${condition.role}`}
              >
                {condition.role === "filter" ? "过滤" : "触发"}
              </span>
              <span className="row-condition-summary">
                {condition.summary}
              </span>
              <span className="row-interval">
                {condition.interval}
              </span>
            </div>
          ))}
        </div>

        <div className="monitor-cell monitor-price-cell">
          <strong>{formatPrice(item.last_price)}</strong>
          <span>最新价</span>
        </div>

        <div className="monitor-cell monitor-state-cell">
          <div className="row-tags">
            {tags.map((tag) => (
              <span
                className={`row-tag ${tag.tone}`}
                key={tag.label}
              >
                {tag.label}
              </span>
            ))}
          </div>

          {item.last_error && (
            <div className="row-error" title={item.last_error}>
              {item.last_error}
            </div>
          )}
        </div>

        <div className="monitor-cell monitor-signal-cell">
          {latestSignal ? (
            <>
              <div
                className={`row-signal ${
                  latestSignal.direction === "BULL"
                    ? "bull"
                    : latestSignal.direction === "BEAR"
                      ? "bear"
                      : "neutral"
                }`}
              >
                {eventTypeLabel(latestSignal.event_type)}
              </div>
              <div className="row-signal-meta">
                {formatPrice(latestSignal.price)} ·{" "}
                {formatTime(latestSignal.event_time)}
              </div>
            </>
          ) : (
            <div className="row-empty">暂无触发信号</div>
          )}
        </div>

        <div className="monitor-cell monitor-action-cell">
          <button
            type="button"
            className="button small"
            disabled={item.pending}
            onClick={() => onRefresh(item)}
          >
            {item.pending ? "请求中" : "请求"}
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

      {expanded && (
        <div className="monitor-detail">
          <div className="detail-switches">
            <span className="detail-label">通知与控制</span>

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

          <div className="detail-condition-grid">
            {item.conditions.map((condition) => (
              <div
                className={`condition-card ${condition.role}`}
                key={condition.id}
              >
                <div className="condition-card-head">
                  <span className="condition-role">
                    {condition.role === "filter"
                      ? "过滤"
                      : "触发"}
                  </span>
                  <strong>{condition.summary}</strong>
                  <span className="condition-interval">
                    {condition.interval}
                  </span>
                  {condition.snapshot?.source && (
                    <span className="source-badge">
                      {condition.snapshot.source}
                    </span>
                  )}
                </div>

                <div className="condition-status-text">
                  {condition.snapshot?.statusText ?? "等待预热"}
                </div>

                <div className="condition-values">
                  {(condition.snapshot?.display ?? []).map(
                    (display) => (
                      <div
                        className={`condition-value ${displayTone(
                          display
                        )}`}
                        key={`${condition.id}-${display.label}`}
                      >
                        <span>{display.label}</span>
                        <strong>{display.value}</strong>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {item.source_note && (
            <div className="monitor-meta">{item.source_note}</div>
          )}
        </div>
      )}
    </article>
  );
}
