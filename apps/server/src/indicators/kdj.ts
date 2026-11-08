import type { KdjPoint, Kline } from "./types";

export interface KdjParams {
  period: number;
  kSmooth: number;
  dSmooth: number;
}

/**
 * 计算 KDJ。
 *
 * RSV = (收盘价 - N 周期最低价) / (N 周期最高价 - N 周期最低价) × 100
 * K   = ((kSmooth - 1) × 前一根 K + RSV) / kSmooth
 * D   = ((dSmooth - 1) × 前一根 D + K) / dSmooth
 * J   = 3K - 2D
 *
 * 前 period - 1 根 K 线的值为 null；K、D 初值为 50。
 * 区间最高价等于最低价时，RSV 记为 50。
 */
export function calculateKDJ(
  klines: Kline[],
  params: KdjParams
): KdjPoint[] {
  if (
    !Number.isInteger(params.period) ||
    params.period < 1 ||
    !Number.isInteger(params.kSmooth) ||
    params.kSmooth < 1 ||
    !Number.isInteger(params.dSmooth) ||
    params.dSmooth < 1
  ) {
    throw new Error("Invalid KDJ parameters");
  }

  const sortedKlines = [...klines].sort(
    (a, b) => a.openTime - b.openTime
  );

  const result: KdjPoint[] = sortedKlines.map((item) => ({
    time: item.closeTime,
    close: item.close,
    k: null,
    d: null,
    j: null
  }));

  if (sortedKlines.length < params.period) {
    return result;
  }

  let previousK = 50;
  let previousD = 50;

  for (let i = params.period - 1; i < sortedKlines.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;

    for (let j = i - params.period + 1; j <= i; j++) {
      highest = Math.max(highest, sortedKlines[j].high);
      lowest = Math.min(lowest, sortedKlines[j].low);
    }

    const range = highest - lowest;

    const rsv =
      range === 0
        ? 50
        : ((sortedKlines[i].close - lowest) / range) * 100;

    previousK =
      ((params.kSmooth - 1) * previousK + rsv) /
      params.kSmooth;

    previousD =
      ((params.dSmooth - 1) * previousD + previousK) /
      params.dSmooth;

    result[i] = {
      time: sortedKlines[i].closeTime,
      close: sortedKlines[i].close,
      k: previousK,
      d: previousD,
      j: 3 * previousK - 2 * previousD
    };
  }

  return result;
}
