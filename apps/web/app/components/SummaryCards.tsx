import type { MonitorItem } from "../types";

interface SummaryCardsProps {
  monitors: MonitorItem[];
}

export function SummaryCards({ monitors }: SummaryCardsProps) {
  const enabled = monitors.filter(
    (monitor) => monitor.enabled === 1
  ).length;
  const errors = monitors.filter(
    (monitor) => Boolean(monitor.last_error)
  ).length;
  const pending = monitors.filter(
    (monitor) => monitor.pending
  ).length;

  return (
    <section className="summary-grid">
      <div className="summary-card">
        <div className="summary-label">监控项</div>
        <div className="summary-value">{monitors.length}</div>
        <div className="summary-description">全部组合监控项</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">运行中</div>
        <div className="summary-value">{enabled}</div>
        <div className="summary-description">当前启用的监控项</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">接口异常</div>
        <div
          className="summary-value"
          style={{ color: "var(--red)" }}
        >
          {errors}
        </div>
        <div className="summary-description">OKX / Binance 获取失败</div>
      </div>

      <div className="summary-card">
        <div className="summary-label">请求中</div>
        <div
          className="summary-value"
          style={{ color: "var(--blue)" }}
        >
          {pending}
        </div>
        <div className="summary-description">正在等待最新数据</div>
      </div>
    </section>
  );
}
