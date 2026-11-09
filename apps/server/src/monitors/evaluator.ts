import type {
  ConditionDisplayItem,
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
  interval: string;
  params: Record<string, unknown>;
  definition: ConditionDefinition;
  result: ConditionRunResult;
}

export interface MonitorSignalDraft {
  eventType: NonNullable<ConditionPoint["eventType"]>;
  direction: SignalDirection;
  price: number;
  eventTime: number;
  primaryCondition: string;
  conditions: Array<{
    kind: string;
    role: ConditionRole;
    interval: string;
    summary: string;
    statusText: string;
    display: ConditionDisplayItem[];
    time: number;
    params: Record<string, unknown>;
  }>;
  threshold: number | null;
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
      eventTime: kline.closeTime,
      primaryCondition: primary.runtime.kind,
      conditions,
      threshold: primary.point.threshold,
      payload: {
        conditions,
        source: input.source
      }
    });
  }

  return signals;
}
