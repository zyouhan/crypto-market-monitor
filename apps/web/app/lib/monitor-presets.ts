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
    "short-exhaustion",
    "上涨衰竭（做空）",
    "15m DEA 远离零轴向下 + EMA 快线拐头 + 5m J>85",
    "short",
    "5m J>85 + 15m DEA/EMA 拐头向下",
    ["KDJ_EXTREME", "MACD_DEA_TURN", "EMA_FAST_TURN"],
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
          freshBars: 20,
          zeroSide: "positive",
          minAbsDeaPct: 0.05
        }
      );
      const ema = makeCondition(
        catalog,
        "EMA_FAST_TURN",
        "filter",
        "15m",
        {
          fast: 25,
          slow: 60,
          turn: "down",
          minSeparationPct: 0.5
        }
      );

      return kdj && macd && ema
        ? [kdj, macd, ema]
        : null;
    }
  ),
  makePreset(
    "long-exhaustion",
    "下跌衰竭（做多）",
    "15m DEA 远离零轴向上 + EMA 快线拐头 + 5m J<5",
    "long",
    "5m J<5 + 15m DEA/EMA 拐头向上",
    ["KDJ_EXTREME", "MACD_DEA_TURN", "EMA_FAST_TURN"],
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
          longEnabled: true,
          shortEnabled: false,
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
          direction: "up",
          freshBars: 20,
          zeroSide: "negative",
          minAbsDeaPct: 0.05
        }
      );
      const ema = makeCondition(
        catalog,
        "EMA_FAST_TURN",
        "filter",
        "15m",
        {
          fast: 25,
          slow: 60,
          turn: "up",
          minSeparationPct: 0.5
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
