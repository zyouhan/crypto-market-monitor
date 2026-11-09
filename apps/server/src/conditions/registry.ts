import type { ConditionKind } from "../db/types";

import { emaCrossDefinition } from "./ema-cross";
import { kdjExtremeDefinition } from "./kdj-extreme";
import { priceLevelDefinition } from "./price-level";
import { volumeSpikeDefinition } from "./volume-spike";
import type { ConditionDefinition } from "./types";

export const CONDITION_DEFINITIONS: Record<
  ConditionKind,
  ConditionDefinition
> = {
  EMA_CROSS: emaCrossDefinition,
  KDJ_EXTREME: kdjExtremeDefinition,
  VOLUME_SPIKE: volumeSpikeDefinition,
  PRICE_LEVEL: priceLevelDefinition
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
