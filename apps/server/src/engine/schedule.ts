import type { SymbolRecord } from "../db/types";

import { getNextCloseTime } from "./time";

/**
 * 判断标的本轮是否需要拉取 K 线。
 *
 * 上一根已处理 K 线的收盘时间 + 周期，就是下一根 K 线收盘的时间；
 * 在此之前拉取不会得到新的已收盘 K 线。
 */
export function isSymbolDue(
  symbol: SymbolRecord,
  now: number,
  nextRetryAt = 0
): boolean {
  if (now < nextRetryAt) {
    return false;
  }

  if (symbol.last_processed_close_time === 0) {
    return true;
  }

  return (
    now >=
    getNextCloseTime(
      symbol.last_processed_close_time,
      symbol.interval
    )
  );
}

/**
 * 失败退避：30s、60s、120s、240s，最多 5 分钟。
 */
export function computeBackoffMs(failures: number): number {
  return Math.min(
    300000,
    30000 * 2 ** Math.max(0, failures - 1)
  );
}
