export type StrategyKind = "EMA_TREND" | "KDJ_ENTRY";

export type SignalEventType =
  | "TREND_GOLDEN"
  | "TREND_DEATH"
  | "TREND_INVALIDATED"
  | "ENTRY_LONG"
  | "ENTRY_SHORT";

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
  global_wechat_enabled: boolean;
  serverchan_configured: boolean;
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
