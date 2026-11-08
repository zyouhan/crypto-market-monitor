"use client";

import { useMemo, useState } from "react";

import {
  directionLabel,
  eventTypeLabel,
  formatFixed,
  formatPrice,
  formatTime,
  kindLabel,
  pushStateLabel,
  signalJValue
} from "../lib/format";
import type { SignalItem } from "../types";

interface SignalTableProps {
  signals: SignalItem[];
  symbols: string[];
}

export function SignalTable({
  signals,
  symbols
}: SignalTableProps) {
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const symbolOptions = useMemo(() => {
    const values = new Set<string>(symbols);

    for (const signal of signals) {
      values.add(signal.symbol);
    }

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [signals, symbols]);

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
          kindFilter !== "ALL" &&
          signal.kind !== kindFilter
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
    [signals, symbolFilter, kindFilter, typeFilter]
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
          value={kindFilter}
          onChange={(event) =>
            setKindFilter(event.target.value)
          }
        >
          <option value="ALL">全部指标</option>
          <option value="EMA_TREND">EMA 趋势</option>
          <option value="KDJ_ENTRY">KDJ 入场</option>
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
                <th>指标</th>
                <th>类型</th>
                <th>方向</th>
                <th>价格</th>
                <th>EMA 距离 / 阈值</th>
                <th>J 值</th>
                <th>通知</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((signal) => {
                const jValue = signalJValue(signal);

                return (
                  <tr key={signal.id}>
                    <td>{formatTime(signal.event_time)}</td>
                    <td>{signal.symbol}</td>
                    <td>{kindLabel(signal.kind)}</td>
                    <td
                      className={
                        signal.direction === "BULL"
                          ? "type-golden"
                          : signal.direction === "BEAR"
                            ? "type-death"
                            : "type-neutral"
                      }
                    >
                      {eventTypeLabel(signal.event_type)}
                    </td>
                    <td>{directionLabel(signal.direction)}</td>
                    <td>{formatPrice(signal.price)}</td>
                    <td
                      title={
                        signal.price_diff !== null
                          ? `价格差 ${formatPrice(
                              signal.price_diff
                            )}`
                          : undefined
                      }
                    >
                      {formatPrice(signal.ema_diff)} /{" "}
                      {formatPrice(signal.threshold)}
                    </td>
                    <td>{formatFixed(jValue, 2)}</td>
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
                      {pushStateLabel(signal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
