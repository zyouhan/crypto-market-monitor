import type {
  Response,
  Router as ExpressRouter
} from "express";
import { Router } from "express";

import { DEFAULT_INTERVAL } from "../../config/defaults";
import type {
  StrategyKind,
  StrategyRecord,
  StrategyStateRecord,
  SymbolRecord
} from "../../db/types";
import {
  db,
  deleteSymbol,
  getAllStates,
  getAllStrategies,
  getStatesBySymbol,
  getStrategiesBySymbol,
  getSymbolById,
  getSymbols,
  insertStrategy,
  insertSymbol,
  resetSymbolState,
  updateStrategy,
  updateSymbolFields
} from "../../db/repo";
import { getKlineLimit, isValidInterval } from "../../market/binance";
import { requestManualRefresh } from "../../engine/worker";
import {
  ParamValidationError,
  normalizeEmaParams,
  normalizeKdjParams,
  normalizeKdjTimingParams,
  type StrategyParams
} from "../../strategies/params";
import { getRunner, isStrategyKind } from "../../strategies/registry";
import {
  failure,
  isPositiveInteger,
  isValidSymbol,
  success
} from "../middleware";

export const symbolsRouter: ExpressRouter = Router();

interface StrategyInput {
  kind: StrategyKind;
  enabled?: number;
  notify_enabled?: number;
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

function parseJsonObject(
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
  fallback: number,
  label: string
): number {
  if (value === undefined) {
    return fallback;
  }

  if (value === true || value === 1) {
    return 1;
  }

  if (value === false || value === 0) {
    return 0;
  }

  throw new ParamValidationError(`${label}必须为布尔值`);
}

function normalizeByKind(
  kind: StrategyKind,
  params: unknown,
  klineLimit: number
): StrategyParams {
  if (kind === "EMA_TREND") {
    return normalizeEmaParams(params, klineLimit);
  }

  if (kind === "KDJ_TIMING") {
    return normalizeKdjTimingParams(params, klineLimit);
  }

  return normalizeKdjParams(params, klineLimit);
}

function parseStrategyList(
  value: unknown,
  klineLimit: number
): StrategyInput[] {
  if (!Array.isArray(value)) {
    throw new ParamValidationError("strategies 必须为数组");
  }

  const seen = new Set<StrategyKind>();
  const result: StrategyInput[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) {
      throw new ParamValidationError("策略配置必须为对象");
    }

    if (!isStrategyKind(item.kind)) {
      throw new ParamValidationError("未知的策略类型");
    }

    const kind = item.kind;

    if (seen.has(kind)) {
      throw new ParamValidationError(`策略 ${kind} 重复配置`);
    }

    seen.add(kind);

    const input: StrategyInput = { kind };

    if (item.enabled !== undefined) {
      input.enabled = readFlag(
        item.enabled,
        1,
        "策略开关"
      );
    }

    if (item.notify_enabled !== undefined) {
      input.notify_enabled = readFlag(
        item.notify_enabled,
        1,
        "策略通知开关"
      );
    }

    if (item.params !== undefined) {
      if (!isPlainObject(item.params)) {
        throw new ParamValidationError("策略参数必须为对象");
      }

      input.params = item.params;
    }

    result.push(input);
  }

  return result;
}

function buildStrategyView(record: StrategyRecord) {
  return {
    kind: record.kind,
    enabled: record.enabled,
    notify_enabled: record.notify_enabled,
    params: parseJsonObject(record.params)
  };
}

function buildStateView(record: StrategyStateRecord) {
  return {
    status: record.status,
    baseline: record.baseline_type
      ? {
          type: record.baseline_type,
          price: record.baseline_price,
          ema: record.baseline_ema,
          time: record.baseline_time
        }
      : null,
    extra: parseJsonObject(record.extra)
  };
}

function buildSymbolView(
  symbol: SymbolRecord,
  strategies: StrategyRecord[],
  states: StrategyStateRecord[]
) {
  const strategyViews = strategies.map(buildStrategyView);

  const stateViews: Record<string, unknown> = {};

  for (const record of states) {
    stateViews[record.kind] = buildStateView(record);
  }

  return {
    ...symbol,
    strategies: strategyViews,
    states: stateViews
  };
}

function buildSymbolViewFromDatabase(symbol: SymbolRecord) {
  return buildSymbolView(
    symbol,
    getStrategiesBySymbol(symbol.id),
    getStatesBySymbol(symbol.id)
  );
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof ParamValidationError) {
    res.status(400).json(failure(error.message));
    return;
  }

  const message = error instanceof Error ? error.message : "";

  if (message.includes("UNIQUE constraint failed")) {
    res.status(409).json(failure("该交易标的已经存在"));
    return;
  }

  console.error("[API] 标的操作失败:", error);

  res.status(500).json(failure("操作失败"));
}

/**
 * 获取监控标的列表
 *
 * 策略与状态各用一次查询后在内存分组，避免标的增多时 N+1 查询。
 */
symbolsRouter.get("/", (_req, res) => {
  const symbols = getSymbols();

  const strategiesBySymbol = new Map<
    number,
    StrategyRecord[]
  >();

  for (const strategy of getAllStrategies()) {
    const list = strategiesBySymbol.get(strategy.symbol_id);

    if (list) {
      list.push(strategy);
    } else {
      strategiesBySymbol.set(strategy.symbol_id, [strategy]);
    }
  }

  const statesBySymbol = new Map<
    number,
    StrategyStateRecord[]
  >();

  for (const state of getAllStates()) {
    const list = statesBySymbol.get(state.symbol_id);

    if (list) {
      list.push(state);
    } else {
      statesBySymbol.set(state.symbol_id, [state]);
    }
  }

  res.json(
    success(
      symbols.map((symbol) =>
        buildSymbolView(
          symbol,
          strategiesBySymbol.get(symbol.id) ?? [],
          statesBySymbol.get(symbol.id) ?? []
        )
      )
    )
  );
});

/**
 * 添加监控标的
 *
 * {
 *   "symbol": "BTCUSDT",
 *   "interval": "1m",
 *   "strategies": [
 *     { "kind": "EMA_TREND", "params": { "fast": 9, "slow": 21, "threshold": 10 } },
 *     { "kind": "KDJ_ENTRY", "params": { "period": 9, "kSmooth": 3, "dSmooth": 3, "oversold": 5, "overbought": 85 } }
 *   ]
 * }
 */
symbolsRouter.post("/", (req, res) => {
  const body = req.body ?? {};

  const normalizedSymbol =
    typeof body.symbol === "string"
      ? body.symbol.trim().toUpperCase()
      : "";

  if (!isValidSymbol(normalizedSymbol)) {
    res.status(400).json(failure("交易标的格式不正确"));
    return;
  }

  const interval = body.interval ?? DEFAULT_INTERVAL;

  if (
    typeof interval !== "string" ||
    !isValidInterval(interval)
  ) {
    res.status(400).json(failure("不支持的 K 线周期"));
    return;
  }

  const klineLimit = getKlineLimit();

  try {
    const enabled = readFlag(body.enabled, 1, "监控开关");
    const notifyEnabled = readFlag(
      body.notify_enabled,
      1,
      "通知开关"
    );

    const inputs: StrategyInput[] =
      body.strategies === undefined
        ? [
            {
              kind: "EMA_TREND",
              enabled: 1,
              notify_enabled: 1,
              params: getRunner("EMA_TREND").defaultParams()
            },
            {
              kind: "KDJ_ENTRY",
              enabled: 1,
              notify_enabled: 1,
              params: getRunner("KDJ_ENTRY").defaultParams()
            }
          ]
        : parseStrategyList(body.strategies, klineLimit);

    if (inputs.length === 0) {
      res.status(400).json(failure("至少需要配置一个策略"));
      return;
    }

    // 预先校验全部参数，避免事务中途失败
    const prepared = inputs.map((input) => ({
      kind: input.kind,
      enabled: input.enabled ?? 1,
      notify_enabled: input.notify_enabled ?? 1,
      params: normalizeByKind(
        input.kind,
        input.params,
        klineLimit
      )
    }));

    let createdId = 0;

    const transaction = db.transaction(() => {
      const created = insertSymbol({
        symbol: normalizedSymbol,
        interval,
        enabled,
        notify_enabled: notifyEnabled
      });

      createdId = created.id;

      for (const item of prepared) {
        insertStrategy({
          symbolId: created.id,
          kind: item.kind,
          enabled: item.enabled,
          notify_enabled: item.notify_enabled,
          params: JSON.stringify(item.params),
          sortOrder: getRunner(item.kind).sortOrder
        });
      }
    });

    transaction();

    const created = getSymbolById(createdId);

    if (!created) {
      res.status(500).json(failure("添加标的失败"));
      return;
    }

    res
      .status(201)
      .json(
        success(
          buildSymbolViewFromDatabase(created),
          "添加成功"
        )
      );
  } catch (error) {
    respondError(res, error);
  }
});

/**
 * 立即请求一次最新 K 线数据。
 *
 * 请求放入 Worker 队列异步执行，接口立即返回，
 * 避免 Binance 网络超时导致前端长时间等待。
 */
symbolsRouter.post("/refresh", (_req, res) => {
  if (!requestManualRefresh()) {
    res
      .status(409)
      .json(failure("已有数据请求正在执行，请稍后再试"));
    return;
  }

  res
    .status(202)
    .json(success({ queued: true }, "已开始请求最新数据"));
});

/**
 * 修改监控配置
 */
symbolsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("标的 ID 不正确"));
    return;
  }

  const existing = getSymbolById(id);

  if (!existing) {
    res.status(404).json(failure("监控标的不存在"));
    return;
  }

  const body = req.body ?? {};
  const klineLimit = getKlineLimit();

  try {
    const interval = body.interval ?? existing.interval;

    if (
      typeof interval !== "string" ||
      !isValidInterval(interval)
    ) {
      res.status(400).json(failure("不支持的 K 线周期"));
      return;
    }

    const enabled = readFlag(
      body.enabled,
      existing.enabled,
      "监控开关"
    );

    const notifyEnabled = readFlag(
      body.notify_enabled,
      existing.notify_enabled,
      "通知开关"
    );

    const existingStrategies = getStrategiesBySymbol(id);

    const updates: Array<{
      kind: StrategyKind;
      enabled: number;
      notify_enabled: number;
      params: StrategyParams;
      changed: boolean;
      isNew: boolean;
    }> = [];

    if (body.strategies !== undefined) {
      const inputs = parseStrategyList(
        body.strategies,
        klineLimit
      );

      for (const input of inputs) {
        const current = existingStrategies.find(
          (item) => item.kind === input.kind
        );

        const baseParams = current
          ? parseJsonObject(current.params)
          : {};

        const mergedParams = {
          ...baseParams,
          ...(isPlainObject(input.params)
            ? input.params
            : {})
        };

        const params = normalizeByKind(
          input.kind,
          mergedParams,
          klineLimit
        );

        const nextEnabled =
          input.enabled ?? current?.enabled ?? 1;

        const nextNotify =
          input.notify_enabled ??
          current?.notify_enabled ??
          1;

        const changed =
          !current ||
          current.enabled !== nextEnabled ||
          JSON.stringify(parseJsonObject(current.params)) !==
            JSON.stringify(params);

        updates.push({
          kind: input.kind,
          enabled: nextEnabled,
          notify_enabled: nextNotify,
          params,
          changed,
          isNew: !current
        });
      }
    }

    const intervalChanged = interval !== existing.interval;
    const strategyChanged =
      updates.some((item) => item.changed) ||
      intervalChanged;

    const transaction = db.transaction(() => {
      updateSymbolFields(id, {
        interval,
        enabled,
        notify_enabled: notifyEnabled
      });

      for (const item of updates) {
        if (item.isNew) {
          insertStrategy({
            symbolId: id,
            kind: item.kind,
            enabled: item.enabled,
            notify_enabled: item.notify_enabled,
            params: JSON.stringify(item.params),
            sortOrder: getRunner(item.kind).sortOrder
          });
        } else {
          updateStrategy({
            symbolId: id,
            kind: item.kind,
            enabled: item.enabled,
            notify_enabled: item.notify_enabled,
            params: JSON.stringify(item.params)
          });
        }
      }

      if (strategyChanged) {
        resetSymbolState(id);
      }
    });

    transaction();

    const updated = getSymbolById(id);

    res.json(
      success(
        updated
          ? buildSymbolViewFromDatabase(updated)
          : null,
        "配置已更新"
      )
    );
  } catch (error) {
    respondError(res, error);
  }
});

/**
 * 删除监控标的
 */
symbolsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("标的 ID 不正确"));
    return;
  }

  const changes = deleteSymbol(id);

  if (changes === 0) {
    res.status(404).json(failure("监控标的不存在"));
    return;
  }

  res.json(success(null, "删除成功"));
});
