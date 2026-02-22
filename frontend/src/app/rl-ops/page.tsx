"use client";

import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import OpsControlPanel from "../../components/rl-agent/OpsControlPanel";
import DataSourceRunsTable from "../../components/rl-agent/DataSourceRunsTable";
import BackfillForm from "../../components/rl-agent/BackfillForm";
import OnlineLearningPanel from "../../components/rl-agent/OnlineLearningPanel";
import { ALL_PAIRS } from "../../config/marketCatalog";
import {
  fetchAgentStatus,
  fetchOnlineLearningStatus,
  fetchOpsIngestionStatus,
  listRiskLimitSets,
  runOnlineLearningNow,
  type OnlineLearningStatus,
} from "../../services/rl_ops";
import { fetchDataSourceRuns, triggerDataSourceBackfill, type DataSourceRun, type DataSourceBackfillRequest } from "../../services/data_sources";
import type { AgentStatus, RiskLimitSet } from "../../services/rl_agent";
import type { IngestionStatus } from "../../services/ingestion";

function statusTone(status?: string) {
  if (status === "ok" || status === "running") return "status-ok";
  if (status === "pass") return "status-ok";
  if (status === "failed" || status === "stale" || status === "fail") return "status-bad";
  if (status === "paused") return "status-warn";
  return "status-muted";
}

export default function RlOpsPage() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [riskLimits, setRiskLimits] = useState<RiskLimitSet[]>([]);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [runs, setRuns] = useState<DataSourceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learningStatus, setLearningStatus] = useState<OnlineLearningStatus | null>(null);
  const [learningAction, setLearningAction] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agent, limits, ingestion, runHistory, learning] = await Promise.all([
        fetchAgentStatus(),
        listRiskLimitSets(),
        fetchOpsIngestionStatus(),
        fetchDataSourceRuns(),
        fetchOnlineLearningStatus(),
      ]);
      setAgentStatus(agent);
      setRiskLimits(limits);
      setIngestionStatus(ingestion);
      setRuns(runHistory);
      setLearningStatus(learning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ops dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBackfill = async (payload: DataSourceBackfillRequest) => {
    await triggerDataSourceBackfill(payload);
    await refresh();
  };

  const handleRunLearningNow = async () => {
    setLearningAction(true);
    setLearningError(null);
    try {
      await runOnlineLearningNow();
      await refresh();
    } catch (err) {
      setLearningError(err instanceof Error ? err.message : "Failed to run online learning.");
    } finally {
      setLearningAction(false);
    }
  };

  return (
    <Layout>
      <section className="hero">
        <h1>Ops Command Center</h1>
        <p>
          Coordinate ingestion, data quality, and trading controls from a single operational view.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Agent Status</span>
          <strong>{agentStatus?.currentRun?.status ?? "idle"}</strong>
          <div className="inline-muted">
            <span className={`status-pill ${statusTone(agentStatus?.promotionGateStatus)}`}>
              Gate {agentStatus?.promotionGateStatus ?? "unknown"}
            </span>
          </div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Mode</span>
          <strong>{agentStatus?.currentRun?.mode ?? "paper"}</strong>
          <div className="inline-muted">Pair {agentStatus?.currentRun?.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT"}</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Risk Sets</span>
          <strong>{riskLimits.length}</strong>
          <div className="inline-muted">Limits configured</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Ingestion</span>
          <strong>{ingestionStatus?.bingx.overall_status ?? "unknown"}</strong>
          <div className="inline-muted">
            TV {ingestionStatus?.tradingview.overall_status ?? "unknown"} · TG {ingestionStatus?.telegram.overall_status ?? "unknown"}
          </div>
        </div>
      </section>

      <section className="rl-grid">
        <OpsControlPanel agentStatus={agentStatus} riskLimits={riskLimits} ingestionStatus={ingestionStatus} onUpdated={refresh} />
        <DataSourceRunsTable runs={runs} />
      </section>

      <OnlineLearningPanel status={learningStatus} onRunNow={handleRunLearningNow} actionLoading={learningAction} error={learningError} />

      <BackfillForm onSubmit={handleBackfill} />

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Ops Routine</span>
            <h2>Daily checks</h2>
            <p>Standardize the loop for data freshness, drift checks, and evaluation cadence.</p>
          </div>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card" data-tone="slate">
            <strong>Data Hygiene</strong>
            <ul className="bullet-list">
              <li>Backfill missing candles before retraining.</li>
              <li>Verify source freshness thresholds per pair.</li>
              <li>Pause runs if any feed is stale.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="teal">
            <strong>Learning Loop</strong>
            <ul className="bullet-list">
              <li>Confirm learning windows align with cadence.</li>
              <li>Regenerate datasets after new feature sets.</li>
              <li>Queue evaluations for promotion gates.</li>
            </ul>
          </article>
        </div>
      </section>

      {loading && runs.length === 0 ? <div className="empty">Loading ops telemetry…</div> : null}
    </Layout>
  );
}
