import { getMarketKlines } from "../market";
import {
  analyzeKlines,
  emptySelfCheckAnalysis,
  type SelfCheckAnalysis
} from "./self-check-analysis";

export const SELF_CHECK_INTERVALS = [
  "1d",
  "4h",
  "1h",
  "15m",
  "5m"
] as const;

export type SelfCheckInterval =
  (typeof SELF_CHECK_INTERVALS)[number];

export interface SelfCheckIntervalSnapshot
  extends SelfCheckAnalysis {
  interval: SelfCheckInterval;
  source: string | null;
  error: string | null;
}

interface CacheEntry {
  expiresAt: number;
  snapshot: SelfCheckIntervalSnapshot;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000;
const ERROR_CACHE_TTL = 10_000;

function emptySnapshot(
  interval: SelfCheckInterval,
  error: string
): SelfCheckIntervalSnapshot {
  return {
    interval,
    ...emptySelfCheckAnalysis(),
    source: null,
    error
  };
}

async function loadInterval(
  symbol: string,
  interval: SelfCheckInterval
): Promise<SelfCheckIntervalSnapshot> {
  const key = `${symbol}:${interval}`;
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  try {
    const market = await getMarketKlines(symbol, interval, 300);
    const snapshot: SelfCheckIntervalSnapshot = {
      interval,
      ...analyzeKlines(market.klines),
      source: market.source,
      error: null
    };

    cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL,
      snapshot
    });

    return snapshot;
  } catch (error) {
    const snapshot = emptySnapshot(
      interval,
      error instanceof Error ? error.message : "行情获取失败"
    );

    cache.set(key, {
      expiresAt: Date.now() + ERROR_CACHE_TTL,
      snapshot
    });

    return snapshot;
  }
}

export async function buildSelfCheckSnapshot(
  symbol: string
): Promise<SelfCheckIntervalSnapshot[]> {
  return Promise.all(
    SELF_CHECK_INTERVALS.map((interval) =>
      loadInterval(symbol, interval)
    )
  );
}
