import { Router } from "express";

import type {
  ConditionKind,
  ConditionRole,
  MonitorConditionRecord,
  MonitorRecord
} from "../../db/types";
import {
  db
} from "../../db";
import {
  deleteMonitor,
  deleteMonitorConditions,
  getLastSignalByMonitor,
  getMonitorById,
  getMonitorConditions,
  getMonitors,
  insertCondition,
  insertMonitor,
  resetMonitorState,
  updateMonitorFields
} from "../../db/monitor-repo";
import { getConditionDefinition, isConditionKind } from "../../conditions/registry";
import {
  getKlineLimit,
  isValidInterval
} from "../../market/binance";
import { getIntervalDuration } from "../../engine/time";
import {
  getPendingMonitorIds,
  requestMonitorRefresh
} from "../../engine/worker";
import {
  failure,
  isPositiveInteger,
  isValidSymbol,
  success
} from "../middleware";

export const monitorsRouter: Router = Router();

interface ConditionInput {
  kind: ConditionKind;
  role: ConditionRole;
  interval?: string;
  params?: unknown;
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseJson(
  value: string | null
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readFlag(
  value: unknown,
  fallback: boolean,
  label: string
): number {
  if (value === undefined) {
    return fallback ? 1 : 0;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${label}必须为布尔值`);
  }

  return value ? 1 : 0;
}

function normalizeConditionInput(
  value: unknown,
  baseInterval: string,
  klineLimit: number
): {
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  params: Record<string, unknown>;
} {
  if (!isPlainObject(value)) {
    throw new Error("条件必须为对象");
  }

  if (!isConditionKind(value.kind)) {
    throw new Error("未知的条件类型");
  }

  if (value.role !== "trigger" && value.role !== "filter") {
    throw new Error("条件角色必须为 trigger 或 filter");
  }

  const interval =
    typeof value.interval === "string" && value.interval.trim()
      ? value.interval.trim()
      : baseInterval;

  if (!isValidInterval(interval)) {
    throw new Error(`不支持的 K 线周期: ${interval}`);
  }

  if (
    value.role === "trigger" &&
    interval !== baseInterval
  ) {
    throw new Error("触发条件必须使用入场周期");
  }

  if (
    value.role === "filter" &&
    getIntervalDuration(interval) <
      getIntervalDuration(baseInterval)
  ) {
    throw new Error("过滤条件周期不能低于入场周期");
  }

  const definition = getConditionDefinition(value.kind);
  const params = definition.normalizeParams(
    value.params,
    klineLimit
  );

  return {
    kind: value.kind,
    role: value.role,
    interval,
    params
  };
}

function buildConditionView(
  condition: MonitorConditionRecord,
  monitor: MonitorRecord,
  snapshot: Record<string, unknown>
) {
  const interval = condition.interval || monitor.interval;
  const params = parseJson(condition.params);
  const definition = getConditionDefinition(condition.kind);
  const conditions = Array.isArray(snapshot.conditions)
    ? (snapshot.conditions as Array<Record<string, unknown>>)
    : [];
  const conditionSnapshot = conditions.find(
    (item) =>
      item.kind === condition.kind &&
      item.role === condition.role &&
      item.interval === interval
  );

  return {
    id: condition.id,
    kind: condition.kind,
    role: condition.role,
    interval,
    params,
    summary: definition.summarize(params),
    snapshot: conditionSnapshot ?? null
  };
}

function buildMonitorView(monitor: MonitorRecord) {
  const snapshot = parseJson(monitor.snapshot);
  const pending = getPendingMonitorIds().includes(monitor.id);
  const lastSignal = getLastSignalByMonitor(monitor.id);

  return {
    ...monitor,
    pending,
    snapshot,
    conditions: getMonitorConditions(monitor.id).map((condition) =>
      buildConditionView(condition, monitor, snapshot)
    ),
    last_signal: lastSignal
      ? {
          ...lastSignal,
          conditions: JSON.parse(lastSignal.conditions ?? "[]"),
          payload: parseJson(lastSignal.payload)
        }
      : null
  };
}

monitorsRouter.get("/", (_req, res) => {
  res.json(success(getMonitors().map(buildMonitorView)));
});

monitorsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  const monitor = getMonitorById(id);

  if (!monitor) {
    res.status(404).json(failure("监控项不存在"));
    return;
  }

  res.json(success(buildMonitorView(monitor)));
});

function prepareConditions(
  body: Record<string, unknown>,
  interval: string
): Array<{
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  params: Record<string, unknown>;
}> {
  if (!Array.isArray(body.conditions)) {
    throw new Error("conditions 必须为数组");
  }

  const klineLimit = getKlineLimit();
  const result = body.conditions.map((value) =>
    normalizeConditionInput(value, interval, klineLimit)
  );

  if (!result.some((condition) => condition.role === "trigger")) {
    throw new Error("至少需要一个触发条件");
  }

  const seen = new Set<string>();

  for (const condition of result) {
    const key = `${condition.kind}|${condition.interval}|${condition.role}`;

    if (seen.has(key)) {
      throw new Error("条件重复配置");
    }

    seen.add(key);
  }

  return result;
}

function insertConditionRows(
  monitorId: number,
  conditions: Array<{
    kind: ConditionKind;
    role: ConditionRole;
    interval: string;
    params: Record<string, unknown>;
  }>
): void {
  conditions.forEach((condition, index) => {
    insertCondition({
      monitorId,
      kind: condition.kind,
      role: condition.role,
      interval: condition.interval,
      params: JSON.stringify(condition.params),
      sortOrder: index
    });
  });
}

monitorsRouter.post("/", (req, res) => {
  const body = req.body ?? {};
  const symbol =
    typeof body.symbol === "string"
      ? body.symbol.trim().toUpperCase()
      : "";
  const interval =
    typeof body.interval === "string"
      ? body.interval.trim()
      : "";

  if (!isValidSymbol(symbol)) {
    res.status(400).json(failure("交易标的格式不正确"));
    return;
  }

  if (!isValidInterval(interval)) {
    res.status(400).json(failure("不支持的 K 线周期"));
    return;
  }

  try {
    const conditions = prepareConditions(body, interval);
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : `${symbol} ${interval} 监控`;
    const enabled = readFlag(body.enabled, true, "监控开关");
    const wechatEnabled = readFlag(
      body.wechat_enabled,
      true,
      "微信通知开关"
    );
    const soundEnabled = readFlag(
      body.sound_enabled,
      true,
      "声音提醒开关"
    );

    let id = 0;

    const transaction = db.transaction(() => {
      id = insertMonitor({
        name,
        symbol,
        interval,
        enabled,
        wechatEnabled,
        soundEnabled
      });
      insertConditionRows(id, conditions);
    });

    transaction();

    requestMonitorRefresh(id);

    const monitor = getMonitorById(id);

    res.status(201).json(
      success(
        monitor ? buildMonitorView(monitor) : null,
        "监控项创建成功"
      )
    );
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "创建失败")
    );
  }
});

monitorsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  const existing = getMonitorById(id);

  if (!existing) {
    res.status(404).json(failure("监控项不存在"));
    return;
  }

  const body = req.body ?? {};
  const interval =
    typeof body.interval === "string"
      ? body.interval.trim()
      : existing.interval;

  if (!isValidInterval(interval)) {
    res.status(400).json(failure("不支持的 K 线周期"));
    return;
  }

  try {
    const conditions = prepareConditions(body, interval);
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : existing.name;
    const enabled = readFlag(
      body.enabled,
      existing.enabled === 1,
      "监控开关"
    );
    const wechatEnabled = readFlag(
      body.wechat_enabled,
      existing.wechat_enabled === 1,
      "微信通知开关"
    );
    const soundEnabled = readFlag(
      body.sound_enabled,
      existing.sound_enabled === 1,
      "声音提醒开关"
    );

    const oldSignature = JSON.stringify(
      getMonitorConditions(id).map((condition) => ({
        kind: condition.kind,
        role: condition.role,
        interval: condition.interval || existing.interval,
        params: parseJson(condition.params)
      }))
    );
    const newSignature = JSON.stringify(conditions);
    const changed =
      interval !== existing.interval ||
      oldSignature !== newSignature;

    const transaction = db.transaction(() => {
      updateMonitorFields({
        id,
        name,
        interval,
        enabled,
        wechatEnabled,
        soundEnabled
      });
      deleteMonitorConditions(id);
      insertConditionRows(id, conditions);

      if (changed) {
        resetMonitorState(id);
      }
    });

    transaction();

    if (changed) {
      requestMonitorRefresh(id);
    }

    const monitor = getMonitorById(id);

    res.json(
      success(
        monitor ? buildMonitorView(monitor) : null,
        "监控项已更新"
      )
    );
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "更新失败")
    );
  }
});

monitorsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  const changes = deleteMonitor(id);

  if (changes === 0) {
    res.status(404).json(failure("监控项不存在"));
    return;
  }

  res.json(success(null, "监控项已删除"));
});

/**
 * 只更新开关，不重建条件，不重置预热状态。
 */
monitorsRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  const existing = getMonitorById(id);

  if (!existing) {
    res.status(404).json(failure("监控项不存在"));
    return;
  }

  const body = req.body ?? {};

  try {
    const enabled = readFlag(
      body.enabled,
      existing.enabled === 1,
      "监控开关"
    );
    const wechatEnabled = readFlag(
      body.wechat_enabled,
      existing.wechat_enabled === 1,
      "微信通知开关"
    );
    const soundEnabled = readFlag(
      body.sound_enabled,
      existing.sound_enabled === 1,
      "声音提醒开关"
    );

    updateMonitorFields({
      id,
      name: existing.name,
      interval: existing.interval,
      enabled,
      wechatEnabled,
      soundEnabled
    });

    const monitor = getMonitorById(id);

    res.json(
      success(
        monitor ? buildMonitorView(monitor) : null,
        "监控项已更新"
      )
    );
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "更新失败")
    );
  }
});

monitorsRouter.post("/:id/refresh", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("监控项 ID 不正确"));
    return;
  }

  if (!requestMonitorRefresh(id)) {
    res.status(404).json(failure("监控项不存在或服务已停止"));
    return;
  }

  res
    .status(202)
    .json(success({ pending: true }, "已开始请求最新数据"));
});
