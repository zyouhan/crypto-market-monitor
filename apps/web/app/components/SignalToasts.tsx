"use client";

import {
  eventTypeLabel,
  formatFixed,
  formatPrice,
  formatTime,
  signalJValue,
  signalTone
} from "../lib/format";
import type { SignalItem } from "../types";

interface SignalToastsProps {
  toasts: SignalItem[];
  onDismiss: (id: number) => void;
}

export function SignalToasts({
  toasts,
  onDismiss
}: SignalToastsProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="toast-stack"
      role="status"
      aria-live="polite"
    >
      {[...toasts].reverse().map((signal) => {
        const tone = signalTone(signal);
        const jValue = signalJValue(signal);

        return (
          <div
            key={signal.id}
            className={`toast ${tone}`}
          >
            <div className="toast-head">
              <strong>
                {signal.symbol} ·{" "}
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
              价格 {formatPrice(signal.price)}
              {jValue !== null
                ? ` · J ${formatFixed(jValue, 2)}`
                : ""}
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
