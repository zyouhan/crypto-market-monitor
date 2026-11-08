export interface EmaTrendParams {
  fast: number;
  slow: number;
  threshold: number;
}

export interface KdjEntryParams {
  period: number;
  kSmooth: number;
  dSmooth: number;
  oversold: number;
  overbought: number;
  longEnabled: boolean;
  shortEnabled: boolean;
}

export type StrategyParams = EmaTrendParams | KdjEntryParams;

export const DEFAULT_EMA_PARAMS: EmaTrendParams = {
  fast: 25,
  slow: 60,
  threshold: 10
};

export const DEFAULT_KDJ_PARAMS: KdjEntryParams = {
  period: 9,
  kSmooth: 3,
  dSmooth: 3,
  oversold: 5,
  overbought: 85,
  longEnabled: true,
  shortEnabled: true
};

export class ParamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readInteger(
  value: unknown,
  fallback: number,
  label: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ParamValidationError(`${label}必须为整数`);
  }

  return value;
}

function readNumber(
  value: unknown,
  fallback: number,
  label: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ParamValidationError(`${label}必须为有限数字`);
  }

  return value;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  label: string
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new ParamValidationError(`${label}必须为布尔值`);
  }

  return value;
}

/**
 * 校验并补全 EMA 趋势策略参数。
 */
export function normalizeEmaParams(
  input: unknown,
  klineLimit: number
): EmaTrendParams {
  if (input !== undefined && input !== null && !isPlainObject(input)) {
    throw new ParamValidationError("EMA 参数必须为对象");
  }

  const raw = isPlainObject(input) ? input : {};

  const fast = readInteger(
    raw.fast,
    DEFAULT_EMA_PARAMS.fast,
    "快线周期"
  );

  const slow = readInteger(
    raw.slow,
    DEFAULT_EMA_PARAMS.slow,
    "慢线周期"
  );

  const threshold = readNumber(
    raw.threshold,
    DEFAULT_EMA_PARAMS.threshold,
    "价格差阈值"
  );

  if (fast < 2) {
    throw new ParamValidationError("快线周期不能小于 2");
  }

  if (slow <= fast) {
    throw new ParamValidationError("慢线周期必须大于快线周期");
  }

  if (slow + 1 > klineLimit) {
    throw new ParamValidationError(
      `慢线周期不能超过 K 线获取数量（${klineLimit}）`
    );
  }

  if (threshold < 0) {
    throw new ParamValidationError("价格差阈值不能小于 0");
  }

  return { fast, slow, threshold };
}

/**
 * 校验并补全 KDJ 入场策略参数。
 */
export function normalizeKdjParams(
  input: unknown,
  klineLimit: number
): KdjEntryParams {
  if (input !== undefined && input !== null && !isPlainObject(input)) {
    throw new ParamValidationError("KDJ 参数必须为对象");
  }

  const raw = isPlainObject(input) ? input : {};

  const period = readInteger(
    raw.period,
    DEFAULT_KDJ_PARAMS.period,
    "KDJ 周期"
  );

  const kSmooth = readInteger(
    raw.kSmooth,
    DEFAULT_KDJ_PARAMS.kSmooth,
    "K 值平滑系数"
  );

  const dSmooth = readInteger(
    raw.dSmooth,
    DEFAULT_KDJ_PARAMS.dSmooth,
    "D 值平滑系数"
  );

  const oversold = readNumber(
    raw.oversold,
    DEFAULT_KDJ_PARAMS.oversold,
    "超卖阈值"
  );

  const overbought = readNumber(
    raw.overbought,
    DEFAULT_KDJ_PARAMS.overbought,
    "超买阈值"
  );

  const longEnabled = readBoolean(
    raw.longEnabled,
    DEFAULT_KDJ_PARAMS.longEnabled,
    "做多开关"
  );

  const shortEnabled = readBoolean(
    raw.shortEnabled,
    DEFAULT_KDJ_PARAMS.shortEnabled,
    "做空开关"
  );

  if (period < 2 || period > klineLimit) {
    throw new ParamValidationError(
      `KDJ 周期必须在 2 到 ${klineLimit} 之间`
    );
  }

  if (kSmooth < 1 || kSmooth > 20) {
    throw new ParamValidationError("K 值平滑系数必须在 1 到 20 之间");
  }

  if (dSmooth < 1 || dSmooth > 20) {
    throw new ParamValidationError("D 值平滑系数必须在 1 到 20 之间");
  }

  if (oversold < 0 || oversold > 50) {
    throw new ParamValidationError("超卖阈值必须在 0 到 50 之间");
  }

  if (overbought < 50 || overbought > 100) {
    throw new ParamValidationError("超买阈值必须在 50 到 100 之间");
  }

  if (oversold >= overbought) {
    throw new ParamValidationError("超卖阈值必须小于超买阈值");
  }

  return {
    period,
    kSmooth,
    dSmooth,
    oversold,
    overbought,
    longEnabled,
    shortEnabled
  };
}

export function isEmaParams(
  params: StrategyParams
): params is EmaTrendParams {
  return "fast" in params;
}

export function isKdjParams(
  params: StrategyParams
): params is KdjEntryParams {
  return "period" in params;
}
