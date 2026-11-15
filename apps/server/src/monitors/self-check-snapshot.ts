import { calculateKDJ } from "../indicators/kdj";
import { calculateMACD, DEFAULT_MACD_PARAMS } from "../indicators/macd";
import { getMarketKlines } from "../market";

export const SELF_CHECK_INTERVALS = ["5m", "15m", "1h", "4h"] as const;

export type SelfCheckInterval =
  (typeof SELF_CHECK_INTERVALS)[number];

export type SelfCheckDemand = "上涨需求" | "下跌需求" | null;

export interface SelfCheckIntervalSnapshot {
  interval: SelfCheckInterval;
  trend: "up" | "down";
  strength: "强" | "中" | "弱" | "拐头";
  strength_pct: number;
  j: number | null;
  k: number | null;
  d: number | null;
  demand: SelfCheckDemand;
  source: string | null;
  time: number | null;
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
    trend: "down",
    strength: "弱",
    strength_pct: 0,
    j: null,
    k: null,
    d: null,
    demand: null,
    source: null,
    time: null,
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
    const macd = calculateMACD(market.klines, DEFAULT_MACD_PARAMS);
    const kdj = calculateKDJ(market.klines, {
      period: 9,
      kSmooth: 3,
      dSmooth: 3
    });
    const lastIndex = macd.length - 1;
    const last = macd[lastIndex];
    const previous = macd[lastIndex - 1];
    const previous2 = macd[lastIndex - 2];

    if (
      !last ||
      !previous ||
      !previous2 ||
      last.dea === null ||
      previous.dea === null ||
      previous2.dea === null
    ) {
      throw new Error("DEA 数据不足");
    }

    const currentDelta = last.dea - previous.dea;
    const previousDelta = previous.dea - previous2.dea;
    const sameDirection =
      currentDelta !== 0 &&
      previousDelta !== 0 &&
      Math.sign(currentDelta) === Math.sign(previousDelta);
    const turning =
      (previousDelta <= 0 && currentDelta > 0) ||
      (previousDelta >= 0 && currentDelta < 0);
    const strength = turning
      ? "拐头"
      : sameDirection &&
          Math.abs(currentDelta) > Math.abs(previousDelta)
        ? "强"
        : sameDirection &&
            Math.abs(currentDelta) < Math.abs(previousDelta)
          ? "弱"
          : "中";
    const lastKdj = kdj[kdj.length - 1];
    const j = lastKdj?.j ?? null;

    const snapshot: SelfCheckIntervalSnapshot = {
      interval,
      trend: currentDelta >= 0 ? "up" : "down",
      strength,
      strength_pct:
        last.close > 0
          ? (Math.abs(currentDelta) / last.close) * 100
          : 0,
      j,
      k: lastKdj?.k ?? null,
      d: lastKdj?.d ?? null,
      demand:
        j !== null && j < 5
          ? "上涨需求"
          : j !== null && j > 80
            ? "下跌需求"
            : null,
      source: market.source,
      time: last.time,
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
