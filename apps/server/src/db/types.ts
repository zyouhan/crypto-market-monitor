export type CrossType = "GOLDEN" | "DEATH";

export type TrendStatus = "NEUTRAL" | "BULL_WAITING" | "BEAR_WAITING";

export type EntryStatus = "IDLE" | "ARMED_LONG" | "ARMED_SHORT";

export type StrategyKind =
  | "EMA_TREND"
  | "KDJ_ENTRY"
  | "KDJ_TIMING";

export type ConditionKind =
  | "EMA_CROSS"
  | "KDJ_EXTREME"
  | "VOLUME_SPIKE"
  | "PRICE_LEVEL"
  | "MACD_DEA_TURN"
  | "MACD_DEA_ZONE"
  | "ADX_TREND"
  | "EMA_FAST_TURN";

export type ConditionRole = "trigger" | "filter";

export type MarketSource = "OKX" | "BINANCE" | "MIXED";

export interface MonitorRecord {
  id: number;
  name: string;
  symbol: string;
  interval: string;
  preset_id: string | null;
  preset_name: string | null;
  track_stats: number;
  reference_intervals: string;
  enabled: number;
  wechat_enabled: number;
  sound_enabled: number;
  last_price: number | null;
  last_price_time: number | null;
  last_processed_close_time: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  source: MarketSource | null;
  source_note: string | null;
  snapshot: string | null;
  created_at: number;
  updated_at: number;
}

export interface MonitorConditionRecord {
  id: number;
  monitor_id: number;
  kind: ConditionKind;
  role: ConditionRole;
  interval: string | null;
  params: string;
  state: string | null;
  last_processed_close_time: number;
  state_updated_at: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ConditionDisplayItem {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "neutral" | "warn";
}

export interface ConditionSnapshot {
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  summary: string;
  statusText: string;
  display: ConditionDisplayItem[];
  source?: string | null;
  time?: number | null;
}

export interface MonitorSignalRecord {
  id: number;
  monitor_id: number | null;
  monitor_name: string | null;
  preset_id: string | null;
  preset_name: string | null;
  track_stats: number;
  stats_deleted: number;
  reference_trends: string | null;
  symbol: string;
  interval: string | null;
  kind: string;
  event_type: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  event_time: number;
  primary_condition: string | null;
  conditions: string | null;
  source: string | null;
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

export interface NewMonitorSignalRecord {
  monitor_id: number | null;
  monitor_name: string | null;
  preset_id: string | null;
  preset_name: string | null;
  track_stats: number;
  stats_deleted: number;
  reference_trends: string | null;
  symbol: string;
  interval: string;
  kind: string;
  event_type: SignalEventType;
  direction: SignalDirection | null;
  price: number;
  event_time: number;
  primary_condition: string | null;
  conditions: string;
  source: string | null;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  trigger_met: number;
  push_state: PushState;
  reason: string | null;
  payload: string;
  created_at: number;
}

export type SignalEventType =
  | "TREND_GOLDEN"
  | "TREND_DEATH"
  | "TREND_INVALIDATED"
  | "ENTRY_LONG"
  | "ENTRY_SHORT"
  | "VOLUME_SPIKE"
  | "PRICE_LEVEL"
  | "MACD_DEA_TURN"
  | "LONG_ZONE_START"
  | "LONG_ZONE_EXHAUST"
  | "SHORT_ZONE_START"
  | "SHORT_ZONE_EXHAUST"
  | "ADX_TREND"
  | "EMA_FAST_TURN"
  | "STOP_LOSS_HIT"
  | "TRADE_1R"
  | "TRADE_BREAKEVEN";

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
