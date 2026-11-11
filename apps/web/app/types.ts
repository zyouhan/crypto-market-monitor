export type StrategyKind =
  | "EMA_TREND"
  | "KDJ_ENTRY"
  | "KDJ_TIMING";

export type SignalEventType =
  | "TREND_GOLDEN"
  | "TREND_DEATH"
  | "TREND_INVALIDATED"
  | "ENTRY_LONG"
  | "ENTRY_SHORT"
  | "VOLUME_SPIKE"
  | "PRICE_LEVEL"
  | "MACD_DEA_TURN"
  | "ADX_TREND"
  | "EMA_FAST_TURN"
  | "STOP_LOSS_HIT"
  | "TRADE_1R"
  | "TRADE_BREAKEVEN";

export interface EmaParams {
  fast: number;
  slow: number;
  threshold: number;
}

export interface KdjParams {
  period: number;
  kSmooth: number;
  dSmooth: number;
  oversold: number;
  overbought: number;
  longEnabled: boolean;
  shortEnabled: boolean;
}

export interface KdjTimingParams {
  oversold: number;
  overbought: number;
  longEnabled: boolean;
  shortEnabled: boolean;
}

export interface StrategyItem {
  kind: StrategyKind;
  enabled: number;
  notify_enabled: number;
  params: Record<string, unknown>;
}

export interface StateItem {
  status: string;
  baseline: {
    type: "GOLDEN" | "DEATH";
    price: number | null;
    ema: number | null;
    time: number | null;
  } | null;
  extra: Record<string, unknown>;
}

export interface SymbolItem {
  id: number;
  symbol: string;
  interval: string;
  enabled: number;
  notify_enabled: number;
  last_price: number | null;
  last_price_time: number | null;
  last_processed_close_time: number;
  strategies: StrategyItem[];
  states: Record<string, StateItem>;
}

export interface SignalItem {
  id: number;
  symbol_id: number;
  symbol: string;
  interval: string | null;
  kind: StrategyKind;
  event_type: SignalEventType;
  direction: "BULL" | "BEAR" | null;
  price: number;
  event_time: number;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  trigger_met: number;
  push_state: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  push_error: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  created_at: number;
}

export interface SettingsData {
  global_monitor_enabled: boolean;
  global_wechat_enabled: boolean;
  serverchan_configured: boolean;
}

export interface SignalStats {
  today: number;
  total: number;
  by_preset?: Array<{
    preset_id: string;
    preset_name: string;
    today: number;
    total: number;
    last_event_time: number | null;
    monitors: number;
  }>;
}

export type StatsResult =
  | "success"
  | "reasonable_stop"
  | "failed"
  | "other";

export interface StrategyStatsEntry {
  id: number;
  event_time: number;
  symbol: string;
  preset_id: string | null;
  preset_name: string | null;
  direction: "BULL" | "BEAR" | null;
  price: number;
  event_type: SignalEventType;
  monitor_name: string | null;
  stats_note: string | null;
  stats_result: StatsResult | null;
}

export interface StrategyStatsPage {
  items: StrategyStatsEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface SaveStrategyInput {
  kind: StrategyKind;
  enabled: boolean;
  notify_enabled: boolean;
  params: Record<string, unknown>;
}

export interface SaveSymbolPayload {
  symbol: string;
  interval: string;
  strategies: SaveStrategyInput[];
}

export type ConditionKind =
  | "EMA_CROSS"
  | "KDJ_EXTREME"
  | "VOLUME_SPIKE"
  | "PRICE_LEVEL"
  | "MACD_DEA_TURN"
  | "ADX_TREND"
  | "EMA_FAST_TURN";

export type ConditionRole = "trigger" | "filter";

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

export interface ConditionCatalogItem {
  kind: ConditionKind;
  label: string;
  description: string;
  roles: ConditionRole[];
  defaultRole: ConditionRole;
  summaryTemplate: string;
  fields: ConditionField[];
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
  legacy?: boolean;
}

export interface MonitorConditionView {
  id: number;
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  params: Record<string, unknown>;
  summary: string;
  snapshot: ConditionSnapshot | null;
}

export interface MonitorSignalItem {
  id: number;
  monitor_id: number | null;
  monitor_name: string | null;
  symbol: string;
  interval: string | null;
  preset_id?: string | null;
  preset_name?: string | null;
  kind: string;
  event_type: SignalEventType;
  direction: "BULL" | "BEAR" | null;
  price: number;
  event_time: number;
  primary_condition: string | null;
  conditions: ConditionSnapshot[];
  source: string | null;
  threshold: number | null;
  price_diff: number | null;
  ema_diff: number | null;
  trigger_met: number;
  push_state: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  push_error: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  created_at: number;
}

export interface TradeActionItem {
  id: number;
  monitor_id: number | null;
  signal_id: number | null;
  action: "T_LONG" | "T_SHORT" | "CLOSE";
  price: number;
  note: string | null;
  created_at: number;
}

export interface ActiveStopWatchItem {
  id: number;
  signal_id: number;
  direction: "BULL" | "BEAR";
  entry_price: number;
  stop_price: number;
  max_favorable_r: number;
  max_adverse_r: number;
}

export interface MonitorItem {
  id: number;
  name: string;
  symbol: string;
  interval: string;
  preset_id?: string | null;
  preset_name?: string | null;
  track_stats: number;
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
  source: "OKX" | "BINANCE" | "MIXED" | null;
  source_note: string | null;
  snapshot: {
    price?: number | null;
    conditions?: ConditionSnapshot[];
    updatedAt?: number;
  } | null;
  pending: boolean;
  conditions: MonitorConditionView[];
  trade_actions?: TradeActionItem[];
  active_stop_watch?: ActiveStopWatchItem | null;
  last_signal: MonitorSignalItem | null;
  created_at: number;
  updated_at: number;
}

export interface SaveConditionInput {
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  params: Record<string, unknown>;
}

export interface SaveMonitorPayload {
  name: string;
  symbol: string;
  interval: string;
  enabled: boolean;
  wechat_enabled: boolean;
  sound_enabled: boolean;
  preset_id?: string | null;
  preset_name?: string | null;
  track_stats: boolean;
  conditions: SaveConditionInput[];
}
