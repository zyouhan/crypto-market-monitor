import https from "node:https";

import type {
  MonitorRecord,
  MonitorSignalRecord,
  SignalDirection
} from "../db/types";
import { updateSignalPush } from "../db/monitor-repo";
import { isSignalFresh, formatTime } from "./time";

const SENDKEY = process.env.SERVERCHAN_SENDKEY || "";

interface ServerChanResponse {
  code?: number;
  message?: string;
  data?: unknown;
  errno?: number;
  error?: string;
}

interface SignalConditionSnapshot {
  kind?: string;
  role?: string;
  interval?: string;
  summary?: string;
  statusText?: string;
  display?: Array<{
    label?: string;
    value?: string;
  }>;
}

export function isServerchanConfigured(): boolean {
  return Boolean(SENDKEY);
}

function directionLabel(
  direction: SignalDirection | null
): string {
  if (direction === "BULL") {
    return "看涨/做多";
  }

  if (direction === "BEAR") {
    return "看跌/做空";
  }

  return "方向未知";
}

function displayDirection(
  signal: MonitorSignalRecord
): string {
  if (signal.event_type === "STOP_LOSS_HIT") {
    return "止损触发";
  }

  if (signal.event_type === "TRADE_1R") {
    return "达到1R";
  }

  if (signal.event_type === "TRADE_BREAKEVEN") {
    return "回到入场价";
  }

  if (
    signal.event_type === "VOLUME_SPIKE" ||
    signal.event_type === "PRICE_LEVEL"
  ) {
    if (signal.direction === "BULL") {
      return "向上";
    }

    if (signal.direction === "BEAR") {
      return "向下";
    }

    return "方向未知";
  }

  return directionLabel(signal.direction);
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

function parseConditions(
  raw: string | null
): SignalConditionSnapshot[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed)
      ? (parsed as SignalConditionSnapshot[])
      : [];
  } catch {
    return [];
  }
}

export function buildMonitorMessage(
  signal: MonitorSignalRecord,
  monitor: MonitorRecord
): { title: string; description: string } {
  const title = `[监控] ${signal.symbol} ${
    signal.monitor_name ?? monitor.name
  } ${displayDirection(signal)}`;

  const conditions = parseConditions(signal.conditions);

  const conditionLines =
    conditions.length > 0
      ? conditions.map((condition) => {
          const interval = condition.interval
            ? `[${condition.interval}] `
            : "";

          return `${interval}${condition.role === "filter" ? "过滤" : "触发"} · ${
            condition.summary ?? condition.kind ?? "--"
          }${condition.statusText ? `：${condition.statusText}` : ""}`;
        })
      : ["--"];

  const stopReference = conditions
    .flatMap((condition) => condition.display ?? [])
    .find(
      (item) =>
        item.label === "J钝化止损" &&
        item.value &&
        item.value !== "--"
    );

  const isStopHit =
    signal.event_type === "STOP_LOSS_HIT";
  const isManagement =
    signal.event_type === "TRADE_1R" ||
    signal.event_type === "TRADE_BREAKEVEN";

  const description = [
    `交易标的：${signal.symbol}`,
    `入场周期：${signal.interval ?? monitor.interval}`,
    `监控项：${signal.monitor_name ?? monitor.name}`,
    `方向：${displayDirection(signal)}`,
    `触发价格：${formatNumber(signal.price)}`,
    `触发时间：${formatTime(signal.event_time)}`,
    `数据源：${signal.source ?? monitor.source ?? "--"}`,
    ...(isStopHit
      ? [
          "事件：止损触发",
          `止损价：${formatNumber(signal.price)}`
        ]
      : []),
    ...(isManagement
      ? [
          `事件：${
            signal.event_type === "TRADE_1R"
              ? "达到 1R"
              : "回到入场价"
          }`
        ]
      : []),
    ...(stopReference
      ? [`止损参考：${stopReference.value}`]
      : []),
    ...conditionLines
  ].join("\n\n");

  return { title, description };
}

/**
 * 微信通知闸门：新鲜度 → 全局开关 → 监控项开关 → SendKey。
 */
export async function dispatchMonitorNotification(
  signal: MonitorSignalRecord,
  monitor: MonitorRecord,
  globalNotifyEnabled: boolean
): Promise<boolean> {
  if (signal.trigger_met !== 1) {
    return false;
  }

  if (
    signal.event_type === "STOP_LOSS_HIT" ||
    signal.event_type === "TRADE_1R" ||
    signal.event_type === "TRADE_BREAKEVEN"
  ) {
    updateSignalPush({
      id: signal.id,
      pushState: "SKIPPED",
      pushError: null,
      reason: "risk_notification_disabled"
    });
    return false;
  }

  if (!isSignalFresh(signal.event_time, monitor.interval)) {
    updateSignalPush({
      id: signal.id,
      pushState: "SKIPPED",
      pushError: null,
      reason: "stale_signal_suppressed"
    });
    return false;
  }

  if (!globalNotifyEnabled) {
    updateSignalPush({
      id: signal.id,
      pushState: "SKIPPED",
      pushError: null,
      reason: "global_notification_disabled"
    });
    return false;
  }

  if (monitor.wechat_enabled !== 1) {
    updateSignalPush({
      id: signal.id,
      pushState: "SKIPPED",
      pushError: null,
      reason: "monitor_notification_disabled"
    });
    return false;
  }

  if (!isServerchanConfigured()) {
    updateSignalPush({
      id: signal.id,
      pushState: "SKIPPED",
      pushError: null,
      reason: "serverchan_sendkey_missing"
    });
    return false;
  }

  const message = buildMonitorMessage(signal, monitor);

  try {
    await sendWechatNotification(
      message.title,
      message.description
    );

    updateSignalPush({
      id: signal.id,
      pushState: "SENT",
      pushError: null,
      reason: null
    });

    console.log(
      `[Worker] 通知已发送: ${message.title}（${formatTime(
        signal.event_time
      )}）`
    );

    return true;
  } catch (error) {
    const text =
      error instanceof Error ? error.message : String(error);

    updateSignalPush({
      id: signal.id,
      pushState: "FAILED",
      pushError: text.slice(0, 300),
      reason: "notification_failed"
    });

    console.error(
      `[Worker] 通知失败: ${signal.symbol} ${monitor.name}`,
      text
    );

    return false;
  }
}

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
