import https from "node:https";

import type {
  SignalDirection,
  SignalEventType,
  StrategyKind
} from "../db/types";

import { formatTime } from "./time";

const SENDKEY = process.env.SERVERCHAN_SENDKEY || "";

interface ServerChanResponse {
  code?: number;
  message?: string;
  data?: unknown;
  errno?: number;
  error?: string;
}

export interface NotifiableSignal {
  symbol: string;
  kind: StrategyKind;
  event_type: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  event_time: number;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  payload: Record<string, unknown> | null;
}

export function isServerchanConfigured(): boolean {
  return Boolean(SENDKEY);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function formatNumber(
  value: number | null | undefined,
  digits = 8
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits
  });
}

function crossName(eventType: SignalEventType): string {
  if (eventType === "TREND_GOLDEN") {
    return "金叉";
  }

  if (eventType === "TREND_DEATH") {
    return "死叉";
  }

  return "交叉";
}

function trendName(direction: SignalDirection | null): string {
  if (direction === "BULL") {
    return "看涨等待";
  }

  if (direction === "BEAR") {
    return "看跌等待";
  }

  return "中性";
}

/**
 * 组装通知标题与正文。
 */
export function buildSignalMessage(
  signal: NotifiableSignal,
  interval: string
): { title: string; description: string } {
  const payload = signal.payload ?? {};

  if (signal.kind === "EMA_TREND") {
    const fast = asNumber(payload.fast);
    const slow = asNumber(payload.slow);
    const threshold = signal.threshold;

    if (signal.event_type === "TREND_INVALIDATED") {
      const baselineEma = asNumber(payload.baselineEma);
      const currentEma = asNumber(payload.currentEma);
      const deviation = asNumber(payload.deviation);

      const title = `[趋势] ${signal.symbol} 等待失效`;

      const description = [
        `交易标的：${signal.symbol}`,
        `K 线周期：${interval}`,
        `信号类型：${trendName(
          signal.direction
        )}已失效，暂停入场`,
        `EMA 参数：${formatNumber(fast, 0)} / ${formatNumber(slow, 0)}`,
        `基准交叉 EMA：${formatNumber(baselineEma)}`,
        `当前 EMA：${formatNumber(currentEma)}`,
        `反向偏离：${formatNumber(deviation)}（阈值 ${formatNumber(
          threshold
        )}）`,
        `失效时间：${formatTime(signal.event_time)}`
      ].join("\n\n");

      return { title, description };
    }

    const previousEma = asNumber(payload.previousEma);
    const crossEma = asNumber(payload.crossEma);

    const title = `[趋势] ${signal.symbol} EMA ${crossName(
      signal.event_type
    )}确认`;

    const description = [
      `交易标的：${signal.symbol}`,
      `K 线周期：${interval}`,
      `信号类型：${crossName(signal.event_type)}确认（趋势转为${trendName(
        signal.direction
      )}）`,
      `EMA 参数：${formatNumber(fast, 0)} / ${formatNumber(slow, 0)}`,
      `EMA 距离：${formatNumber(signal.ema_diff)}（阈值 ${formatNumber(
        threshold
      )}）`,
      `基准交叉 EMA：${formatNumber(previousEma)}`,
      `本次交叉 EMA：${formatNumber(crossEma)}`,
      `交叉价格：${formatNumber(signal.price)}`,
      `价格差（参考）：${formatNumber(signal.price_diff)}`,
      `交叉时间：${formatTime(signal.event_time)}`
    ].join("\n\n");

    return { title, description };
  }

  const isLong = signal.event_type === "ENTRY_LONG";

  const title = `[入场] ${signal.symbol} KDJ ${
    isLong ? "做多" : "做空"
  }信号`;

  const j = asNumber(payload.j);
  const previousJ = asNumber(payload.previousJ);
  const k = asNumber(payload.k);
  const d = asNumber(payload.d);
  const threshold = isLong
    ? asNumber(payload.oversold)
    : asNumber(payload.overbought);

  const condition = isLong
    ? `J ${formatNumber(j, 2)} < ${formatNumber(threshold, 2)}`
    : `J ${formatNumber(j, 2)} > ${formatNumber(threshold, 2)}`;

  const description = [
    `交易标的：${signal.symbol}`,
    `K 线周期：${interval}`,
    `信号类型：KDJ ${isLong ? "超卖做多" : "超买做空"}入场`,
    `当前趋势：${trendName(signal.direction)}`,
    `KDJ 参数：${formatNumber(asNumber(payload.period), 0)},${formatNumber(
      asNumber(payload.kSmooth),
      0
    )},${formatNumber(asNumber(payload.dSmooth), 0)}`,
    `触发条件：${condition}（前值 ${formatNumber(previousJ, 2)}）`,
    `K / D：${formatNumber(k, 2)} / ${formatNumber(d, 2)}`,
    `触发价格：${formatNumber(signal.price)}`,
    `触发时间：${formatTime(signal.event_time)}`
  ].join("\n\n");

  return { title, description };
}

/**
 * 发送 Server酱微信通知。
 *
 * 未配置 SendKey 时直接报错，由调用方决定如何记录错误。
 */
export async function sendWechatNotification(
  title: string,
  description: string
): Promise<void> {
  if (!SENDKEY) {
    throw new Error("SERVERCHAN_SENDKEY is not configured");
  }

  const url = new URL(
    `https://sctapi.ftqq.com/${encodeURIComponent(SENDKEY)}.send`
  );

  const body = new URLSearchParams({
    title,
    desp: description
  }).toString();

  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 15000
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Server酱 HTTP ${statusCode}: ${responseBody.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            const result = JSON.parse(
              responseBody
            ) as ServerChanResponse;

            if (result.code !== 0) {
              reject(
                new Error(
                  `Server酱发送失败: ${
                    result.message ||
                    result.error ||
                    responseBody.slice(0, 300)
                  }`
                )
              );
              return;
            }

            resolve();
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("无法解析 Server酱响应")
            );
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Server酱请求超时"));
    });

    request.on("error", reject);

    request.write(body);
    request.end();
  });
}
