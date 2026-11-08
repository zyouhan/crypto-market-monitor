import type { SignalItem } from "../types";

export function formatPrice(
  value: number | null | undefined
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8
  });
}

export function formatFixed(
  value: number | null | undefined,
  digits = 2
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

export function formatTime(
  value: number | null | undefined
): string {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

export function crossName(
  type: string | null | undefined
): string {
  if (type === "GOLDEN") {
    return "金叉";
  }

  if (type === "DEATH") {
    return "死叉";
  }

  return "暂无交叉";
}

export function trendLabel(status: string | undefined): string {
  if (status === "BULL_WAITING") {
    return "看涨等待";
  }

  if (status === "BEAR_WAITING") {
    return "看跌等待";
  }

  return "中性";
}

export function trendClass(status: string | undefined): string {
  if (status === "BULL_WAITING") {
    return "golden";
  }

  if (status === "BEAR_WAITING") {
    return "death";
  }

  return "unknown";
}

export function entryLabel(
  status: string | undefined,
  oversold: number,
  overbought: number
): string {
  if (status === "ARMED_LONG") {
    return `等待 J<${oversold} 做多`;
  }

  if (status === "ARMED_SHORT") {
    return `等待 J>${overbought} 做空`;
  }

  return "当前无入场方向";
}

export function jClass(
  value: number | null,
  oversold: number,
  overbought: number
): string {
  if (value === null) {
    return "";
  }

  if (value < oversold) {
    return "oversold";
  }

  if (value > overbought) {
    return "overbought";
  }

  return "";
}

export function kindLabel(kind: string): string {
  if (kind === "EMA_TREND") {
    return "EMA 趋势";
  }

  if (kind === "KDJ_ENTRY") {
    return "KDJ 入场";
  }

  return kind;
}

export function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "TREND_GOLDEN":
      return "金叉确认";
    case "TREND_DEATH":
      return "死叉确认";
    case "ENTRY_LONG":
      return "做多入场";
    case "ENTRY_SHORT":
      return "做空入场";
    default:
      return eventType;
  }
}

export function directionLabel(
  direction: string | null
): string {
  if (direction === "BULL") {
    return "看涨";
  }

  if (direction === "BEAR") {
    return "看跌";
  }

  return "--";
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "price_diff_not_exceeded":
      return "未达阈值";
    case "stale_cross_suppressed":
    case "stale_signal_suppressed":
      return "过期抑制";
    case "global_notification_disabled":
      return "全局通知关闭";
    case "symbol_notification_disabled":
      return "标的通知关闭";
    case "strategy_notification_disabled":
      return "策略通知关闭";
    case "serverchan_sendkey_missing":
      return "未配置 SendKey";
    case "notification_failed":
      return "发送失败";
    default:
      return reason ?? "未发送";
  }
}

export function pushStateLabel(signal: SignalItem): string {
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

  return reasonLabel(signal.reason);
}
