import type {
  ConditionDisplayItem,
  ConditionKind,
  ConditionRole,
  SignalDirection,
  SignalEventType
} from "../db/types";
import type { Kline } from "../indicators/types";

export interface ConditionField {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number | "any";
  options?: Array<{ value: string; label: string }>;
  defaultValue: number | boolean | string;
  help?: string;
}

export interface ConditionPoint {
  time: number;
  eventType: SignalEventType | null;
  direction: SignalDirection | null;
  active: boolean;
  threshold: number | null;
  payload: Record<string, unknown>;
  display: ConditionDisplayItem[];
}

export interface ConditionRunInput {
  state: Record<string, unknown>;
  params: Record<string, unknown>;
  klines: Kline[];
  newKlines: Kline[];
  warmup: boolean;
}

export interface ConditionRunResult {
  state: Record<string, unknown>;
  points: Map<number, ConditionPoint>;
  latest: ConditionPoint | null;
  statusText: string;
}

export interface ConditionDefinition {
  kind: ConditionKind;
  label: string;
  description: string;
  roles: ConditionRole[];
  defaultRole: ConditionRole;
  summaryTemplate: string;
  fields: ConditionField[];
  normalizeParams(
    raw: unknown,
    klineLimit: number
  ): Record<string, unknown>;
  summarize(params: Record<string, unknown>): string;
  run(input: ConditionRunInput): ConditionRunResult;
}
