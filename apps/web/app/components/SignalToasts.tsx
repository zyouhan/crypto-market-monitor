"use client";

import {
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import type { MonitorItem, MonitorSignalItem } from "../types";

interface SignalToastsProps {
  toasts: MonitorSignalItem[];
  monitors: MonitorItem[];
  onDismiss: (id: number) => void;
}

export function SignalToasts({
  toasts,
  monitors,
  onDismiss
}: SignalToastsProps) {
  if (toasts.length === 0) {
    return null;
  }

  const monitorById = new Map(
    monitors.map((monitor) => [monitor.id, monitor])
  );

  return (
    <div
      className="toast-stack"
      role="status"
      aria-live="polite"
    >
      {[...toasts].reverse().map((signal) => {
        const tone =
          signal.direction === "BULL"
            ? "bull"
            : signal.direction === "BEAR"
              ? "bear"
              : "neutral";
        const monitor = signal.monitor_id
          ? monitorById.get(signal.monitor_id)
          : undefined;

        return (
          <div key={signal.id} className={`toast ${tone}`}>
            <div className="toast-head">
              <strong>
                {signal.symbol} ·{" "}
                {signal.interval ? `${signal.interval} ` : ""}
                {eventTypeLabel(signal.event_type)}
              </strong>

              <button
                type="button"
                className="toast-close"
                aria-label="关闭提示"
                onClick={() => onDismiss(signal.id)}
              >
                ×
              </button>
            </div>

            <div className="toast-body">
              {signal.monitor_name ?? monitor?.name ?? "监控项"} · 价格{" "}
              {formatPrice(signal.price)}
            </div>

            <div className="toast-body">
              {signal.conditions
                .map(
                  (condition) =>
                    `[${condition.interval}] ${
                      condition.role === "filter"
                        ? "过滤"
                        : "触发"
                    } ${condition.summary}`
                )
                .join(" · ")}
            </div>

            <div className="toast-time">
              {formatTime(signal.event_time)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
