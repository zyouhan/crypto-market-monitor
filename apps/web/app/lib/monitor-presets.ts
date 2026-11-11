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
    "short-dea-kdj",
    "5m DEA + 1m KDJ（做空）",
    "5m DEA 拐头向下第一根后，1m J>80 入场；5m MACD 柱需有足够幅度，且 15m EMA 趋势不能向上",
    "short",
    "5m DEA向下 + 1m J>80",
    ["KDJ_EXTREME", "MACD_DEA_TURN", "EMA_CROSS"],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "1m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 15,
          overbought: 80,
          longEnabled: false,
          shortEnabled: true,
          triggerMode: "cross"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "5m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "down",
          freshBars: 12,
          zeroSide: "any",
          minHistPct: 0.02
        }
      );
      const trend = makeCondition(
        catalog,
        "EMA_CROSS",
        "filter",
        "15m",
        {
          fast: 25,
          slow: 60,
          threshold: 0,
          priceSide: "none",
          maxPriceDistancePct: 0
        }
      );

      return kdj && macd && trend
        ? [kdj, macd, trend]
        : null;
    }
  ),
  makePreset(
    "long-dea-kdj",
    "5m DEA + 1m KDJ（做多）",
    "5m DEA 拐头向上第一根后，1m J<15 入场；价格不得过度偏离 5m 快线",
    "long",
    "5m DEA向上 + 1m J<15",
    ["KDJ_EXTREME", "MACD_DEA_TURN", "EMA_CROSS"],
    (catalog) => {
      const kdj = makeCondition(
        catalog,
        "KDJ_EXTREME",
        "trigger",
        "1m",
        {
          period: 9,
          kSmooth: 3,
          dSmooth: 3,
          oversold: 15,
          overbought: 80,
          longEnabled: true,
          shortEnabled: false,
          triggerMode: "cross"
        }
      );
      const macd = makeCondition(
        catalog,
        "MACD_DEA_TURN",
        "filter",
        "5m",
        {
          fast: 12,
          slow: 26,
          signal: 9,
          direction: "up",
          freshBars: 12,
          zeroSide: "any",
          minHistPct: 0
        }
      );
      const ema = makeCondition(
        catalog,
        "EMA_CROSS",
        "filter",
        "5m",
        {
          fast: 25,
          slow: 60,
          threshold: 0,
          priceSide: "none",
          maxPriceDistancePct: 1.5
        }
      );

      return kdj && macd && ema
        ? [kdj, macd, ema]
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
