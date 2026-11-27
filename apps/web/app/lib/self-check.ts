import type {
  SelfCheckIntervalSnapshot,
  SelfCheckKdjZone,
  SelfCheckSpreadState,
  SelfCheckTrendStrength
} from "../types";

export const SELF_CHECK_SCENARIOS = [
  {
    value: "bull_pullback_long",
    direction: "BULL",
    label: "多头趋势回调做多（跟随）"
  },
  {
    value: "bull_top_short",
    direction: "BEAR",
    label: "多头趋势冲顶做空（反弹）"
  },
  {
    value: "bull_exhaustion_short",
    direction: "BEAR",
    label: "多头趋势衰竭做空（反转）"
  },
  {
    value: "bear_pullback_short",
    direction: "BEAR",
    label: "空头趋势回调做空（跟随）"
  },
  {
    value: "bear_bottom_long",
    direction: "BULL",
    label: "空头趋势赶底做多（反弹）"
  },
  {
    value: "bear_exhaustion_long",
    direction: "BULL",
    label: "空头趋势衰竭做多（反转）"
  }
] as const;

export type SelfCheckScenarioValue =
  (typeof SELF_CHECK_SCENARIOS)[number]["value"];

export type SelfCheckScenarioDirection =
  (typeof SELF_CHECK_SCENARIOS)[number]["direction"];

export const SELF_CHECK_ANALYSIS_INTERVALS = [
  "1d",
  "4h",
  "1h",
  "15m",
  "5m"
] as const;

export type SelfCheckAnalysisInterval =
  (typeof SELF_CHECK_ANALYSIS_INTERVALS)[number];

/** 1m 只用于兼容旧自查记录。 */
export const SELF_CHECK_LEVEL_ORDER = [
  "1d",
  "4h",
  "1h",
  "15m",
  "5m",
  "1m"
] as const;

export function findSelfCheckScenario(
  value: string | null | undefined
) {
  return (
    SELF_CHECK_SCENARIOS.find(
      (scenario) => scenario.value === value
    ) ?? null
  );
}

export function scenarioLabel(
  value: string | null | undefined
): string {
  return findSelfCheckScenario(value)?.label ?? "未分类";
}

export function scenarioDirection(
  value: SelfCheckScenarioValue
): SelfCheckScenarioDirection {
  return (
    findSelfCheckScenario(value)?.direction ?? "BULL"
  );
}

export function intervalLabel(interval: string): string {
  if (interval === "1d") {
    return "日线";
  }

  if (interval === "1m") {
    return "1m（旧）";
  }

  return interval;
}

export function sortSnapshots(
  snapshots: SelfCheckIntervalSnapshot[]
): SelfCheckIntervalSnapshot[] {
  const order = new Map<string, number>(
    SELF_CHECK_LEVEL_ORDER.map((interval, index) => [
      interval,
      index
    ])
  );

  return [...snapshots].sort(
    (left, right) =>
      (order.get(left.interval) ?? 99) -
      (order.get(right.interval) ?? 99)
  );
}

export function mergeSnapshots(
  stored: SelfCheckIntervalSnapshot[] | null | undefined,
  live: SelfCheckIntervalSnapshot[] | null | undefined
): SelfCheckIntervalSnapshot[] {
  const byInterval = new Map<string, SelfCheckIntervalSnapshot>();

  for (const snapshot of stored ?? []) {
    byInterval.set(snapshot.interval, snapshot);
  }

  for (const snapshot of live ?? []) {
    byInterval.set(snapshot.interval, snapshot);
  }

  return sortSnapshots(Array.from(byInterval.values()));
}

export function formatDurationMinutes(
  minutes: number | null | undefined
): string {
  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes)
  ) {
    return "时长未知";
  }

  const total = Math.max(0, Math.floor(minutes));

  if (total < 1) {
    return "不足 1 分钟";
  }

  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;

  if (days > 0) {
    return `${days} 天 ${hours} 小时 ${rest} 分钟`;
  }

  if (hours > 0) {
    return `${hours} 小时 ${rest} 分钟`;
  }

  return `${rest} 分钟`;
}

export function emaArrangementLabel(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  if (snapshot?.ema_arrangement === "bull") {
    return "多头排列";
  }

  if (snapshot?.ema_arrangement === "bear") {
    return "空头排列";
  }

  return "排列不明";
}

export function emaArrangementTone(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): "bull" | "bear" | "flat" {
  return snapshot?.ema_arrangement ?? "flat";
}

export function spreadLabel(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  const state: SelfCheckSpreadState | undefined =
    snapshot?.ema_spread_state;

  if (state === "expanding") {
    return "间距扩大";
  }

  if (state === "contracting") {
    return "间距收缩";
  }

  if (state === "flat") {
    return "间距走平";
  }

  return "间距未知";
}

export function spreadTone(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): "expand" | "contract" | "flat" {
  if (snapshot?.ema_spread_state === "expanding") {
    return "expand";
  }

  if (snapshot?.ema_spread_state === "contracting") {
    return "contract";
  }

  return "flat";
}

export function trendStrengthOf(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): SelfCheckTrendStrength {
  if (snapshot?.trend_strength) {
    return snapshot.trend_strength;
  }

  // 旧快照兜底：把 MACD 强/中/弱/拐头映射到三档。
  if (snapshot?.strength === "强") {
    return "strong";
  }

  if (
    snapshot?.strength === "弱" ||
    snapshot?.strength === "拐头"
  ) {
    return "weak";
  }

  return "unclear";
}

export function trendStrengthLabel(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  const strength = trendStrengthOf(snapshot);

  if (strength === "strong") {
    return "力量强劲";
  }

  if (strength === "weak") {
    return "力量较弱";
  }

  return "力量不明";
}

export function kdjZoneOf(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): SelfCheckKdjZone {
  if (snapshot?.kdj_zone) {
    return snapshot.kdj_zone;
  }

  const j = snapshot?.j;

  if (typeof j !== "number" || !Number.isFinite(j)) {
    return "unknown";
  }


  if (j > 80) {
    return "overbought";
  }

  if (j < 20) {
    return "oversold";
  }

  return "neutral";
}

export function kdjZoneLabel(
  zone: SelfCheckKdjZone
): string {
  if (zone === "overbought") {
    return "超买";
  }

  if (zone === "oversold") {
    return "超卖";
  }

  if (zone === "neutral") {
    return "中性";
  }

  return "未知";
}

function formatIndicatorValue(
  value: number | null | undefined,
  digits = 2
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "--";
}

export function kdjText(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  if (
    typeof snapshot?.j !== "number" ||
    !Number.isFinite(snapshot.j)
  ) {
    return "KDJ 数据不足";
  }

  return `KDJ J ${formatIndicatorValue(snapshot.j)} · ${kdjZoneLabel(
    kdjZoneOf(snapshot)
  )}`;
}

export function kdjDetailText(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  if (
    typeof snapshot?.j !== "number" ||
    !Number.isFinite(snapshot.j)
  ) {
    return "KDJ 数据不足";
  }

  return `KDJ J ${formatIndicatorValue(
    snapshot.j
  )} / K ${formatIndicatorValue(
    snapshot.k
  )} / D ${formatIndicatorValue(
    snapshot.d
  )} · ${kdjZoneLabel(kdjZoneOf(snapshot))}`;
}

export function macdText(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  const zone =
    snapshot?.macd_zone === "above"
      ? "零轴上"
      : snapshot?.macd_zone === "below"
        ? "零轴下"
        : snapshot?.macd_zone === "mixed"
          ? "零轴附近"
          : "零轴未知";
  const cross =
    snapshot?.macd_cross === "golden"
      ? "金叉"
      : snapshot?.macd_cross === "death"
        ? "死叉"
        : "交叉未知";
  const histogram =
    snapshot?.macd_histogram_state === "expanding"
      ? "柱放大"
      : snapshot?.macd_histogram_state === "contracting"
        ? "柱缩小"
        : snapshot?.macd_histogram_state === "flat"
          ? "柱走平"
          : "柱未知";

  if (
    (!snapshot?.macd_zone ||
      snapshot.macd_zone === "unknown") &&
    (!snapshot?.macd_cross ||
      snapshot.macd_cross === "unknown") &&
    (!snapshot?.macd_histogram_state ||
      snapshot.macd_histogram_state === "unknown")
  ) {
    return "MACD 数据不足";
  }

  return `MACD ${zone} · ${cross} · ${histogram}`;
}

export function volumeText(
  snapshot: SelfCheckIntervalSnapshot | null | undefined
): string {
  const ratio = snapshot?.volume_ratio;

  if (
    typeof ratio !== "number" ||
    !Number.isFinite(ratio) ||
    !snapshot?.volume_state ||
    snapshot.volume_state === "unknown"
  ) {
    return "量能数据不足";
  }

  const label =
    snapshot.volume_state === "high"
      ? "放量"
      : snapshot.volume_state === "low"
        ? "缩量"
        : "正常";

  return `量能 ${ratio.toFixed(2)}x · ${label}`;
}

export function scenarioDirectionLabel(
  direction: SelfCheckScenarioDirection
): string {
  return direction === "BULL" ? "做多" : "做空";
}
