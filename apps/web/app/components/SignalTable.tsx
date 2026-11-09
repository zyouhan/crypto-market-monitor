"use client";

import { useMemo, useState } from "react";

import {
  directionLabel,
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import type { MonitorItem, MonitorSignalItem } from "../types";

interface SignalTableProps {
  signals: MonitorSignalItem[];
  monitors: MonitorItem[];
}

function conditionLabel(kind: string | null): string {
  if (kind === "EMA_CROSS") {
    return "EMA 交叉";
  }

  if (kind === "KDJ_EXTREME") {
    return "KDJ 极值";
  }

  return kind ?? "--";
}

function pushLabel(signal: MonitorSignalItem): string {
  if (signal.trigger_met !== 1) {
    return "未触发";
  }

  if (signal.push_state === "SENT") {
    return "已发送";
  }

  if (signal.push_state === "FAILED") {
    return "发送失败";
  }

  if (signal.push_state === "PENDING") {
    return "待发送";
  }

  switch (signal.reason) {
    case "global_notification_disabled":
      return "全局通知关闭";
    case "monitor_notification_disabled":
      return "监控项通知关闭";
    case "serverchan_sendkey_missing":
      return "未配置 SendKey";
    case "stale_signal_suppressed":
      return "过期抑制";
    default:
      return signal.reason ?? "未发送";
  }
}

export function SignalTable({
  signals,
  monitors
}: SignalTableProps) {
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [intervalFilter, setIntervalFilter] = useState("ALL");
  const [monitorFilter, setMonitorFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const symbolOptions = useMemo(() => {
    const values = new Set<string>(
      monitors.map((monitor) => monitor.symbol)
    );

    for (const signal of signals) {
      values.add(signal.symbol);
    }

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [signals, monitors]);

  const intervalOptions = useMemo(() => {
    const values = new Set<string>(
      monitors.map((monitor) => monitor.interval)
    );

    for (const signal of signals) {
      if (signal.interval) {
        values.add(signal.interval);
      }
    }

    return Array.from(values).sort();
  }, [signals, monitors]);

  const filtered = useMemo(
    () =>
      signals.filter((signal) => {
        if (
          symbolFilter !== "ALL" &&
          signal.symbol !== symbolFilter
        ) {
          return false;
        }

        if (
          intervalFilter !== "ALL" &&
          signal.interval !== intervalFilter
        ) {
          return false;
        }

        if (
          monitorFilter !== "ALL" &&
          String(signal.monitor_id) !== monitorFilter
        ) {
          return false;
        }

        if (
          typeFilter !== "ALL" &&
          signal.event_type !== typeFilter
        ) {
          return false;
        }

        return true;
      }),
    [
      signals,
      symbolFilter,
      intervalFilter,
      monitorFilter,
      typeFilter
    ]
  );

  return (
    <>
      <div className="filter-row">
        <select
          aria-label="按标的筛选"
          value={symbolFilter}
          onChange={(event) =>
            setSymbolFilter(event.target.value)
          }
        >
          <option value="ALL">全部标的</option>
          {symbolOptions.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>

        <select
          aria-label="按K线级别筛选"
          value={intervalFilter}
          onChange={(event) =>
            setIntervalFilter(event.target.value)
          }
        >
          <option value="ALL">全部 K 线</option>
          {intervalOptions.map((interval) => (
            <option key={interval} value={interval}>
              {interval}
            </option>
          ))}
        </select>

        <select
          aria-label="按监控项筛选"
          value={monitorFilter}
          onChange={(event) =>
            setMonitorFilter(event.target.value)
          }
        >
          <option value="ALL">全部监控项</option>
          {monitors.map((monitor) => (
            <option key={monitor.id} value={String(monitor.id)}>
              {monitor.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value)
          }
        >
          <option value="ALL">全部类型</option>
          <option value="TREND_GOLDEN">金叉确认</option>
          <option value="TREND_DEATH">死叉确认</option>
          <option value="ENTRY_LONG">做多入场</option>
          <option value="ENTRY_SHORT">做空入场</option>
          <option value="TREND_INVALIDATED">等待失效</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">暂无信号记录</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>标的</th>
                <th>K 线</th>
                <th>监控项</th>
                <th>触发条件</th>
                <th>方向</th>
                <th>价格</th>
                <th>条件快照</th>
                <th>通知</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((signal) => (
                <tr key={signal.id}>
                  <td>{formatTime(signal.event_time)}</td>
                  <td>{signal.symbol}</td>
                  <td>{signal.interval ?? "--"}</td>
                  <td>{signal.monitor_name ?? "历史记录"}</td>
                  <td>{conditionLabel(signal.primary_condition)}</td>
                  <td
                    className={
                      signal.direction === "BULL"
                        ? "type-golden"
                        : signal.direction === "BEAR"
                          ? "type-death"
                          : "type-neutral"
                    }
                  >
                    {directionLabel(signal.direction)}
                  </td>
                  <td>{formatPrice(signal.price)}</td>
                  <td className="signal-conditions-cell">
                    {signal.conditions.length === 0
                      ? "--"
                      : signal.conditions
                          .map((condition) => {
                            const interval =
                              condition.interval ??
                              signal.interval ??
                              "--";
                            const summary =
                              condition.summary ??
                              conditionLabel(condition.kind);

                            return `[${interval}] ${
                              condition.role === "filter"
                                ? "过滤"
                                : "触发"
                            } ${summary}${
                              condition.legacy ? "（历史）" : ""
                            }`;
                          })
                          .join(" · ")}
                  </td>
                  <td
                    className={
                      signal.push_state === "FAILED"
                        ? "type-death"
                        : signal.push_state === "SENT"
                          ? "type-golden"
                          : "type-neutral"
                    }
                    title={signal.push_error ?? undefined}
                  >
                    {pushLabel(signal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
