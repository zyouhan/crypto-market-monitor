import type {
  CrossType,
  EntryStatus,
  SignalDirection,
  SignalEventType,
  StrategyKind,
  TrendStatus
} from "../db/types";
import type { Kline } from "../indicators/types";

import type { StrategyParams } from "./params";

export interface SignalDraft {
  kind: StrategyKind;
  eventType: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  eventTime: number;
  threshold: number | null;
  priceDiff: number | null;
  emaDiff: number | null;
  triggerMet: boolean;
  reason: string | null;
  payload: Record<string, unknown> | null;
}

export interface StrategyStateView {
  status: TrendStatus | EntryStatus;
  baselineType: CrossType | null;
  baselinePrice: number | null;
  baselineEma: number | null;
  baselineTime: number | null;
  extra: Record<string, unknown>;
}

/**
 * 同一标的多个策略共享的上下文。
 * EMA_TREND 先执行并写入 trend / trendByCloseTime，
 * KDJ_ENTRY 读取逐根 K 线的趋势。
 */
export interface SharedContext {
  trend: TrendStatus;
  trendByCloseTime: Map<number, TrendStatus>;
}

export interface StrategyRunInput {
  state: StrategyStateView;
  params: StrategyParams;
  klines: Kline[];
  newKlines: Kline[];
  warmup: boolean;
  shared: SharedContext;
}

export interface StrategyRunResult {
  state: StrategyStateView;
  signals: SignalDraft[];
}

export interface StrategyRunner {
  kind: StrategyKind;
  sortOrder: number;
  defaultParams(): StrategyParams;
  normalizeParams(
    raw: unknown,
    klineLimit: number
  ): StrategyParams;
  run(input: StrategyRunInput): StrategyRunResult;
}
