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
  onAdd: () => void;
}

export function MonitorList({
  monitors,
  latestSignals,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
  onAdd
}: MonitorListProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">监控项</div>
          <div className="panel-subtitle">
            一个监控项可组合多个指标，并分别指定触发周期和过滤周期
          </div>
        </div>

        <button className="button primary" onClick={onAdd}>
          + 新建监控项
        </button>
      </div>

      {monitors.length === 0 ? (
        <div className="empty">暂无监控项，请先创建</div>
      ) : (
        <div className="monitor-list">
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
      )}
    </section>
  );
}
