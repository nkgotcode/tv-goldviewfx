import type { DashboardSummary } from "../services/api";

export default function SignalPanel({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="card">
      <h3>System Summary</h3>
      <p>Ideas: {summary.idea_count}</p>
      <p>Signals: {summary.signal_count}</p>
      <p>Trades: {summary.trade_count}</p>
      <p>Last sync: {summary.last_sync_status ?? "unknown"}</p>
    </section>
  );
}
