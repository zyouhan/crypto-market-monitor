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
  direction: "long" | "short" | "both";
  defaultName: string;
  requiredKinds: ConditionKind[];
  intervals?: string[];
  trackStats?: boolean;
  referenceIntervals?: Array<"15m" | "1h" | "4h">;
  build: (
    catalog: ConditionCatalogItem[],
    interval?: string
  ) => ConditionDraft[] | null;
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
  direction: "long" | "short" | "both",
  defaultName: string,
  requiredKinds: ConditionKind[],
  build: (
    catalog: ConditionCatalogItem[],
    interval?: string
  ) => ConditionDraft[] | null,
  options: {
    intervals?: string[];
    trackStats?: boolean;
    referenceIntervals?: Array<"15m" | "1h" | "4h">;
  } = {}
): MonitorPreset {
  return {
    id,
    title,
    description,
    direction,
    defaultName,
    requiredKinds,
    intervals: options.intervals,
    trackStats: options.trackStats,
    referenceIntervals: options.referenceIntervals,
    build
  };
}

export const MONITOR_PRESETS: MonitorPreset[] = [
  makePreset(
    "dea-zone-mtf",
    "15m / 1h / 4h DEA 区间",
    "DEA 上拐进入多头区间，DIF 拐头提示衰竭，DEA 下拐进入空头区间；不再使用 KDJ",
    "both",
    "DEA 区间监控",
    ["MACD_DEA_ZONE"],
    (catalog) => {
      const conditions = ["15m", "1h", "4h"].map(
        (interval) =>
          makeCondition(
            catalog,
            "MACD_DEA_ZONE",
            "trigger",
            interval,
            {
              fast: 12,
              slow: 26,
              signal: 9
            }
          )
      );

      return conditions.every(
        (condition): condition is ConditionDraft =>
          condition !== null
      )
        ? conditions
        : null;
    },
    {
      intervals: ["15m", "1h", "4h"],
      trackStats: false,
      referenceIntervals: []
    }
  )
];

export function buildPresetConditions(
  preset: MonitorPreset,
  catalog: ConditionCatalogItem[],
  interval?: string
): ConditionDraft[] | null {
  if (
    preset.requiredKinds.some(
      (kind) => !catalog.some((item) => item.kind === kind)
    )
  ) {
    return null;
  }

  return preset.build(catalog, interval);
}
