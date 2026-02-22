"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import EvaluationReportPanel from "../../components/rl-agent/EvaluationReportPanel";
import { listAgentVersions, type AgentVersion } from "../../services/rl_agent";
import { listEvaluationReports, runEvaluation, type EvaluationReport } from "../../services/rl_evaluations";

const ALL_PAIRS_OPTION = "__all_pairs__";

type EvaluationReportWithMeta = EvaluationReport & {
  dataset_hash?: string | null;
  artifact_uri?: string | null;
  backtest_run_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ExtendedEvaluationRequest = {
  pair: string;
  periodStart: string;
  periodEnd: string;
  agentVersionId?: string;
  datasetVersionId?: string;
  featureSetVersionId?: string;
  decisionThreshold?: number;
  windowSize?: number;
  stride?: number;
  walkForward?: boolean;
};

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(start: string, end: string) {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "—";
  const totalMinutes = Math.round((to - from) / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractDataFields(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const candidates: unknown[] = [
    metadata.feature_columns,
    metadata.featureColumns,
    metadata.data_fields,
    metadata.dataFields,
    metadata.feature_names,
    metadata.featureNames,
    metadata.dataset_features,
    metadata.datasetFeatures,
  ];
  const fields = new Set<string>();
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === "string" && item.trim()) {
        fields.add(item.trim());
        continue;
      }
      const record = asRecord(item);
      if (!record) continue;
      const nameLike = [record.name, record.field, record.feature, record.key];
      for (const value of nameLike) {
        if (typeof value === "string" && value.trim()) {
          fields.add(value.trim());
        }
      }
    }
  }
  return [...fields];
}

function buildRunParams(report: EvaluationReportWithMeta | null): Record<string, unknown> {
  if (!report) return {};
  const params: Record<string, unknown> = {};
  params.agentVersionId = report.agent_version_id;
  params.pair = report.pair;
  params.periodStart = report.period_start;
  params.periodEnd = report.period_end;
  if (report.dataset_version_id) params.datasetVersionId = report.dataset_version_id;
  if (report.feature_set_version_id) params.featureSetVersionId = report.feature_set_version_id;
  if (report.dataset_hash) params.datasetHash = report.dataset_hash;
  if (report.backtest_run_id) params.backtestRunId = report.backtest_run_id;
  if (report.artifact_uri) params.artifactUri = report.artifact_uri;

  const metadata = asRecord(report.metadata);
  const metadataParams =
    asRecord(metadata?.parameters) ?? asRecord(metadata?.params) ?? asRecord(metadata?.request) ?? asRecord(metadata?.config);
  if (metadataParams) {
    for (const [key, value] of Object.entries(metadataParams)) {
      if (value === null || value === undefined) continue;
      params[key] = value;
    }
  }

  return params;
}

export default function RlEvaluationsPage() {
  const [reports, setReports] = useState<EvaluationReportWithMeta[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [pair, setPair] = useState<string>(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [versionId, setVersionId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(() => toInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toInputValue(new Date()));
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [featureSetVersionId, setFeatureSetVersionId] = useState("");
  const [decisionThreshold, setDecisionThreshold] = useState("");
  const [windowSize, setWindowSize] = useState("");
  const [stride, setStride] = useState("");
  const [walkForwardMode, setWalkForwardMode] = useState<"default" | "enabled" | "disabled">("default");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
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
      setReports(evaluationReports as EvaluationReportWithMeta[]);
      const firstVersion = agentVersions[0];
      if (!versionId && firstVersion) {
        setVersionId(firstVersion.id);
      }
      const firstReport = evaluationReports[0];
      if (!selectedReportId && firstReport) {
        setSelectedReportId(firstReport.id);
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

  const selectedMetadata = useMemo(() => asRecord(selectedReport?.metadata ?? null), [selectedReport]);
  const selectedRunParams = useMemo(() => buildRunParams(selectedReport), [selectedReport]);
  const selectedDataFields = useMemo(() => extractDataFields(selectedMetadata), [selectedMetadata]);

  const handleRunEvaluation = async () => {
    setActionLoading(true);
    setActionNote(null);
    setError(null);
    try {
      const periodStartIso = new Date(periodStart).toISOString();
      const periodEndIso = new Date(periodEnd).toISOString();
      if (new Date(periodEndIso).getTime() <= new Date(periodStartIso).getTime()) {
        throw new Error("Period end must be after period start.");
      }

      const targetPairs = pair === ALL_PAIRS_OPTION ? ALL_PAIRS : [pair];
      if (targetPairs.length === 0) {
        throw new Error("No pairs available for evaluation.");
      }

      for (const [index, targetPair] of targetPairs.entries()) {
        setActionNote(`Running ${index + 1}/${targetPairs.length}: ${targetPair}`);
        const payload: ExtendedEvaluationRequest = {
          pair: targetPair,
          periodStart: periodStartIso,
          periodEnd: periodEndIso,
        };
        if (versionId) payload.agentVersionId = versionId;
        if (datasetVersionId.trim()) payload.datasetVersionId = datasetVersionId.trim();
        if (featureSetVersionId.trim()) payload.featureSetVersionId = featureSetVersionId.trim();

        if (decisionThreshold.trim()) {
          const parsedThreshold = Number(decisionThreshold);
          if (!Number.isFinite(parsedThreshold)) {
            throw new Error("Decision threshold must be numeric.");
          }
          payload.decisionThreshold = parsedThreshold;
        }

        if (windowSize.trim()) {
          const parsedWindowSize = Number(windowSize);
          if (!Number.isFinite(parsedWindowSize) || parsedWindowSize <= 0) {
            throw new Error("Window size must be a positive number.");
          }
          payload.windowSize = Math.round(parsedWindowSize);
        }

        if (stride.trim()) {
          const parsedStride = Number(stride);
          if (!Number.isFinite(parsedStride) || parsedStride <= 0) {
            throw new Error("Stride must be a positive number.");
          }
          payload.stride = Math.round(parsedStride);
        }

        if (walkForwardMode !== "default") {
          payload.walkForward = walkForwardMode === "enabled";
        }

        await runEvaluation("gold-rl-agent", payload as never);
      }
      setActionNote(`Completed ${targetPairs.length} evaluation run(s).`);
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
      {actionNote ? <div className="empty">{actionNote}</div> : null}

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
          <p>
            Choose one pair or run all pairs, set backtest window and run parameters, then generate reports.
          </p>
          <div className="form-grid">
            <label>
              Pair
              <select value={pair} onChange={(event) => setPair(event.target.value)}>
                <option value={ALL_PAIRS_OPTION}>All pairs</option>
                {ALL_PAIRS.map((option) => (
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
            <label>
              Dataset Version (optional)
              <input
                type="text"
                value={datasetVersionId}
                placeholder="dataset version id"
                onChange={(event) => setDatasetVersionId(event.target.value)}
              />
            </label>
            <label>
              Feature Set Version (optional)
              <input
                type="text"
                value={featureSetVersionId}
                placeholder="feature set version id"
                onChange={(event) => setFeatureSetVersionId(event.target.value)}
              />
            </label>
            <label>
              Decision Threshold (optional)
              <input
                type="number"
                step="0.01"
                value={decisionThreshold}
                placeholder="0.50"
                onChange={(event) => setDecisionThreshold(event.target.value)}
              />
            </label>
            <label>
              Window Size (optional)
              <input
                type="number"
                min={1}
                value={windowSize}
                placeholder="30"
                onChange={(event) => setWindowSize(event.target.value)}
              />
            </label>
            <label>
              Stride (optional)
              <input
                type="number"
                min={1}
                value={stride}
                placeholder="1"
                onChange={(event) => setStride(event.target.value)}
              />
            </label>
            <label>
              Walk Forward
              <select value={walkForwardMode} onChange={(event) => setWalkForwardMode(event.target.value as typeof walkForwardMode)}>
                <option value="default">Use backend default</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button type="button" onClick={handleRunEvaluation} disabled={actionLoading || loading}>
              {actionLoading ? "Running…" : "Run Evaluation"}
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
        <p>Most recent evaluation runs for the selected agent version. Select any row to inspect full run details.</p>
        {reports.length === 0 ? (
          <div className="empty">No evaluation reports available.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Pair</th>
                <th>Period</th>
                <th>Duration</th>
                <th>Win Rate</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const active = report.id === selectedReport?.id;
                return (
                  <tr
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    style={{ cursor: "pointer", outline: active ? "1px solid rgba(94, 234, 212, 0.4)" : "none" }}
                  >
                    <td>{formatDate(report.created_at)}</td>
                    <td>
                      <span className="badge">{report.status}</span>
                    </td>
                    <td>{report.pair}</td>
                    <td>
                      {formatDate(report.period_start)} - {formatDate(report.period_end)}
                    </td>
                    <td>{formatDuration(report.period_start, report.period_end)}</td>
                    <td>{(report.win_rate * 100).toFixed(1)}%</td>
                    <td>{report.trade_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="table-card">
        <h3>Selected Run Metadata</h3>
        <p>Parameters, data fields, and backtest metadata for the selected history entry.</p>
        {!selectedReport ? (
          <div className="empty">Select an evaluation run from history.</div>
        ) : (
          <>
            <div className="detail-grid">
              <div>
                <span>Backtest Window</span>
                <strong>
                  {formatDate(selectedReport.period_start)} - {formatDate(selectedReport.period_end)}
                </strong>
              </div>
              <div>
                <span>Backtest Duration</span>
                <strong>{formatDuration(selectedReport.period_start, selectedReport.period_end)}</strong>
              </div>
              <div>
                <span>Dataset Version</span>
                <strong className="mono">{selectedReport.dataset_version_id ?? "—"}</strong>
              </div>
              <div>
                <span>Feature Set Version</span>
                <strong className="mono">{selectedReport.feature_set_version_id ?? "—"}</strong>
              </div>
              <div>
                <span>Backtest Run Id</span>
                <strong className="mono">{selectedReport.backtest_run_id ?? "—"}</strong>
              </div>
              <div>
                <span>Artifact</span>
                <strong className="mono">{selectedReport.artifact_uri ?? "—"}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Data Fields Used</span>
                <strong>{selectedDataFields.length > 0 ? selectedDataFields.join(", ") : "No data fields recorded in metadata."}</strong>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <span style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
                Run Parameters
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(2, 6, 23, 0.45)",
                  overflowX: "auto",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(selectedRunParams, null, 2)}
              </pre>
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
                Raw Metadata
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(2, 6, 23, 0.45)",
                  overflowX: "auto",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(selectedMetadata ?? {}, null, 2)}
              </pre>
            </div>
          </>
        )}
      </section>

      {loading && reports.length === 0 ? <div className="empty">Loading evaluation reports…</div> : null}
    </Layout>
  );
}
