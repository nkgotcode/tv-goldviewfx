import type { EvaluationReport } from "../../services/rl_evaluations";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export default function EvaluationReportPanel({ report }: { report?: EvaluationReport | null }) {
  if (!report) {
    return <div className="empty">Select an evaluation to see report details.</div>;
  }

  const exposureEntries = Object.entries(report.exposure_by_pair ?? {});

  return (
    <div className="detail-grid">
      <div>
        <span>Status</span>
        <strong>{report.status}</strong>
      </div>
      <div>
        <span>Pair</span>
        <strong>{report.pair}</strong>
      </div>
      <div>
        <span>Win Rate</span>
        <strong>{formatPercent(report.win_rate)}</strong>
      </div>
      <div>
        <span>Net PnL (fees)</span>
        <strong>{formatNumber(report.net_pnl_after_fees)}</strong>
      </div>
      <div>
        <span>Max Drawdown</span>
        <strong>{formatNumber(report.max_drawdown)}</strong>
      </div>
      <div>
        <span>Trades</span>
        <strong>{report.trade_count}</strong>
      </div>
      <div>
        <span>Period Start</span>
        <strong>{formatDate(report.period_start)}</strong>
      </div>
      <div>
        <span>Period End</span>
        <strong>{formatDate(report.period_end)}</strong>
      </div>
      <div>
        <span>Created</span>
        <strong>{formatDate(report.created_at)}</strong>
      </div>
      <div>
        <span>Version</span>
        <strong className="mono">{report.agent_version_id}</strong>
      </div>
      <div className="detail-grid-span">
        <span>Exposure By Pair</span>
        <strong>{exposureEntries.length ? exposureEntries.map(([pair, value]) => `${pair}: ${formatNumber(value)}`).join(" • ") : "—"}</strong>
      </div>
    </div>
  );
}
