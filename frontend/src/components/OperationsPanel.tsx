"use client";

import { useEffect, useMemo, useState } from "react";
import IngestionStatusTable from "./IngestionStatusTable";
import IngestionRunsTable from "./IngestionRunsTable";
import IngestionControls from "./IngestionControls";
import TradingAnalyticsPanel from "./TradingAnalyticsPanel";
import OpsAuditLog from "./OpsAuditLog";
import { fetchOpsIngestionRuns, fetchOpsIngestionStatus, type IngestionRun, type OpsIngestionStatusResponse } from "../services/ops";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OperationsPanel() {
  const [status, setStatus] = useState<OpsIngestionStatusResponse | null>(null);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const payload = await fetchOpsIngestionStatus();
        if (mounted) setStatus(payload);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load ingestion status.");
        }
      } finally {
        if (mounted) setLoadingStatus(false);
      }
    };
    loadStatus();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadRuns = async () => {
      try {
        const payload = await fetchOpsIngestionRuns();
        if (mounted) setRuns(payload.data ?? []);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load ingestion runs.");
        }
      } finally {
        if (mounted) setLoadingRuns(false);
      }
    };
    loadRuns();
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const sources = status?.sources ?? [];
    const totalSources = sources.length;
    const enabledSources = sources.filter((source) => source.enabled).length;
    const failedSources = sources.filter((source) => source.state === "failed").length;
    const runningSources = sources.filter((source) => source.state === "running").length;
    const pausedSources = sources.filter((source) => source.state === "paused").length;
    const nextRunAt = sources
      .map((source) => source.next_run_at)
      .filter(Boolean)
      .map((value) => new Date(value as string).getTime())
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => a - b)[0];
    const latestRunAt = runs
      .map((run) => new Date(run.started_at).getTime())
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => b - a)[0];
    return {
      totalSources,
      enabledSources,
      failedSources,
      runningSources,
      pausedSources,
      nextRunAt: typeof nextRunAt === "number" && Number.isFinite(nextRunAt) ? new Date(nextRunAt).toISOString() : null,
      latestRunAt:
        typeof latestRunAt === "number" && Number.isFinite(latestRunAt) ? new Date(latestRunAt).toISOString() : null,
    };
  }, [status, runs]);

  return (
    <section className="ops-panel">
      {error ? <div className="empty">{error}</div> : null}
      {status ? (
        <div className="summary-grid ops-summary">
          <div className="summary-card" data-tone="ember">
            <span>Sources</span>
            <strong>{summary.totalSources}</strong>
            <div className="inline-muted">{summary.enabledSources} enabled</div>
          </div>
          <div className="summary-card" data-tone="slate">
            <span>Running</span>
            <strong>{summary.runningSources}</strong>
            <div className="inline-muted">{summary.pausedSources} paused</div>
          </div>
          <div className="summary-card" data-tone="clay">
            <span>Failures</span>
            <strong>{summary.failedSources}</strong>
            <div className="inline-muted">Need attention</div>
          </div>
          <div className="summary-card" data-tone="teal">
            <span>Next Run</span>
            <strong>{formatDate(summary.nextRunAt)}</strong>
            <div className="inline-muted">Latest {formatDate(summary.latestRunAt)}</div>
          </div>
        </div>
      ) : null}
      <div className="ops-layout">
        <div className="ops-column">
          <IngestionStatusTable status={status} loading={loadingStatus} />
          <IngestionControls />
        </div>
        <div className="ops-column">
          <TradingAnalyticsPanel />
          <OpsAuditLog />
        </div>
      </div>
      <div className="ops-wide">
        <IngestionRunsTable runs={runs} loading={loadingRuns} />
      </div>
    </section>
  );
}
