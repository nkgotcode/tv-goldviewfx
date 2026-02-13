"use client";

import type { OnlineLearningStatus, OnlineLearningUpdate } from "../../services/rl_ops";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function statusTone(status?: string | null) {
  if (!status) return "status-muted";
  if (status === "pass" || status === "succeeded") return "status-ok";
  if (status === "fail" || status === "failed") return "status-bad";
  if (status === "running") return "status-warn";
  return "status-muted";
}

function renderUpdateRow(update: OnlineLearningUpdate) {
  const report = update.evaluationReport;
  return (
    <tr key={update.id}>
      <td>{formatTimestamp(update.startedAt)}</td>
      <td className="mono">{update.agentVersionId ? update.agentVersionId.slice(0, 8) : "—"}</td>
      <td>{formatTimestamp(update.windowStart)}</td>
      <td>{formatTimestamp(update.windowEnd)}</td>
      <td>
        <span className={`status-pill ${statusTone(update.status)}`}>{update.status}</span>
      </td>
      <td>
        {report ? (
          <span className={`status-pill ${statusTone(report.status)}`}>{report.status}</span>
        ) : (
          "—"
        )}
      </td>
      <td>{report ? formatNumber(report.winRate, 3) : "—"}</td>
      <td>{report ? formatNumber(report.netPnlAfterFees, 2) : "—"}</td>
      <td>{report ? report.tradeCount : "—"}</td>
    </tr>
  );
}

export default function OnlineLearningPanel({
  status,
  onRunNow,
  actionLoading,
  error,
}: {
  status: OnlineLearningStatus | null;
  onRunNow: () => Promise<void>;
  actionLoading: boolean;
  error?: string | null;
}) {
  const config = status?.config;
  const updates = status?.latestUpdates ?? [];
  const latestReport = status?.latestReport ?? null;

  return (
    <section className="table-card">
      <div className="section-head">
        <div>
          <span>Online Learning</span>
          <h3>Rolling window training loop</h3>
          <p>Monitor scheduled training/evaluation windows and trigger manual runs.</p>
        </div>
        <div className="action-row">
          <button type="button" onClick={onRunNow} disabled={actionLoading}>
            Run Now
          </button>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card" data-tone="teal">
          <span>Enabled</span>
          <strong>{config?.enabled ? "Yes" : "No"}</strong>
          <div className="inline-muted">Every {config?.intervalMin ?? "—"} min</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Train window</span>
          <strong>{config?.trainWindowMin ?? "—"} min</strong>
          <div className="inline-muted">Stride {config?.stride ?? "—"}</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Eval window</span>
          <strong>{config?.evalWindowMin ?? "—"} min</strong>
          <div className="inline-muted">Lag {config?.evalLagMin ?? "—"} min</div>
        </div>
        <div className="summary-card" data-tone="ember">
          <span>Decision threshold</span>
          <strong>{config?.decisionThreshold ?? "—"}</strong>
          <div className="inline-muted">Auto roll {config?.autoRollForward ? "on" : "off"}</div>
        </div>
      </div>

      <div className="inline-muted">
        Pair {config?.pair ?? "Gold-USDT"} · Window size {config?.windowSize ?? "—"} · Timesteps{" "}
        {config?.timesteps ?? "—"} · RL service {status?.rlService?.mock ? "mock" : "live"}
      </div>

      <div>
        <h5>Latest evaluation</h5>
        {latestReport ? (
          <div className="summary-grid">
            <div className="summary-card" data-tone="teal">
              <span>Status</span>
              <strong>{latestReport.status}</strong>
              <div className="inline-muted">{formatTimestamp(latestReport.createdAt)}</div>
            </div>
            <div className="summary-card" data-tone="slate">
              <span>Win rate</span>
              <strong>{formatNumber(latestReport.winRate, 3)}</strong>
              <div className="inline-muted">{latestReport.tradeCount} trades</div>
            </div>
            <div className="summary-card" data-tone="clay">
              <span>Net PnL</span>
              <strong>{formatNumber(latestReport.netPnlAfterFees, 2)}</strong>
              <div className="inline-muted">Drawdown {formatNumber(latestReport.maxDrawdown, 2)}</div>
            </div>
          </div>
        ) : (
          <div className="empty">No evaluation reports yet.</div>
        )}
      </div>

      {updates.length === 0 ? (
        <div className="empty">No learning updates recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Started</th>
              <th>Version</th>
              <th>Eval start</th>
              <th>Eval end</th>
              <th>Status</th>
              <th>Eval</th>
              <th>Win</th>
              <th>Net PnL</th>
              <th>Trades</th>
            </tr>
          </thead>
          <tbody>{updates.map(renderUpdateRow)}</tbody>
        </table>
      )}
    </section>
  );
}
