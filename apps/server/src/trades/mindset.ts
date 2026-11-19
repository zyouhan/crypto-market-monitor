export type TradeQuality = "excellent" | "good" | "fair" | "poor";

export interface TradeRecordRow {
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

export interface MindsetFactor {
  key: string;
  label: string;
  value: string;
  penalty: number;
  detail: string;
}

export interface MindsetScore {
  date: string;
  score: number | null;
  status: "healthy" | "tired" | "unstable" | "stop" | "unrated";
  trade_count: number;
  pnl: number;
  win_rate: number;
  average_hold_minutes: number;
  factors: MindsetFactor[];
  warning: string;
}

interface ResetInfo {
  created_at: number;
  after_score: number;
}

const OPEN_WEIGHTS: Record<TradeQuality, number> = {
  excellent: 2,
  good: 0,
  fair: -4,
  poor: -10
};

const CLOSE_WEIGHTS: Record<TradeQuality, number> = {
  excellent: 1,
  good: 0,
  fair: -1.5,
  poor: -4
};

const LIGHT_WEIGHTS: Record<TradeQuality, number> = {
  excellent: 1,
  good: 0,
  fair: -1.5,
  poor: -4
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sumQuality(
  rows: TradeRecordRow[],
  key: keyof Pick<
    TradeRecordRow,
    | "open_quality"
    | "close_quality"
    | "take_profit_quality"
    | "stop_loss_quality"
  >,
  weights: Record<TradeQuality, number>
): number {
  return rows.reduce(
    (total, row) => total + weights[row[key]],
    0
  );
}

function qualityCount(
  rows: TradeRecordRow[],
  key: keyof Pick<
    TradeRecordRow,
    | "open_quality"
    | "close_quality"
    | "take_profit_quality"
    | "stop_loss_quality"
  >,
  quality: TradeQuality
): number {
  return rows.filter((row) => row[key] === quality).length;
}

function qualitySummary(
  rows: TradeRecordRow[],
  key: keyof Pick<
    TradeRecordRow,
    | "open_quality"
    | "close_quality"
    | "take_profit_quality"
    | "stop_loss_quality"
  >
): string {
  return `${qualityCount(rows, key, "poor")} 差 · ${qualityCount(
    rows,
    key,
    "fair"
  )} 中`;
}

function statusFor(
  score: number | null
): MindsetScore["status"] {
  if (score === null) {
    return "unrated";
  }

  if (score >= 80) {
    return "healthy";
  }

  if (score >= 60) {
    return "tired";
  }

  if (score >= 40) {
    return "unstable";
  }

  return "stop";
}

function warningFor(score: number | null): string {
  if (score === null) {
    return "今日暂无交易，尚未评估心态";
  }

  if (score < 40) {
    return "当前心态不适合继续交易，建议停止开新仓，离开屏幕休息";
  }

  if (score < 60) {
    return "状态不稳，建议降低仓位或暂停交易";
  }

  if (score < 80) {
    return "轻度疲劳，注意休息和控制交易频率";
  }

  return "当前心态稳定，按计划执行";
}

export function buildMindsetScore(
  rows: TradeRecordRow[],
  date: string,
  reset: ResetInfo | null
): MindsetScore {
  if (rows.length === 0) {
    return {
      date,
      score: null,
      status: "unrated",
      trade_count: 0,
      pnl: 0,
      win_rate: 0,
      average_hold_minutes: 0,
      factors: [],
      warning: warningFor(null)
    };
  }

  const pnl = rows.reduce((total, row) => total + row.pnl, 0);
  const wins = rows.filter((row) => row.pnl > 0).length;
  const holdingMs = rows.reduce(
    (total, row) =>
      total + Math.max(0, row.close_time - row.open_time),
    0
  );
  const longHoldCount = rows.filter(
    (row) => row.close_time - row.open_time > 60 * 60 * 1000
  ).length;
  const longHoldPenalty = clamp(
    longHoldCount * -10,
    -30,
    0
  );
  const totalHoldPenalty =
    holdingMs > 4 * 60 * 60 * 1000 ? -10 : 0;
  const fatiguePenalty = reset
    ? 0
    : clamp(longHoldPenalty + totalHoldPenalty, -40, 0);

  let pnlPenalty = 0;

  if (pnl > 300) {
    pnlPenalty = -20;
  } else if (pnl < -100) {
    pnlPenalty = -30;
  }

  const openPenalty = clamp(
    sumQuality(rows, "open_quality", OPEN_WEIGHTS),
    -30,
    10
  );
  const closePenalty = clamp(
    sumQuality(rows, "close_quality", CLOSE_WEIGHTS),
    -12,
    6
  );
  const takeProfitPenalty = clamp(
    sumQuality(rows, "take_profit_quality", LIGHT_WEIGHTS),
    -10,
    5
  );
  const stopLossPenalty = clamp(
    sumQuality(rows, "stop_loss_quality", LIGHT_WEIGHTS),
    -10,
    5
  );

  const factors: MindsetFactor[] = [
    {
      key: "pnl",
      label: "当日收益",
      value: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
      penalty: pnlPenalty,
      detail:
        pnl > 300
          ? "收益超过 300，容易产生骄傲情绪"
          : pnl < -100
            ? "亏损超过 100，容易焦虑、自责"
            : "收益在可控范围内"
    },
    {
      key: "hold",
      label: "持仓时长",
      value: `${longHoldCount} 笔超过 1 小时`,
      penalty: fatiguePenalty,
      detail: reset
        ? "已通过冷静重置清除疲劳因子"
        : `共 ${longHoldCount} 笔持仓超过 1 小时${
            holdingMs > 4 * 60 * 60 * 1000
              ? "，当日总持仓超过 4 小时"
              : ""
          }`
    },
    {
      key: "open",
      label: "开仓时机",
      value: qualitySummary(rows, "open_quality"),
      penalty: openPenalty,
      detail:
        openPenalty < 0
          ? "开仓时机不佳，容易严重受挫"
          : "开仓时机整体可控"
    },
    {
      key: "close",
      label: "清仓时机",
      value: qualitySummary(rows, "close_quality"),
      penalty: closePenalty,
      detail:
        closePenalty < 0
          ? "清仓时机不佳，产生轻微挫败"
          : "清仓时机整体可控"
    },
    {
      key: "take_profit",
      label: "止盈评价",
      value: qualitySummary(rows, "take_profit_quality"),
      penalty: takeProfitPenalty,
      detail:
        takeProfitPenalty < 0
          ? "止盈执行不佳，产生轻微挫败"
          : "止盈执行整体可控"
    },
    {
      key: "stop_loss",
      label: "止损评价",
      value: qualitySummary(rows, "stop_loss_quality"),
      penalty: stopLossPenalty,
      detail:
        stopLossPenalty < 0
          ? "止损不够果断，产生轻微挫败"
          : "止损执行整体可控"
    }
  ];
  const score = clamp(
    100 + factors.reduce((total, factor) => total + factor.penalty, 0),
    0,
    100
  );

  return {
    date,
    score,
    status: statusFor(score),
    trade_count: rows.length,
    pnl,
    win_rate: wins / rows.length,
    average_hold_minutes:
      holdingMs / rows.length / (60 * 1000),
    factors,
    warning: warningFor(score)
  };
}
