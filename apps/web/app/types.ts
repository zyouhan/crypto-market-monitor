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
  | "LONG_ZONE_START"
  | "LONG_ZONE_EXHAUST"
  | "SHORT_ZONE_START"
  | "SHORT_ZONE_EXHAUST"
  | "DIF_ZERO_UP"
  | "DIF_ZERO_DOWN"
  | "KDJ_J_UP_K"
  | "KDJ_J_DOWN_K"
  | "CANDLE_TOP"
  | "CANDLE_BOTTOM"
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
  reference_trends?:
    | Partial<
        Record<
          "15m" | "1h" | "4h",
          ReferenceTrend | null
        >
      >
    | null;
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
  legacy_count?: number;
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
  | "light_success"
  | "heavy_success"
  | "light_reasonable_stop"
  | "heavy_reasonable_stop"
  | "light_failed"
  | "heavy_failed"
  | "not_suitable"
  | "other";

export interface StrategyStatsEntry {
  id: number;
  event_time: number;
  symbol: string;
  preset_id: string | null;
  preset_name: string | null;
  condition_summary: string;
  direction: "BULL" | "BEAR" | null;
  price: number;
  event_type: SignalEventType;
  monitor_name: string | null;
  stats_note: string | null;
  stats_result: StatsResult | null;
  reference_trends:
    | Partial<
        Record<
          "15m" | "1h" | "4h",
          ReferenceTrend | null
        >
      >
    | null;
}

export interface ReferenceTrend {
  interval: "15m" | "1h" | "4h";
  direction: "up" | "down";
  turning: boolean;
  accelerating: boolean;
  weakening: boolean;
  dea: number;
  time: number;
}

export interface StrategyStatsPage {
  items: StrategyStatsEntry[];
  total: number;
  unfilled: number;
  limit: number;
  offset: number;
}

export interface StatsResultStats {
  symbol: string | null;
  symbols: string[];
  total: number;
  filled: number;
  unfilled: number;
  by_result: Array<{
    result: StatsResult;
    count: number;
    pct: number;
  }>;
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
  | "MACD_DEA_ZONE"
  | "MACD_DIF_ZERO"
  | "KDJ_JK_CROSS"
  | "CANDLE_PATTERN"
  | "ADX_TREND"
  | "EMA_FAST_TURN";

export type ConditionRole = "trigger" | "filter";

export type ConditionLogic = "AND" | "OR" | "NOT";

export interface ConditionField {
  key: string;
  label: string;
  type: "number" | "boolean" | "select" | "multiselect";
  min?: number;
  max?: number;
  step?: number | "any";
  options?: Array<{ value: string; label: string }>;
  defaultValue: number | boolean | string | string[];
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
  logic?: ConditionLogic;
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
  logic: ConditionLogic;
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
  candle_time?: number | null;
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
  reference_trends?:
    | Partial<
        Record<
          "15m" | "1h" | "4h",
          ReferenceTrend | null
        >
      >
    | null;
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
  reference_intervals: Array<"15m" | "1h" | "4h">;
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
    reference_trends?:
      | Partial<
          Record<
            "15m" | "1h" | "4h",
            ReferenceTrend | null
          >
        >
      | null;
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
  logic?: ConditionLogic;
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
  reference_intervals: Array<"15m" | "1h" | "4h">;
  conditions: SaveConditionInput[];
}

export type TradeQuality = "excellent" | "good" | "fair" | "poor";

export interface TradeRecord {
  id: number;
  symbol: string;
  direction: "BULL" | "BEAR";
  open_time: number;
  close_time: number;
  pnl: number;
  open_quality: TradeQuality;
  close_quality: TradeQuality;
  take_profit_quality: TradeQuality;
  stop_loss_quality: TradeQuality;
  note: string | null;
  self_check_id: number | null;
  self_check_exists?: number;
  created_at: number;
  updated_at: number;
}

export interface TradePage {
  items: TradeRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TradeCurvePoint {
  time: number;
  pnl: number;
  cumulative: number;
}

export interface MindsetFactor {
  key: string;
  label: string;
  value: string;
  penalty: number;
  detail: string;
}

export interface MindsetData {
  date: string;
  score: number | null;
  status: "healthy" | "tired" | "unstable" | "stop" | "unrated";
  trade_count: number;
  pnl: number;
  win_rate: number;
  average_hold_minutes: number;
  factors: MindsetFactor[];
  warning: string;
  reset: {
    available: boolean;
    reason: string;
    count: number;
    last_reset_at: number | null;
    cooldown_until: number | null;
  };
}

export type SelfCheckEmaArrangement = "bull" | "bear" | "flat";
export type SelfCheckSpreadState =
  | "expanding"
  | "contracting"
  | "flat"
  | "unknown";
export type SelfCheckTrendStrength =
  | "strong"
  | "weak"
  | "unclear";
export type SelfCheckKdjZone =
  | "overbought"
  | "oversold"
  | "neutral"
  | "unknown";
export type SelfCheckMacdZone =
  | "above"
  | "below"
  | "mixed"
  | "unknown";
export type SelfCheckMacdCross =
  | "golden"
  | "death"
  | "unknown";
export type SelfCheckMacdHistogramState =
  | "expanding"
  | "contracting"
  | "flat"
  | "unknown";
export type SelfCheckVolumeState =
  | "high"
  | "normal"
  | "low"
  | "unknown";

/**
 * 开单自查单个级别的快照。
 *
 * 新字段是可选的，因为旧记录的 snapshot_json 只有旧字段；
 * 展示时需要用 lib/self-check.ts 里的兜底函数。
 */
export interface SelfCheckIntervalSnapshot {
  interval: string;
  ema_arrangement?: SelfCheckEmaArrangement;
  ema_duration_minutes?: number | null;
  ema_duration_start?: number | null;
  ema_spread_state?: SelfCheckSpreadState;
  ema_spread_change_pct?: number | null;
  trend_strength?: SelfCheckTrendStrength;
  j?: number | null;
  k?: number | null;
  d?: number | null;
  kdj_zone?: SelfCheckKdjZone;
  macd_zone?: SelfCheckMacdZone;
  macd_cross?: SelfCheckMacdCross;
  macd_histogram_state?: SelfCheckMacdHistogramState;
  volume_state?: SelfCheckVolumeState;
  volume_ratio?: number | null;

  // 旧快照兼容字段
  trend?: "up" | "down";
  strength?: "强" | "中" | "弱" | "拐头";
  demand?: "上涨需求" | "下跌需求" | null;
  ema25?: number | null;
  ema60?: number | null;
  source?: string | null;
  time?: number | null;
  error?: string | null;
}

export interface SelfCheckPreviewResponse {
  symbol: string;
  snapshot: SelfCheckIntervalSnapshot[];
}
