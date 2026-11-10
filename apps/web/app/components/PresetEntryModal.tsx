"use client";

import { eventTypeLabel, formatPrice, formatTime } from "../lib/format";
import type {
  MonitorSignalItem,
  SignalStats
} from "../types";

interface PresetEntryModalProps {
  stats: SignalStats;
  signals: MonitorSignalItem[];
  onClose: () => void;
}

function entryDirection(
  signal: MonitorSignalItem
): string {
  return signal.direction === "BEAR" ? "做空" : "做多";
}

export function PresetEntryModal({
  stats,
  signals,
  onClose
}: PresetEntryModalProps) {
  const entries = signals
    .filter(
      (signal) =>
        Boolean(signal.preset_id) &&
        (signal.event_type === "ENTRY_LONG" ||
          signal.event_type === "ENTRY_SHORT")
    )
    .slice(0, 50);
  const presets = (stats.by_preset ?? []).filter(
    (item) =>
      item.preset_id !== "custom" &&
      (item.monitors > 0 || item.total > 0)
  );

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal preset-entry-modal">
        <div className="modal-title-row">
          <div>
            <h2>预设策略入场点</h2>
            <div className="modal-subtitle">
              仅统计 KDJ / MACD / EMA / ADX 组合产生的入场信号
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="preset-entry-summary">
          {presets.length === 0 ? (
            <div className="empty">暂无预设监控项</div>
          ) : (
            presets.map((preset) => (
              <div
                className="preset-entry-summary-card"
                key={preset.preset_id}
              >
                <strong>{preset.preset_name}</strong>
                <span>
                  {preset.monitors} 个监控项 · 今日 {preset.today} ·
                  累计 {preset.total}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="section-heading preset-entry-heading">
          <span className="section-number">↯</span>
          <h3>最近入场点</h3>
        </div>

        {entries.length === 0 ? (
          <div className="empty">暂无入场信号</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>标的</th>
                  <th>K 线</th>
                  <th>预设</th>
                  <th>方向</th>
                  <th>价格</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((signal) => (
                  <tr key={signal.id}>
                    <td>{formatTime(signal.event_time)}</td>
                    <td>{signal.symbol}</td>
                    <td>{signal.interval ?? "--"}</td>
                    <td>
                      {signal.preset_name ??
                        stats.by_preset?.find(
                          (item) =>
                            item.preset_id === signal.preset_id
                        )?.preset_name ??
                        "自定义/历史"}
                    </td>
                    <td>{entryDirection(signal)}</td>
                    <td>{formatPrice(signal.price)}</td>
                    <td>{eventTypeLabel(signal.event_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
