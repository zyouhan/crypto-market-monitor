export const STATS_RESULT_VALUES = [
  "light_success",
  "heavy_success",
  "light_reasonable_stop",
  "heavy_reasonable_stop",
  "light_failed",
  "heavy_failed",
  "other"
] as const;

export type StatsResult = (typeof STATS_RESULT_VALUES)[number];

export const STATS_RESULT_LABELS: Record<StatsResult, string> = {
  light_success: "轻仓成功",
  heavy_success: "重仓成功",
  light_reasonable_stop: "轻仓合理止损",
  heavy_reasonable_stop: "重仓合理止损",
  light_failed: "轻仓失败",
  heavy_failed: "重仓失败",
  other: "其他"
};

export function isStatsResult(value: unknown): value is StatsResult {
  return (
    typeof value === "string" &&
    (STATS_RESULT_VALUES as readonly string[]).includes(value)
  );
}

export function statsResultLabel(
  value: string | null
): string {
  if (!value) {
    return "未填写";
  }

  return isStatsResult(value)
    ? STATS_RESULT_LABELS[value]
    : "未填写";
}
