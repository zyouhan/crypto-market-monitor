export type TradeQuality = "excellent" | "good" | "fair" | "poor";
export type SelfCheckResult = "success" | "failed";

export function evaluateExecutionResult(
  qualities: TradeQuality[]
): SelfCheckResult {
  const poorCount = qualities.filter(
    (quality) => quality === "poor"
  ).length;
  const fairCount = qualities.filter(
    (quality) => quality === "fair"
  ).length;

  return poorCount > 0 || fairCount >= 3
    ? "failed"
    : "success";
}
