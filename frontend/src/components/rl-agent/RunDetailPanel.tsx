import type { AgentRun, AgentVersion, RiskLimitSet } from "../../services/rl_agent";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function RunDetailPanel({
  run,
  version,
  riskLimit,
}: {
  run?: AgentRun | null;
  version?: AgentVersion | null;
  riskLimit?: RiskLimitSet | null;
}) {
  if (!run) {
    return <div className="empty">No active run. Start a session to see telemetry.</div>;
  }

  return (
    <div className="detail-grid">
      <div>
        <span>Status</span>
        <strong>{run.status}</strong>
      </div>
      <div>
        <span>Mode</span>
        <strong>{run.mode}</strong>
      </div>
      <div>
        <span>Pair</span>
        <strong>{run.pair}</strong>
      </div>
      <div>
        <span>Learning</span>
        <strong>{run.learning_enabled ? "Enabled" : "Paused"}</strong>
      </div>
      <div>
        <span>Learning Window</span>
        <strong>{run.learning_window_minutes ? `${run.learning_window_minutes} min` : "—"}</strong>
      </div>
      <div>
        <span>Started</span>
        <strong>{formatDate(run.started_at)}</strong>
      </div>
      <div>
        <span>Stopped</span>
        <strong>{formatDate(run.stopped_at)}</strong>
      </div>
      <div>
        <span>Version</span>
        <strong>{version?.name ?? version?.id ?? "—"}</strong>
      </div>
      <div>
        <span>Risk Limits</span>
        <strong>{riskLimit?.name ?? run.risk_limit_set_id}</strong>
      </div>
    </div>
  );
}
