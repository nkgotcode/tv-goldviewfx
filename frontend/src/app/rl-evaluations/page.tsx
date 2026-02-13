"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import EvaluationReportPanel from "../../components/rl-agent/EvaluationReportPanel";
import { listAgentVersions, type AgentVersion } from "../../services/rl_agent";
import { listEvaluationReports, runEvaluation, type EvaluationReport } from "../../services/rl_evaluations";

const PAIRS = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"] as const;

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

export default function RlEvaluationsPage() {
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [pair, setPair] = useState<(typeof PAIRS)[number]>("Gold-USDT");
  const [versionId, setVersionId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(() => toInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentVersions, evaluationReports] = await Promise.all([
        listAgentVersions(),
        listEvaluationReports("gold-rl-agent", versionId || undefined),
      ]);
      setVersions(agentVersions);
      setReports(evaluationReports);
      if (!versionId && agentVersions.length > 0) {
        setVersionId(agentVersions[0].id);
      }
      if (!selectedReportId && evaluationReports.length > 0) {
        setSelectedReportId(evaluationReports[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluation reports.");
    } finally {
      setLoading(false);
    }
  }, [selectedReportId, versionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );

  const handleRunEvaluation = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await runEvaluation("gold-rl-agent", {
        pair,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        agentVersionId: versionId || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run evaluation.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Layout>
      <section className="hero">
        <h1>Evaluation Command</h1>
        <p>
          Run historical evaluations before promoting a model to live trading. Review win rate,
          drawdown, and net PnL for each evaluation window.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Reports</span>
          <strong>{reports.length}</strong>
          <div className="inline-muted">Evaluation runs</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Selected</span>
          <strong>{selectedReport?.status ?? "—"}</strong>
          <div className="inline-muted">{selectedReport?.pair ?? "No report"}</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Win Rate</span>
          <strong>{selectedReport ? `${(selectedReport.win_rate * 100).toFixed(1)}%` : "—"}</strong>
          <div className="inline-muted">Latest evaluation</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Version</span>
          <strong>{versionId || "—"}</strong>
          <div className="inline-muted">Active selection</div>
        </div>
      </section>

      <section className="rl-grid">
        <div className="table-card">
          <h3>Run Evaluation</h3>
          <p>Choose a model version and evaluation window to generate a report.</p>
          <div className="form-grid">
            <label>
              Pair
              <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
                {PAIRS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Version
              <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name ?? version.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Period Start
              <input type="datetime-local" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </label>
            <label>
              Period End
              <input type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </label>
          </div>
          <div className="action-row">
            <button type="button" onClick={handleRunEvaluation} disabled={actionLoading || loading}>
              Run Evaluation
            </button>
          </div>
        </div>

        <div className="table-card">
          <h3>Evaluation Details</h3>
          <p>Inspect the selected report for risk, performance, and exposure breakdown.</p>
          <EvaluationReportPanel report={selectedReport} />
        </div>
      </section>

      <section className="table-card">
        <h3>Evaluation History</h3>
        <p>Most recent evaluation runs for the selected agent version.</p>
        {reports.length === 0 ? (
          <div className="empty">No evaluation reports available.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Pair</th>
                <th>Win Rate</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} onClick={() => setSelectedReportId(report.id)} style={{ cursor: "pointer" }}>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>
                    <span className="badge">{report.status}</span>
                  </td>
                  <td>{report.pair}</td>
                  <td>{(report.win_rate * 100).toFixed(1)}%</td>
                  <td>{report.trade_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Evaluation Routine</span>
            <h2>Promotion readiness</h2>
            <p>Standardize checks before enabling a model for live trading.</p>
          </div>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card" data-tone="slate">
            <strong>Risk Thresholds</strong>
            <ul className="bullet-list">
              <li>Compare max drawdown to the active risk set.</li>
              <li>Validate win rate and trade count consistency.</li>
              <li>Confirm net PnL after fees.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="teal">
            <strong>Backtest Integrity</strong>
            <ul className="bullet-list">
              <li>Verify candle coverage for the evaluation window.</li>
              <li>Ensure feature set version matches run config.</li>
              <li>Archive artifacts with version tags.</li>
            </ul>
          </article>
        </div>
      </section>

      {loading && reports.length === 0 ? <div className="empty">Loading evaluation reports…</div> : null}
    </Layout>
  );
}
