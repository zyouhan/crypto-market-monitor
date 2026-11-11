"use client";

import { useMemo, useState } from "react";

import {
  eventTypeLabel,
  formatPrice,
  formatTime
} from "../lib/format";
import type { MonitorItem, MonitorSignalItem } from "../types";
import { referenceTagItems } from "../lib/reference-trends";
import { ReferenceTags } from "./ReferenceTags";

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

  if (kind === "VOLUME_SPIKE") {
    return "成交量放量";
  }

  if (kind === "PRICE_LEVEL") {
    return "到达价位";
  }

  if (kind === "MACD_DEA_TURN") {
    return "MACD DEA";
  }

  if (kind === "ADX_TREND") {
    return "ADX 趋势";
  }

  if (kind === "EMA_FAST_TURN") {
    return "EMA 快线";
  }

  if (kind === "RISK") {
    return "风险控制";
  }

  if (kind === "KDJ_TIMING") {
    return "KDJ 极值（旧）";
  }

  if (kind === "KDJ_ENTRY") {
    return "KDJ 入场（旧）";
  }

  if (kind === "EMA_TREND") {
    return "EMA 交叉（旧）";
  }

  return kind ?? "--";
}

function triggerDetail(signal: MonitorSignalItem): string {
  const trigger = signal.conditions.find(
    (condition) =>
      condition.role === "trigger" &&
      condition.kind === signal.primary_condition
  );
  const threshold =
    signal.threshold === null
      ? "--"
      : formatPrice(signal.threshold);
  const stop = trigger?.display?.find(
    (item) => item.label === "J钝化止损"
  );
  const numericStop =
    typeof signal.payload?.stopPrice === "number" &&
    Number.isFinite(signal.payload.stopPrice)
      ? signal.payload.stopPrice
      : null;
  const riskPct =
    numericStop !== null && signal.price > 0
      ? (Math.abs(signal.price - numericStop) /
          signal.price) *
        100
      : null;
  const stopSuffix =
    stop && stop.value !== "--"
      ? ` · 止损 ${stop.value}${
          riskPct !== null
            ? ` · 风险 ${riskPct.toFixed(2)}%`
            : ""
        }`
      : "";

  if (
    signal.primary_condition === "KDJ_EXTREME" ||
    signal.primary_condition === "KDJ_ENTRY" ||
    signal.primary_condition === "KDJ_TIMING"
  ) {
    if (signal.event_type === "ENTRY_LONG") {
      return `超卖 J<${threshold} 做多${stopSuffix}`;
    }

    if (signal.event_type === "ENTRY_SHORT") {
      return `超买 J>${threshold} 做空${stopSuffix}`;
    }
  }

  if (
    signal.primary_condition === "EMA_CROSS" ||
    signal.primary_condition === "EMA_TREND"
  ) {
    if (signal.event_type === "TREND_GOLDEN") {
      return `金叉 · ${trigger?.summary ?? "EMA"}`;
    }

    if (signal.event_type === "TREND_DEATH") {
      return `死叉 · ${trigger?.summary ?? "EMA"}`;
    }
  }

  if (signal.event_type === "VOLUME_SPIKE") {
    return `放量 · ${trigger?.summary ?? "成交量"}`;
  }

  if (signal.event_type === "PRICE_LEVEL") {
    return `到价 · ${trigger?.summary ?? "价位"}`;
  }

  if (signal.event_type === "MACD_DEA_TURN") {
    return `${
      signal.direction === "BULL" ? "DEA 向上拐头" : "DEA 向下拐头"
    } · ${trigger?.summary ?? "MACD"}`;
  }

  if (signal.event_type === "STOP_LOSS_HIT") {
    const entryPrice = signal.payload?.entryPrice;
    const stopPrice = signal.payload?.stopPrice;

    return `止损触发 · 入场 ${
      typeof entryPrice === "number"
        ? formatPrice(entryPrice)
        : "--"
    } · 止损 ${
      typeof stopPrice === "number"
        ? formatPrice(stopPrice)
        : "--"
    }`;
  }

  if (signal.event_type === "ADX_TREND") {
    return `${signal.direction === "BULL" ? "多头趋势" : "空头趋势"} · ${
      trigger?.summary ?? "ADX"
    }`;
  }

  if (signal.event_type === "EMA_FAST_TURN") {
    return `${
      signal.direction === "BULL" ? "快线向上拐头" : "快线向下拐头"
    } · ${trigger?.summary ?? "EMA"}`;
  }

  if (
    signal.event_type === "TRADE_1R" ||
    signal.event_type === "TRADE_BREAKEVEN"
  ) {
    const entryPrice = signal.payload?.entryPrice;
    const stopPrice = signal.payload?.stopPrice;

    return `${
      signal.event_type === "TRADE_1R"
        ? "达到 1R"
        : "回到入场价"
    } · 入场 ${
      typeof entryPrice === "number"
        ? formatPrice(entryPrice)
        : "--"
    } · 止损 ${
      typeof stopPrice === "number"
        ? formatPrice(stopPrice)
        : "--"
    }`;
  }

  return trigger?.summary ?? eventTypeLabel(signal.event_type);
}

const HIDDEN_SIGNAL_TYPES = new Set([
  "STOP_LOSS_HIT",
  "TRADE_1R",
  "TRADE_BREAKEVEN"
]);

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
        if (HIDDEN_SIGNAL_TYPES.has(signal.event_type)) {
          return false;
        }

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
          <option value="VOLUME_SPIKE">成交量放量</option>
          <option value="PRICE_LEVEL">到达价位</option>
          <option value="MACD_DEA_TURN">MACD DEA 拐头</option>
          <option value="ADX_TREND">ADX 趋势</option>
          <option value="EMA_FAST_TURN">EMA 快线拐头</option>
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
                <th>触发详情</th>
                <th>大级别</th>
                <th>方向</th>
                <th>价格</th>
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
                    className="signal-trigger-detail"
                    title={signal.conditions
                      .map(
                        (condition) =>
                          `[${condition.interval}] ${
                            condition.role === "filter"
                              ? "过滤"
                              : "触发"
                          } ${condition.summary}`
                      )
                      .join(" · ")}
                  >
                    {triggerDetail(signal)}
                  </td>
                  <td>
                    <ReferenceTags
                      items={referenceTagItems(
                        signal.reference_trends
                      )}
                    />
                  </td>
                  <td>
                    <span
                      className={`direction-badge ${
                        signal.direction === "BULL"
                          ? "bull"
                          : signal.direction === "BEAR"
                            ? "bear"
                            : "neutral"
                      }`}
                    >
                      {signal.direction === "BULL"
                        ? "↗ 做多"
                        : signal.direction === "BEAR"
                          ? "↘ 做空"
                          : "—"}
                    </span>
                  </td>
                  <td>{formatPrice(signal.price)}</td>
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
