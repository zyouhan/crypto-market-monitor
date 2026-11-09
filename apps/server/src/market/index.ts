import { getKlines as getBinanceKlines } from "./binance";
import {
  getOkxKlines,
  supportsOkxInterval
} from "./okx";

import type { Kline } from "../indicators/types";

export type MarketSource = "OKX" | "BINANCE";

export interface MarketKlines {
  klines: Kline[];
  source: MarketSource;
  warnings: string[];
}

let okxDisabledUntil = 0;

const OKX_COOLDOWN_MS = 60_000;

function isOkxAvailable(): boolean {
  return Date.now() >= okxDisabledUntil;
}

export async function getMarketKlines(
  symbol: string,
  interval: string,
  limit = 300
): Promise<MarketKlines> {
  const warnings: string[] = [];
  let okxError: string | null = null;

  if (!supportsOkxInterval(interval)) {
    warnings.push(`OKX 不支持 ${interval}，使用 Binance`);
  } else if (!isOkxAvailable()) {
    warnings.push("OKX 处于短时熔断，使用 Binance");
  } else {
    try {
      const klines = await getOkxKlines(symbol, interval, limit);

      if (klines.length > 0) {
        okxDisabledUntil = 0;
        return { klines, source: "OKX", warnings };
      }

      okxError = "OKX 返回空 K 线";
    } catch (error) {
      okxError =
        error instanceof Error ? error.message : String(error);
      okxDisabledUntil = Date.now() + OKX_COOLDOWN_MS;
      warnings.push(`OKX 失败: ${okxError}`);
      console.warn(
        `[Market] ${symbol} ${interval} OKX 失败，回退 Binance: ${okxError}`
      );
    }
  }

  try {
    const klines = await getBinanceKlines(
      symbol,
      interval,
      limit
    );

    if (klines.length === 0) {
      throw new Error("Binance 返回空 K 线");
    }

    if (okxError) {
      warnings.push("已回退 Binance");
    }

    return { klines, source: "BINANCE", warnings };
  } catch (error) {
    const binanceError =
      error instanceof Error ? error.message : String(error);

    const messages = [];

    if (okxError) {
      messages.push(`OKX: ${okxError}`);
    }

    messages.push(`Binance: ${binanceError}`);

    throw new Error(messages.join(" | "));
  }
}

export { supportsOkxInterval };
