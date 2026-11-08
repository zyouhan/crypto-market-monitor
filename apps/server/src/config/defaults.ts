import type { StrategyKind } from "../db/types";

import {
  DEFAULT_EMA_PARAMS,
  DEFAULT_KDJ_PARAMS,
  type StrategyParams
} from "../strategies/params";

export interface StrategySeed {
  kind: StrategyKind;
  enabled: number;
  notify_enabled: number;
  params: StrategyParams;
  sort_order: number;
}

export const DEFAULT_STRATEGIES: StrategySeed[] = [
  {
    kind: "EMA_TREND",
    enabled: 1,
    notify_enabled: 1,
    params: DEFAULT_EMA_PARAMS,
    sort_order: 0
  },
  {
    kind: "KDJ_ENTRY",
    enabled: 1,
    notify_enabled: 1,
    params: DEFAULT_KDJ_PARAMS,
    sort_order: 1
  }
];

export const DEFAULT_SYMBOLS = ["ETHUSDT", "BTCUSDT"];

export const DEFAULT_INTERVAL = "1m";

/**
 * 事件时间早于 now - STALE_CANDLES × 周期，
 * 视为历史信号，只落库不推送。
 */
export const STALE_CANDLES = 2;
