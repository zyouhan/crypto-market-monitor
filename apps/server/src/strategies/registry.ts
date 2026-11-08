import type { StrategyKind } from "../db/types";

import { emaTrendRunner } from "./ema-trend";
import { kdjEntryRunner } from "./kdj-entry";
import { kdjTimingRunner } from "./kdj-timing";
import type { StrategyRunner } from "./types";

/**
 * 策略注册表。
 *
 * 新增指标（例如 MACD）时：
 * 1. 在 indicators/ 增加纯计算模块；
 * 2. 在 strategies/ 增加 runner 实现；
 * 3. 在这里注册一行。
 */
export const STRATEGY_RUNNERS: Record<
  StrategyKind,
  StrategyRunner
> = {
  EMA_TREND: emaTrendRunner,
  KDJ_ENTRY: kdjEntryRunner,
  KDJ_TIMING: kdjTimingRunner
};

export const STRATEGY_KINDS = Object.keys(
  STRATEGY_RUNNERS
) as StrategyKind[];

export function isStrategyKind(
  value: unknown
): value is StrategyKind {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      STRATEGY_RUNNERS,
      value
    )
  );
}

export function getRunner(kind: StrategyKind): StrategyRunner {
  const runner = STRATEGY_RUNNERS[kind];

  if (!runner) {
    throw new Error(`未知策略类型: ${kind}`);
  }

  return runner;
}
