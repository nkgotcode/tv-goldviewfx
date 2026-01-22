"use client";

import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import OpsControlPanel from "../../components/rl-agent/OpsControlPanel";
import DataSourceRunsTable from "../../components/rl-agent/DataSourceRunsTable";
import BackfillForm from "../../components/rl-agent/BackfillForm";
import { fetchAgentStatus, fetchOpsIngestionStatus, listRiskLimitSets } from "../../services/rl_ops";
import { fetchDataSourceRuns, triggerDataSourceBackfill, type DataSourceRun, type DataSourceBackfillRequest } from "../../services/data_sources";
import type { AgentStatus, RiskLimitSet } from "../../services/rl_agent";
import type { IngestionStatus } from "../../services/ingestion";

export default function RlOpsPage() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [riskLimits, setRiskLimits] = useState<RiskLimitSet[]>([]);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [runs, setRuns] = useState<DataSourceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agent, limits, ingestion, runHistory] = await Promise.all([
        fetchAgentStatus(),
        listRiskLimitSets(),
        fetchOpsIngestionStatus(),
        fetchDataSourceRuns(),
      ]);
      setAgentStatus(agent);
      setRiskLimits(limits);
      setIngestionStatus(ingestion);
      setRuns(runHistory);
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

  return (
    <Layout>
      <section className="hero">
        <h1>Ops Command Center</h1>
        <p>
          Coordinate ingestion, data quality, and trading controls from a single operational view.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      <section className="rl-grid">
        <OpsControlPanel agentStatus={agentStatus} riskLimits={riskLimits} ingestionStatus={ingestionStatus} onUpdated={refresh} />
        <DataSourceRunsTable runs={runs} />
      </section>

      <BackfillForm onSubmit={handleBackfill} />

      {loading && runs.length === 0 ? <div className="empty">Loading ops telemetry…</div> : null}
    </Layout>
  );
}
