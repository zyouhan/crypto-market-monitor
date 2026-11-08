import { Router } from "express";

import type {
  SignalEventType,
  StrategyKind
} from "../../db/types";
import { getSignals } from "../../db/repo";
import { isStrategyKind } from "../../strategies/registry";
import { failure, success } from "../middleware";

export const signalsRouter: Router = Router();

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

function parseJsonObject(
  value: string | null
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
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

  const kindRaw = req.query.kind;
  const eventTypeRaw = req.query.event_type;
  const triggeredRaw = req.query.triggered;

  const triggeredOnly =
    triggeredRaw === "1" || triggeredRaw === "true";

  if (kindRaw !== undefined && !isStrategyKind(kindRaw)) {
    res.status(400).json(failure("未知的策略类型"));
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
    kind: kindRaw as StrategyKind | undefined,
    eventType: eventTypeRaw as SignalEventType | undefined,
    triggeredOnly
  }).map((row) => ({
    ...row,
    payload: parseJsonObject(row.payload)
  }));

  res.json(success({ items, limit, offset }));
});
