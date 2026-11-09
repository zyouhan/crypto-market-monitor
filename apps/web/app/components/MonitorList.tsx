"use client";

import { MonitorRow } from "./MonitorRow";
import type { MonitorItem, MonitorSignalItem } from "../types";

interface MonitorListProps {
  monitors: MonitorItem[];
  latestSignals: Map<number, MonitorSignalItem>;
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

export function MonitorList({
  monitors,
  latestSignals,
  onToggle,
  onEdit,
  onDelete,
  onRefresh
}: MonitorListProps) {
  return (
    <section className="panel monitor-panel">
      {monitors.length === 0 ? (
        <div className="empty">没有匹配的监控项</div>
      ) : (
        <div className="monitor-table">
          <div className="monitor-table-head">
            <span>监控项</span>
            <span>策略条件</span>
            <span>最新价</span>
            <span>市场状态</span>
            <span>最近信号</span>
            <span>操作</span>
          </div>

          <div className="monitor-table-body">
            {monitors.map((monitor) => (
              <MonitorRow
                key={monitor.id}
                item={monitor}
                latestSignal={
                  latestSignals.get(monitor.id) ??
                  monitor.last_signal
                }
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
