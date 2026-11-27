/**
 * 开单自查的 6 种做单场景。
 *
 * 前端 apps/web/app/lib/self-check.ts 里有一份同值同标签的常量，
 * 修改时两边必须同步。
 */
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

export type SelfCheckScenarioDefinition =
  (typeof SELF_CHECK_SCENARIOS)[number];

export type SelfCheckScenarioValue =
  SelfCheckScenarioDefinition["value"];

export function findSelfCheckScenario(
  value: unknown
): SelfCheckScenarioDefinition | null {
  if (typeof value !== "string") {
    return null;
  }

  return (
    SELF_CHECK_SCENARIOS.find(
      (scenario) => scenario.value === value
    ) ?? null
  );
}
