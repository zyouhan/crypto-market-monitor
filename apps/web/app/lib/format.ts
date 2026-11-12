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

  if (kind === "KDJ_TIMING") {
    return "简易 J 值";
  }

  return kind;
}

export function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "TREND_GOLDEN":
      return "金叉确认";
    case "TREND_DEATH":
      return "死叉确认";
    case "TREND_INVALIDATED":
      return "等待失效";
    case "ENTRY_LONG":
      return "做多入场";
    case "ENTRY_SHORT":
      return "做空入场";
    case "VOLUME_SPIKE":
      return "成交量放量";
    case "PRICE_LEVEL":
      return "到达价位";
    case "MACD_DEA_TURN":
      return "MACD DEA 拐头";
    case "LONG_ZONE_START":
      return "进入多头区间";
    case "LONG_ZONE_EXHAUST":
      return "多头区间衰竭";
    case "SHORT_ZONE_START":
      return "进入空头区间";
    case "SHORT_ZONE_EXHAUST":
      return "空头区间衰竭";
    case "DIF_ZERO_UP":
      return "DIF 上穿零轴";
    case "DIF_ZERO_DOWN":
      return "DIF 下穿零轴";
    case "STOP_LOSS_HIT":
      return "止损触发";
    case "ADX_TREND":
      return "ADX 趋势";
    case "EMA_FAST_TURN":
      return "EMA 快线拐头";
    case "TRADE_1R":
      return "达到 1R";
    case "TRADE_BREAKEVEN":
      return "回到入场价";
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
      return "价格差未达阈值";
    case "ema_diff_not_exceeded":
      return "EMA 距离未达阈值";
    case "ema_reverse_deviation":
      return "EMA 反向偏离";
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

export function signalJValue(
  signal: SignalItem
): number | null {
  const value = signal.payload?.j;

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

/**
 * 需要在前端提示的触发性信号。
 * 风险类提醒（止损、1R、回到入场价）暂时不向前端推送。
 */
export function isAlertSignal(signal: {
  trigger_met: number;
  event_type: string;
}): boolean {
  if (signal.trigger_met !== 1) {
    return false;
  }

  return (
    signal.event_type === "TREND_GOLDEN" ||
    signal.event_type === "TREND_DEATH" ||
    signal.event_type === "ENTRY_LONG" ||
    signal.event_type === "ENTRY_SHORT" ||
    signal.event_type === "VOLUME_SPIKE" ||
    signal.event_type === "PRICE_LEVEL" ||
    signal.event_type === "MACD_DEA_TURN" ||
    signal.event_type === "LONG_ZONE_START" ||
    signal.event_type === "LONG_ZONE_EXHAUST" ||
    signal.event_type === "SHORT_ZONE_START" ||
    signal.event_type === "SHORT_ZONE_EXHAUST" ||
    signal.event_type === "DIF_ZERO_UP" ||
    signal.event_type === "DIF_ZERO_DOWN" ||
    signal.event_type === "ADX_TREND" ||
    signal.event_type === "EMA_FAST_TURN"
  );
}

export function signalTone(
  signal: SignalItem
): "bull" | "bear" | "neutral" {
  if (signal.direction === "BULL") {
    return "bull";
  }

  if (signal.direction === "BEAR") {
    return "bear";
  }

  return "neutral";
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
