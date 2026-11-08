import { STALE_CANDLES } from "../config/defaults";

export const INTERVAL_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "3m": 3 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000
};

export function getIntervalDuration(interval: string): number {
  return INTERVAL_MS[interval] || 60 * 1000;
}

/**
 * 下一根 K 线预计收盘时间。
 *
 * 1M 是自然月，不能用固定的 30 天近似；
 * 按 UTC 月末计算，避免月初反复请求。
 */
export function getNextCloseTime(
  lastCloseTime: number,
  interval: string
): number {
  if (interval === "1M") {
    const date = new Date(lastCloseTime);

    return (
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + 2,
        1
      ) - 1
    );
  }

  return lastCloseTime + getIntervalDuration(interval);
}

/**
 * 信号是否足够新。
 *
 * 早于 now - 2 个周期的信号只落库，不推送，
 * 避免服务停机后补发历史信号。
 */
export function isSignalFresh(
  eventTime: number,
  interval: string,
  now = Date.now()
): boolean {
  return (
    eventTime >=
    now - getIntervalDuration(interval) * STALE_CANDLES
  );
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false
  });
}
