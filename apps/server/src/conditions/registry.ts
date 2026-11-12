import type { ConditionKind } from "../db/types";

import { adxTrendDefinition } from "./adx-trend";
import { emaCrossDefinition } from "./ema-cross";
import { emaFastTurnDefinition } from "./ema-fast-turn";
import { kdjExtremeDefinition } from "./kdj-extreme";
import { kdjJkCrossDefinition } from "./kdj-jk-cross";
import { macdDeaTurnDefinition } from "./macd-dea-turn";
import { macdDeaZoneDefinition } from "./macd-dea-zone";
import { macdDifZeroDefinition } from "./macd-dif-zero";
import { priceLevelDefinition } from "./price-level";
import { volumeSpikeDefinition } from "./volume-spike";
import type { ConditionDefinition } from "./types";

export const CONDITION_DEFINITIONS: Record<
  ConditionKind,
  ConditionDefinition
> = {
  EMA_CROSS: emaCrossDefinition,
  KDJ_EXTREME: kdjExtremeDefinition,
  KDJ_JK_CROSS: kdjJkCrossDefinition,
  VOLUME_SPIKE: volumeSpikeDefinition,
  PRICE_LEVEL: priceLevelDefinition,
  MACD_DEA_TURN: macdDeaTurnDefinition,
  MACD_DEA_ZONE: macdDeaZoneDefinition,
  MACD_DIF_ZERO: macdDifZeroDefinition,
  ADX_TREND: adxTrendDefinition,
  EMA_FAST_TURN: emaFastTurnDefinition
};

export function isConditionKind(
  value: unknown
): value is ConditionKind {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      CONDITION_DEFINITIONS,
      value
    )
  );
}

export function getConditionDefinition(
  kind: ConditionKind
): ConditionDefinition {
  return CONDITION_DEFINITIONS[kind];
}

export function getConditionCatalog() {
  return Object.values(CONDITION_DEFINITIONS).map((definition) => ({
    kind: definition.kind,
    label: definition.label,
    description: definition.description,
    roles: definition.roles,
    defaultRole: definition.defaultRole,
    summaryTemplate: definition.summaryTemplate,
    fields: definition.fields
  }));
}
