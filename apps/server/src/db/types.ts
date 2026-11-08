export type CrossType = "GOLDEN" | "DEATH";

export type TrendStatus = "NEUTRAL" | "BULL_WAITING" | "BEAR_WAITING";

export type EntryStatus = "IDLE" | "ARMED_LONG" | "ARMED_SHORT";

export type StrategyKind =
  | "EMA_TREND"
  | "KDJ_ENTRY"
  | "KDJ_TIMING";

export type SignalEventType =
  | "TREND_GOLDEN"
  | "TREND_DEATH"
  | "TREND_INVALIDATED"
  | "ENTRY_LONG"
  | "ENTRY_SHORT";

export type SignalDirection = "BULL" | "BEAR";

export type PushState = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface SymbolRecord {
  id: number;
  symbol: string;
  interval: string;
  enabled: number;
  notify_enabled: number;
  last_price: number | null;
  last_price_time: number | null;
  last_processed_close_time: number;
  created_at: number;
  updated_at: number;
}

export interface StrategyRecord {
  id: number;
  symbol_id: number;
  kind: StrategyKind;
  enabled: number;
  notify_enabled: number;
  params: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface StrategyStateRecord {
  symbol_id: number;
  kind: StrategyKind;
  status: string;
  baseline_type: CrossType | null;
  baseline_price: number | null;
  baseline_ema: number | null;
  baseline_time: number | null;
  extra: string | null;
  updated_at: number;
}

export interface SignalRecord {
  id: number;
  symbol_id: number;
  symbol: string;
  interval: string | null;
  kind: StrategyKind;
  event_type: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  event_time: number;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  trigger_met: number;
  push_state: PushState;
  push_error: string | null;
  reason: string | null;
  payload: string | null;
  created_at: number;
}

export interface NewSignalRecord {
  symbol_id: number;
  symbol: string;
  interval: string;
  kind: StrategyKind;
  event_type: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  event_time: number;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  trigger_met: number;
  push_state: PushState;
  reason: string | null;
  payload: string;
  created_at: number;
}
