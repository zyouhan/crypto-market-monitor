import {
  createDefaultCondition,
  type ConditionDraft
} from "../components/ConditionEditor";
import type {
  ConditionCatalogItem,
  ConditionKind
} from "../types";

export interface MonitorPreset {
  id: string;
  title: string;
  description: string;
  direction: "long" | "short";
  defaultName: string;
  requiredKinds: ConditionKind[];
  build: (catalog: ConditionCatalogItem[]) => ConditionDraft[] | null;
}

function makeCondition(
  catalog: ConditionCatalogItem[],
  kind: ConditionKind,
  role: "trigger" | "filter",
  interval: string,
  params: Record<string, unknown>
): ConditionDraft | null {
  const definition = catalog.find((item) => item.kind === kind);

  if (!definition) {
    return null;
  }

  const draft = createDefaultCondition(
    definition,
    interval,
    role
  );

  return {
    ...draft,
    params: { ...draft.params, ...params }
  };
}

function makePreset(
  id: string,
  title: string,
  description: string,
  direction: "long" | "short",
  defaultName: string,
  requiredKinds: ConditionKind[],
  build: (catalog: ConditionCatalogItem[]) => ConditionDraft[] | null
): MonitorPreset {
  return {
    id,
    title,
    description,
    direction,
    defaultName,
    requiredKinds,
    build
  };
}

export const MONITOR_PRESETS: MonitorPreset[] = [
  makePreset(
    "long-basic",
    "多头拐点",
    "5m KDJ 超卖拐头 + 15m DEA 向上",
    "long",
    "5m KDJ 超卖拐头 + 15m DEA 向上",
    ["KDJ_EXTREME", "MACD_DEA_TURN"],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "5m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 15,
          overbought: 85,
          longEnabled: true,
          shortEnabled: false,
          triggerMode: "reversal"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "15m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "up",
          freshBars: 3
        }
      );

      return kdj && macd ? [kdj, macd] : null;
    }
  ),
  makePreset(
    "short-basic",
    "空头拐点",
    "5m KDJ 超买 + 15m DEA 向下",
    "short",
    "5m KDJ 超买 + 15m DEA 向下",
    ["KDJ_EXTREME", "MACD_DEA_TURN"],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "5m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 5,
          overbought: 85,
          longEnabled: false,
          shortEnabled: true,
          triggerMode: "cross"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "15m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "down",
          freshBars: 3
        }
      );

      return kdj && macd ? [kdj, macd] : null;
    }
  ),
  makePreset(
    "long-strict",
    "多头严格",
    "KDJ 拐头 + DEA/EMA/ADX 多重过滤",
    "long",
    "5m KDJ 超卖 + 15m DEA/EMA/ADX",
    [
      "KDJ_EXTREME",
      "MACD_DEA_TURN",
      "EMA_CROSS",
      "ADX_TREND"
    ],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "5m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 15,
          overbought: 85,
          longEnabled: true,
          shortEnabled: false,
          triggerMode: "reversal"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "15m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "up",
          freshBars: 3
        }
      );
      const ema = makeCondition(
        catalog,
        "EMA_CROSS",
        "filter",
        "15m",
        {
          fast: 25,
          slow: 60,
          threshold: 10,
          priceSide: "above"
        }
      );
      const adx = makeCondition(
        catalog,
        "ADX_TREND",
        "filter",
        "15m",
        {
          period: 14,
          threshold: 20,
          direction: "bull"
        }
      );

      return kdj && macd && ema && adx
        ? [kdj, macd, ema, adx]
        : null;
    }
  ),
  makePreset(
    "short-strict",
    "空头严格",
    "KDJ 超买 + DEA/EMA/ADX 多重过滤",
    "short",
    "5m KDJ 超买 + 15m DEA/EMA/ADX",
    [
      "KDJ_EXTREME",
      "MACD_DEA_TURN",
      "EMA_CROSS",
      "ADX_TREND"
    ],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "5m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 5,
          overbought: 85,
          longEnabled: false,
          shortEnabled: true,
          triggerMode: "cross"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "15m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "down",
          freshBars: 3
        }
      );
      const ema = makeCondition(
        catalog,
        "EMA_CROSS",
        "filter",
        "15m",
        {
          fast: 25,
          slow: 60,
          threshold: 10,
          priceSide: "below"
        }
      );
      const adx = makeCondition(
        catalog,
        "ADX_TREND",
        "filter",
        "15m",
        {
          period: 14,
          threshold: 20,
          direction: "bear"
        }
      );

      return kdj && macd && ema && adx
        ? [kdj, macd, ema, adx]
        : null;
    }
  )
];

export function buildPresetConditions(
  preset: MonitorPreset,
  catalog: ConditionCatalogItem[]
): ConditionDraft[] | null {
  if (
    preset.requiredKinds.some(
      (kind) => !catalog.some((item) => item.kind === kind)
    )
  ) {
    return null;
  }

  return preset.build(catalog);
}
