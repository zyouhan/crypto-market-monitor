"use client";

import {
  useEffect,
  useRef,
  useState
} from "react";

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
  onClosePosition: (item: MonitorItem) => void;
  onTradeAction: (
    item: MonitorItem,
    action: "T_LONG" | "T_SHORT"
  ) => void;
  onBatchRefresh: (ids: number[]) => Promise<void>;
  onBatchDelete: (ids: number[]) => Promise<void>;
  onBatchNotify: (
    ids: number[],
    patch: {
      wechat_enabled?: boolean;
      sound_enabled?: boolean;
    }
  ) => Promise<void>;
}

type NotifyAction =
  | "wechat_on"
  | "wechat_off"
  | "sound_on"
  | "sound_off"
  | "all_off";

const NOTIFY_ACTIONS: Array<{
  value: NotifyAction;
  label: string;
}> = [
  { value: "wechat_on", label: "微信通知：开启" },
  { value: "wechat_off", label: "微信通知：关闭" },
  { value: "sound_on", label: "声音提醒：开启" },
  { value: "sound_off", label: "声音提醒：关闭" },
  { value: "all_off", label: "微信 + 声音：全部关闭" }
];

function notifyPatch(action: NotifyAction): {
  wechat_enabled?: boolean;
  sound_enabled?: boolean;
} {
  switch (action) {
    case "wechat_on":
      return { wechat_enabled: true };
    case "wechat_off":
      return { wechat_enabled: false };
    case "sound_on":
      return { sound_enabled: true };
    case "sound_off":
      return { sound_enabled: false };
    case "all_off":
      return {
        wechat_enabled: false,
        sound_enabled: false
      };
  }
}

export function MonitorList({
  monitors,
  latestSignals,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
  onClosePosition,
  onTradeAction,
  onBatchRefresh,
  onBatchDelete,
  onBatchNotify
}: MonitorListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set()
  );
  const [batchBusy, setBatchBusy] = useState(false);
  const [notifyAction, setNotifyAction] =
    useState<NotifyAction>("wechat_on");
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(
        monitors.map((monitor) => monitor.id)
      );
      const next = new Set(
        Array.from(current).filter((id) => validIds.has(id))
      );

      return next.size === current.size
        ? current
        : next;
    });
  }, [monitors]);

  const selectedVisible = monitors.filter((monitor) =>
    selectedIds.has(monitor.id)
  );
  const allSelected =
    monitors.length > 0 &&
    selectedVisible.length === monitors.length;
  const someSelected =
    selectedVisible.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function handleSelect(id: number, selected: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function handleSelectAll(selected: boolean): void {
    setSelectedIds(
      selected
        ? new Set(monitors.map((monitor) => monitor.id))
        : new Set()
    );
  }

  async function runBatch(
    action: (ids: number[]) => Promise<void>
  ): Promise<void> {
    if (selectedVisible.length === 0 || batchBusy) {
      return;
    }

    setBatchBusy(true);

    try {
      await action(selectedVisible.map((monitor) => monitor.id));
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <section className="panel monitor-panel">
      {selectedVisible.length > 0 && (
        <div className="batch-toolbar">
          <strong>已选 {selectedVisible.length} 项</strong>
          <div className="batch-actions">
            <button
              type="button"
              className="button small"
              disabled={batchBusy}
              onClick={() =>
                void runBatch(onBatchRefresh)
              }
            >
              批量请求
            </button>
            <button
              type="button"
              className="button small danger"
              disabled={batchBusy}
              onClick={() =>
                void runBatch(onBatchDelete)
              }
            >
              批量删除
            </button>
            <div className="batch-notify">
              <select
                value={notifyAction}
                disabled={batchBusy}
                onChange={(event) =>
                  setNotifyAction(
                    event.target.value as NotifyAction
                  )
                }
              >
                {NOTIFY_ACTIONS.map((action) => (
                  <option
                    value={action.value}
                    key={action.value}
                  >
                    {action.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button small"
                disabled={batchBusy}
                onClick={() =>
                  void runBatch((ids) =>
                    onBatchNotify(ids, notifyPatch(notifyAction))
                  )
                }
              >
                应用通知
              </button>
            </div>
            <button
              type="button"
              className="button small"
              disabled={batchBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {monitors.length === 0 ? (
        <div className="empty">没有匹配的监控项</div>
      ) : (
        <div className="monitor-table">
          <div className="monitor-table-head">
            <span className="monitor-select-cell">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="全选当前监控项"
                checked={allSelected}
                onChange={(event) =>
                  handleSelectAll(event.target.checked)
                }
              />
            </span>
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
                selected={selectedIds.has(monitor.id)}
                onSelect={handleSelect}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onRefresh={onRefresh}
                onClosePosition={onClosePosition}
                onTradeAction={onTradeAction}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
