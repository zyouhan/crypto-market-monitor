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
  triggerMet: boolean;
  reason: string | null;
  payload: Record<string, unknown> | null;
}

export interface StrategyStateView {
  status: TrendStatus | EntryStatus;
  baselineType: CrossType | null;
  baselinePrice: number | null;
  baselineTime: number | null;
  extra: Record<string, unknown>;
}

/**
 * 同一标的多个策略共享的上下文。
 * EMA_TREND 先执行并写入 trend / trendByCloseTime / alignment，
 * KDJ_ENTRY 读取逐根 K 线的趋势与排列，避免用“批量处理后的最终状态”
 * 去评估历史 K 线，也避免逆着 EMA 排列做入场。
 */
export interface SharedContext {
  trend: TrendStatus;
  trendByCloseTime: Map<number, TrendStatus>;
  /**
   * EMA 排列：true = 快线在慢线上方（多头排列），
   * false = 快线在慢线下方（空头排列），null = 数据不足。
   */
  alignment: boolean | null;
  alignmentByCloseTime: Map<number, boolean>;
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
