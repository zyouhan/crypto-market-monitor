import { calculateMACD, DEFAULT_MACD_PARAMS } from "../indicators/macd";
import type { Kline } from "../indicators/types";

export const REFERENCE_INTERVALS = ["15m", "1h", "4h"] as const;

export type ReferenceInterval =
  (typeof REFERENCE_INTERVALS)[number];

export interface ReferenceTrend {
  interval: ReferenceInterval;
  direction: "up" | "down";
  turning: boolean;
  accelerating: boolean;
  weakening: boolean;
  dea: number;
  time: number;
}

export type ReferenceTrendMap = Partial<
  Record<ReferenceInterval, ReferenceTrend | null>
>;

function isReferenceInterval(
  value: string
): value is ReferenceInterval {
  return (REFERENCE_INTERVALS as readonly string[]).includes(
    value
  );
}

export function parseReferenceIntervals(
  value: unknown
): ReferenceInterval[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const selected = new Set(
    value.filter(
      (item): item is ReferenceInterval =>
        typeof item === "string" &&
        isReferenceInterval(item)
    )
  );

  return REFERENCE_INTERVALS.filter((interval) =>
    selected.has(interval)
  );
}

export function calculateReferenceTrend(
  interval: ReferenceInterval,
  klines: Kline[],
  eventTime: number
): ReferenceTrend | null {
  if (klines.length === 0) {
    return null;
  }

  const macd = calculateMACD(
    klines,
    DEFAULT_MACD_PARAMS
  );
  let index = -1;

  for (let i = 0; i < macd.length; i += 1) {
    if (macd[i].time > eventTime) {
      break;
    }

    index = i;
  }

  if (index < 2) {
    return null;
  }

  const current = macd[index];
  const previous = macd[index - 1];
  const previous2 = macd[index - 2];

  if (
    current.dea === null ||
    previous.dea === null ||
    previous2.dea === null
  ) {
    return null;
  }

  const currentDelta = current.dea - previous.dea;
  const previousDelta = previous.dea - previous2.dea;
  const sameDirection =
    currentDelta !== 0 &&
    previousDelta !== 0 &&
    Math.sign(currentDelta) === Math.sign(previousDelta);
  const direction =
    current.dea >= previous.dea ? "up" : "down";
  const turning =
    (previousDelta <= 0 && currentDelta > 0) ||
    (previousDelta >= 0 && currentDelta < 0);

  return {
    interval,
    direction,
    turning,
    accelerating:
      sameDirection &&
      Math.abs(currentDelta) > Math.abs(previousDelta),
    weakening:
      sameDirection &&
      Math.abs(currentDelta) < Math.abs(previousDelta),
    dea: current.dea,
    time: current.time
  };
}

export function buildReferenceTrends(
  intervals: readonly ReferenceInterval[],
  klinesByInterval: Map<string, Kline[]>,
  eventTime: number
): ReferenceTrendMap {
  const trends: ReferenceTrendMap = {};

  for (const interval of intervals) {
    trends[interval] = calculateReferenceTrend(
      interval,
      klinesByInterval.get(interval) ?? [],
      eventTime
    );
  }

  return trends;
}
