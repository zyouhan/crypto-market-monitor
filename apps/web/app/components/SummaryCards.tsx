import type { SymbolItem } from "../types";

interface SummaryCardsProps {
  symbols: SymbolItem[];
}

export function SummaryCards({ symbols }: SummaryCardsProps) {
  const enabledCount = symbols.filter(
    (item) => item.enabled === 1
  ).length;

  const bullCount = symbols.filter(
    (item) =>
      item.states.EMA_TREND?.status === "BULL_WAITING"
  ).length;

  const bearCount = symbols.filter(
    (item) =>
      item.states.EMA_TREND?.status === "BEAR_WAITING"
  ).length;

  return (
    <section className="summary-grid">
      <div className="summary-card">
        <div className="summary-label">监控标的</div>
        <div className="summary-value">{symbols.length}</div>
        <div className="summary-description">全部配置标的</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">运行中</div>
        <div className="summary-value">{enabledCount}</div>
        <div className="summary-description">当前启用的监控任务</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">看涨等待</div>
        <div
          className="summary-value"
          style={{ color: "var(--green)" }}
        >
          {bullCount}
        </div>
        <div className="summary-description">等待 KDJ 超卖做多</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">看跌等待</div>
        <div
          className="summary-value"
          style={{ color: "var(--red)" }}
        >
          {bearCount}
        </div>
        <div className="summary-description">等待 KDJ 超买做空</div>
      </div>
    </section>
  );
}
