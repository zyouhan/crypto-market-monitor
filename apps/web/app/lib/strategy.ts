import type {
  EmaParams,
  KdjParams,
  StrategyItem,
  SymbolItem
} from "../types";

export const DEFAULT_EMA: EmaParams = {
  fast: 25,
  slow: 60,
  threshold: 10
};

export const DEFAULT_KDJ: KdjParams = {
  period: 9,
  kSmooth: 3,
  dSmooth: 3,
  oversold: 5,
  overbought: 85,
  longEnabled: true,
  shortEnabled: true
};

export interface EmaConfig extends EmaParams {
  enabled: boolean;
  notify: boolean;
}

export interface KdjConfig extends KdjParams {
  enabled: boolean;
  notify: boolean;
}

function findStrategy(
  item: SymbolItem,
  kind: StrategyItem["kind"]
): StrategyItem | undefined {
  return item.strategies.find(
    (strategy) => strategy.kind === kind
  );
}

export function getEmaConfig(item: SymbolItem): EmaConfig {
  const strategy = findStrategy(item, "EMA_TREND");
  const params = strategy?.params ?? {};

  return {
    fast: numberOr(params.fast, DEFAULT_EMA.fast),
    slow: numberOr(params.slow, DEFAULT_EMA.slow),
    threshold: numberOr(
      params.threshold,
      DEFAULT_EMA.threshold
    ),
    enabled: (strategy?.enabled ?? 0) === 1,
    notify: (strategy?.notify_enabled ?? 0) === 1
  };
}

export function getKdjConfig(item: SymbolItem): KdjConfig {
  const strategy = findStrategy(item, "KDJ_ENTRY");
  const params = strategy?.params ?? {};

  return {
    period: numberOr(params.period, DEFAULT_KDJ.period),
    kSmooth: numberOr(params.kSmooth, DEFAULT_KDJ.kSmooth),
    dSmooth: numberOr(params.dSmooth, DEFAULT_KDJ.dSmooth),
    oversold: numberOr(params.oversold, DEFAULT_KDJ.oversold),
    overbought: numberOr(
      params.overbought,
      DEFAULT_KDJ.overbought
    ),
    longEnabled: params.longEnabled !== false,
    shortEnabled: params.shortEnabled !== false,
    enabled: (strategy?.enabled ?? 0) === 1,
    notify: (strategy?.notify_enabled ?? 0) === 1
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export type EmaAlignment = "BULL" | "BEAR" | null;

/**
 * EMA 排列：快线在慢线上方为多头排列。
 *
 * 入场要求等待方向与排列一致，避免在上涨中反复提示做空。
 */
export function getEmaAlignment(
  item: SymbolItem
): EmaAlignment {
  const extra = item.states.EMA_TREND?.extra;

  if (typeof extra?.aligned === "boolean") {
    return extra.aligned ? "BULL" : "BEAR";
  }

  const fast =
    typeof extra?.emaFast === "number"
      ? extra.emaFast
      : null;

  const slow =
    typeof extra?.emaSlow === "number"
      ? extra.emaSlow
      : null;

  if (fast !== null && slow !== null) {
    return fast > slow ? "BULL" : "BEAR";
  }

  return null;
}

export function getExtraNumber(
  item: SymbolItem,
  kind: StrategyItem["kind"],
  key: string
): number | null {
  const value = item.states[kind]?.extra?.[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}
