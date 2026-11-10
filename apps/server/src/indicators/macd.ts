import type { Kline, MacdPoint } from "./types";
import { calculateEMA } from "./ema";

export interface MacdParams {
  fast: number;
  slow: number;
  signal: number;
}

export const DEFAULT_MACD_PARAMS: MacdParams = {
  fast: 12,
  slow: 26,
  signal: 9
};

export function validateMacdParams(params: MacdParams): void {
  const { fast, slow, signal } = params;

  if (
    !Number.isInteger(fast) ||
    !Number.isInteger(slow) ||
    !Number.isInteger(signal) ||
    fast < 2 ||
    slow < 3 ||
    signal < 2
  ) {
    throw new Error("MACD 周期必须为大于 1 的整数");
  }

  if (fast >= slow) {
    throw new Error("MACD 快线周期必须小于慢线周期");
  }
}

/**
 * 计算 MACD。
 *
 * DIF = EMA(fast) - EMA(slow)
 * DEA = EMA(DIF, signal)
 * 柱 = DIF - DEA
 *
 * 返回数组与 K 线一一对应，预热区间为 null。
 */
export function calculateMACD(
  klines: Kline[],
  params: MacdParams
): MacdPoint[] {
  validateMacdParams(params);

  const closes = klines.map((kline) => kline.close);
  const fastEma = calculateEMA(closes, params.fast);
  const slowEma = calculateEMA(closes, params.slow);

  const difValues: Array<number | null> = closes.map(
    (_, index) => {
      const fast = fastEma[index];
      const slow = slowEma[index];

      return fast === null || slow === null
        ? null
        : fast - slow;
    }
  );

  const firstDifIndex = difValues.findIndex(
    (value) => value !== null
  );
  const deaValues: Array<number | null> = Array(
    closes.length
  ).fill(null);

  if (firstDifIndex >= 0) {
    const difSlice = difValues
      .slice(firstDifIndex)
      .filter((value): value is number => value !== null);
    const deaSlice = calculateEMA(
      difSlice,
      params.signal
    );

    deaSlice.forEach((value, index) => {
      deaValues[firstDifIndex + index] = value;
    });
  }

  return klines.map((kline, index) => {
    const dif = difValues[index];
    const dea = deaValues[index];

    return {
      time: kline.closeTime,
      close: kline.close,
      dif,
      dea,
      histogram:
        dif === null || dea === null ? null : dif - dea
    };
  });
}
