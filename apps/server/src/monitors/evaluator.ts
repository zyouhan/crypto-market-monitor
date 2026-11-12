import type {
  ConditionDisplayItem,
  ConditionLogic,
  ConditionRole,
  MonitorRecord,
  SignalDirection
} from "../db/types";
import type { Kline } from "../indicators/types";

import type {
  ConditionDefinition,
  ConditionPoint,
  ConditionRunResult
} from "../conditions/types";

export interface ConditionRuntime {
  id: number;
  kind: string;
  role: ConditionRole;
  logic: ConditionLogic;
  interval: string;
  params: Record<string, unknown>;
  definition: ConditionDefinition;
  result: ConditionRunResult;
}

export interface MonitorSignalDraft {
  eventType: NonNullable<ConditionPoint["eventType"]>;
  direction: SignalDirection;
  price: number;
  interval: string;
  eventTime: number;
  primaryCondition: string;
  conditions: Array<{
    kind: string;
    role: ConditionRole;
    logic: ConditionLogic;
    interval: string;
    summary: string;
    statusText: string;
    display: ConditionDisplayItem[];
    time: number;
    params: Record<string, unknown>;
  }>;
  threshold: number | null;
  stopPrice: number | null;
  payload: Record<string, unknown>;
}

function directionForRole(
  point: ConditionPoint | null
): SignalDirection | null {
  return point?.direction ?? null;
}

function findPoint(
  runtime: ConditionRuntime,
  baseTime: number,
  baseInterval: string
): ConditionPoint | null {
  if (runtime.interval === baseInterval) {
    return runtime.result.points.get(baseTime) ?? null;
  }

  const latest = runtime.result.latest;

  if (latest && latest.time <= baseTime) {
    return latest;
  }

  return null;
}

function conditionSnapshot(
  runtime: ConditionRuntime,
  point: ConditionPoint | null
): MonitorSignalDraft["conditions"][number] {
  const summary = runtime.definition.summarize(runtime.params);

  return {
    kind: runtime.kind,
    role: runtime.role,
    logic: runtime.logic,
    interval: runtime.interval,
    summary,
    statusText: point
      ? runtime.result.statusText
      : "暂无数据",
    display: point?.display ?? [],
    time: point?.time ?? 0,
    params: runtime.params
  };
}

function evaluateZoneSignals(
  input: {
    monitor: MonitorRecord;
    runtimes: ConditionRuntime[];
  },
  triggers: ConditionRuntime[]
): MonitorSignalDraft[] {
  const signals: MonitorSignalDraft[] = [];

  for (const runtime of triggers) {
    for (const point of runtime.result.points.values()) {
      if (!point.eventType || !point.direction) {
        continue;
      }

      const close = point.payload.close;

      if (typeof close !== "number" || !Number.isFinite(close)) {
        continue;
      }

      const conditions = input.runtimes.map((conditionRuntime) => {
        const conditionPoint =
          conditionRuntime === runtime
            ? point
            : conditionRuntime.result.latest &&
                conditionRuntime.result.latest.time <= point.time
              ? conditionRuntime.result.latest
              : null;

        return conditionSnapshot(
          conditionRuntime,
          conditionPoint
        );
      });

      signals.push({
        eventType: point.eventType,
        direction: point.direction,
        price: close,
        interval: runtime.interval,
        eventTime: point.time,
        primaryCondition: runtime.kind,
        conditions,
        threshold: point.threshold,
        stopPrice: null,
        payload: {
          conditions,
          zone: point.payload.zone,
          exhausted: point.payload.exhausted,
          dif: point.payload.dif,
          dea: point.payload.dea,
          source: null,
          stopPrice: null
        }
      });
    }
  }

  return signals.sort(
    (left, right) => left.eventTime - right.eventTime
  );
}

function evaluateLogicalSignals(input: {
  monitor: MonitorRecord;
  runtimes: ConditionRuntime[];
  newBaseKlines: Kline[];
  source: string | null;
}): MonitorSignalDraft[] {
  const signals: MonitorSignalDraft[] = [];

  for (const kline of input.newBaseKlines) {
    const points = new Map<
      ConditionRuntime,
      ConditionPoint | null
    >();

    for (const runtime of input.runtimes) {
      points.set(
        runtime,
        findPoint(
          runtime,
          kline.closeTime,
          input.monitor.interval
        )
      );
    }

    const positiveTriggers = input.runtimes.filter((runtime) => {
      const point = points.get(runtime);

      return (
        runtime.role === "trigger" &&
        runtime.logic !== "NOT" &&
        point?.eventType &&
        point.direction
      );
    });

    if (positiveTriggers.length === 0) {
      continue;
    }

    const direction = points.get(positiveTriggers[0])
      ?.direction as SignalDirection;
    const directionMatches = positiveTriggers.every(
      (runtime) => points.get(runtime)?.direction === direction
    );

    if (!directionMatches) {
      continue;
    }

    let expression = false;
    let first = true;

    for (const runtime of input.runtimes) {
      const point = points.get(runtime) ?? null;
      const truth =
        runtime.role === "trigger"
          ? Boolean(
              point?.eventType &&
                point.direction === direction
            )
          : Boolean(
              point?.active &&
                directionForRole(point) === direction
            );
      const value =
        !point
          ? false
          : runtime.logic === "NOT"
            ? !truth
            : truth;

      if (first) {
        expression = value;
        first = false;
        continue;
      }

      if (runtime.logic === "OR") {
        expression = expression || truth;
      } else {
        expression = expression && value;
      }
    }

    if (!expression) {
      continue;
    }

    const primary = positiveTriggers[0];
    const primaryPoint = points.get(primary) as ConditionPoint;
    const rawStop = primaryPoint.payload.stopPrice;
    const stopPrice =
      typeof rawStop === "number" &&
      Number.isFinite(rawStop)
        ? rawStop
        : null;
    const conditions = input.runtimes.map((runtime) =>
      conditionSnapshot(runtime, points.get(runtime) ?? null)
    );

    signals.push({
      eventType: primaryPoint.eventType as NonNullable<
        ConditionPoint["eventType"]
      >,
      direction,
      price: kline.close,
      interval: input.monitor.interval,
      eventTime: kline.closeTime,
      primaryCondition: primary.kind,
      conditions,
      threshold: primaryPoint.threshold,
      stopPrice,
      payload: {
        conditions,
        source: input.source,
        stopPrice
      }
    });
  }

  return signals;
}

/**
 * 把同一根入场 K 线上的条件组合成一条信号。
 * 多个 trigger 必须同时发生且方向一致；filter 必须同方向有效。
 */
export function evaluateMonitorSignals(input: {
  monitor: MonitorRecord;
  runtimes: ConditionRuntime[];
  newBaseKlines: Kline[];
  source: string | null;
}): MonitorSignalDraft[] {
  const triggers = input.runtimes.filter(
    (runtime) => runtime.role === "trigger"
  );
  const filters = input.runtimes.filter(
    (runtime) => runtime.role === "filter"
  );

  if (triggers.length === 0) {
    return [];
  }

  if (
    filters.length === 0 &&
    triggers.every(
      (runtime) =>
        runtime.kind === "MACD_DEA_ZONE" &&
        runtime.logic === "AND"
    )
  ) {
    return evaluateZoneSignals(
      {
        monitor: input.monitor,
        runtimes: input.runtimes
      },
      triggers
    );
  }

  if (
    input.runtimes.some(
      (runtime) => runtime.logic !== "AND"
    )
  ) {
    return evaluateLogicalSignals(input);
  }

  const signals: MonitorSignalDraft[] = [];

  for (const kline of input.newBaseKlines) {
    const triggerPoints: Array<{
      runtime: ConditionRuntime;
      point: ConditionPoint;
    }> = [];

    let invalid = false;

    for (const runtime of triggers) {
      const point = findPoint(
        runtime,
        kline.closeTime,
        input.monitor.interval
      );

      if (!point || !point.eventType || !point.direction) {
        invalid = true;
        break;
      }

      triggerPoints.push({ runtime, point });
    }

    if (invalid || triggerPoints.length === 0) {
      continue;
    }

    const triggerDirection = triggerPoints[0]
      .point.direction as SignalDirection;

    if (
      triggerPoints.some(
        (item) => item.point.direction !== triggerDirection
      )
    ) {
      continue;
    }

    let filtersValid = true;

    for (const runtime of filters) {
      const point = findPoint(
        runtime,
        kline.closeTime,
        input.monitor.interval
      );

      if (
        !point ||
        !point.active ||
        directionForRole(point) !== triggerDirection
      ) {
        filtersValid = false;
        break;
      }
    }

    if (!filtersValid) {
      continue;
    }

    const primary = triggerPoints[0];
    const rawStop = primary.point.payload.stopPrice;
    const stopPrice =
      typeof rawStop === "number" &&
      Number.isFinite(rawStop)
        ? rawStop
        : null;
    const conditions = input.runtimes.map((runtime) => {
      const point = findPoint(
        runtime,
        kline.closeTime,
        input.monitor.interval
      );

      return conditionSnapshot(runtime, point);
    });

    signals.push({
      eventType: primary.point.eventType as NonNullable<
        ConditionPoint["eventType"]
      >,
      direction: triggerDirection,
      price: kline.close,
      interval: input.monitor.interval,
      eventTime: kline.closeTime,
      primaryCondition: primary.runtime.kind,
      conditions,
      threshold: primary.point.threshold,
      stopPrice,
      payload: {
        conditions,
        source: input.source,
        stopPrice
      }
    });
  }

  return signals;
}
