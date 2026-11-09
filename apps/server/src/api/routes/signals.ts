import { Router } from "express";

import type { SignalEventType } from "../../db/types";
import { db } from "../../db";
import { getSignals } from "../../db/monitor-repo";
import { failure, success } from "../middleware";

export const signalsRouter: Router = Router();

signalsRouter.get("/stats", (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const today = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    WHERE trigger_met = 1
      AND event_time >= ?
  `).get(startOfToday) as { count: number };

  const total = db.prepare(`
    SELECT COUNT(1) AS count
    FROM signals
    WHERE trigger_met = 1
  `).get() as { count: number };

  res.json(
    success({
      today: today.count,
      total: total.count
    })
  );
});

const EVENT_TYPES: SignalEventType[] = [
  "TREND_GOLDEN",
  "TREND_DEATH",
  "TREND_INVALIDATED",
  "ENTRY_LONG",
  "ENTRY_SHORT"
];

function isEventType(
  value: unknown
): value is SignalEventType {
  return (
    typeof value === "string" &&
    EVENT_TYPES.includes(value as SignalEventType)
  );
}

function parseJson(
  value: string | null
): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

signalsRouter.get("/", (req, res) => {
  const limitValue = Number(req.query.limit ?? 50);
  const offsetValue = Number(req.query.offset ?? 0);

  const limit = Math.min(
    Math.max(Math.floor(limitValue) || 50, 1),
    200
  );
  const offset = Math.max(
    Math.floor(offsetValue) || 0,
    0
  );

  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "";
  const interval =
    typeof req.query.interval === "string"
      ? req.query.interval.trim()
      : "";
  const monitorRaw = req.query.monitor_id;
  const eventTypeRaw = req.query.event_type;
  const triggeredRaw = req.query.triggered;

  const monitorId =
    typeof monitorRaw === "string" && monitorRaw.trim()
      ? Number(monitorRaw)
      : undefined;

  if (
    monitorId !== undefined &&
    (!Number.isInteger(monitorId) || monitorId <= 0)
  ) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  if (
    eventTypeRaw !== undefined &&
    !isEventType(eventTypeRaw)
  ) {
    res.status(400).json(failure("未知的信号类型"));
    return;
  }

  const items = getSignals({
    limit,
    offset,
    symbol: symbol || undefined,
    interval: interval || undefined,
    monitorId,
    eventType: eventTypeRaw as string | undefined,
    triggeredOnly:
      triggeredRaw === "1" || triggeredRaw === "true"
  }).map((row) => ({
    ...row,
    conditions: parseJson(row.conditions),
    payload: parseJson(row.payload)
  }));

  res.json(success({ items, limit, offset }));
});
