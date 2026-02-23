"use client";

import { useEffect, useMemo, useState } from "react";
import IngestionStatusTable from "./IngestionStatusTable";
import IngestionRunsTable from "./IngestionRunsTable";
import IngestionControls from "./IngestionControls";
import TradingAnalyticsPanel from "./TradingAnalyticsPanel";
import OpsAuditLog from "./OpsAuditLog";
import { fetchOpsIngestionRuns, fetchOpsIngestionStatus, type IngestionRun, type OpsIngestionStatusResponse } from "../services/ops";

const RUN_HISTORY_FETCH_PAGE_SIZE = 250;
const RUN_HISTORY_FETCH_MAX_PAGES = 20;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OperationsPanel() {
  const [status, setStatus] = useState<OpsIngestionStatusResponse | null>(null);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [runsScanTruncated, setRunsScanTruncated] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [runsPageSize, setRunsPageSize] = useState(50);
  const [runsSearchInput, setRunsSearchInput] = useState("");
  const [runsSearch, setRunsSearch] = useState("");
  const [runsSourceFilter, setRunsSourceFilter] = useState("");
  const [runsStatusFilter, setRunsStatusFilter] = useState("");
  const [runsRefreshNonce, setRunsRefreshNonce] = useState(0);

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
      setLoadingRuns(true);
      try {
        const allRuns: IngestionRun[] = [];
        let page = 1;
        let truncated = false;
        while (page <= RUN_HISTORY_FETCH_MAX_PAGES) {
          const payload = await fetchOpsIngestionRuns({
            page,
            page_size: RUN_HISTORY_FETCH_PAGE_SIZE,
          });
          const chunk = payload.data ?? [];
          if (chunk.length === 0) break;
          allRuns.push(...chunk);
          if (chunk.length < RUN_HISTORY_FETCH_PAGE_SIZE) break;
          if (page === RUN_HISTORY_FETCH_MAX_PAGES) {
            truncated = true;
            break;
          }
          page += 1;
        }
        if (!mounted) return;
        const deduped = Array.from(new Map(allRuns.map((run) => [run.id, run])).values());
        setRuns(deduped);
        setRunsScanTruncated(truncated);
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
  }, [runsRefreshNonce]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setRunsSearch(runsSearchInput.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [runsSearchInput]);

  useEffect(() => {
    setRunsPage(1);
  }, [runsSearch, runsSourceFilter, runsStatusFilter, runsPageSize]);

  const filteredRuns = useMemo(() => {
    const search = runsSearch.toLowerCase();
    return runs.filter((run) => {
      if (runsSourceFilter && run.source_type !== runsSourceFilter) return false;
      if (runsStatusFilter && run.status !== runsStatusFilter) return false;
      if (!search) return true;
      const haystack = [
        run.id,
        run.source_type,
        run.source_id ?? "",
        run.feed ?? "",
        run.trigger,
        run.status,
        run.error_summary ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [runs, runsSearch, runsSourceFilter, runsStatusFilter]);

  const pagedRuns = useMemo(() => {
    const from = (runsPage - 1) * runsPageSize;
    const to = from + runsPageSize;
    return filteredRuns.slice(from, to);
  }, [filteredRuns, runsPage, runsPageSize]);

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
        <IngestionRunsTable
          runs={pagedRuns}
          loading={loadingRuns}
          total={filteredRuns.length}
          page={runsPage}
          pageSize={runsPageSize}
          search={runsSearchInput}
          sourceType={runsSourceFilter}
          status={runsStatusFilter}
          scanTruncated={runsScanTruncated}
          onPageChange={setRunsPage}
          onPageSizeChange={(nextPageSize) => {
            setRunsPageSize(nextPageSize);
            setRunsPage(1);
          }}
          onSearchChange={setRunsSearchInput}
          onSourceTypeChange={(value) => {
            setRunsSourceFilter(value);
          }}
          onStatusChange={(value) => {
            setRunsStatusFilter(value);
          }}
          onRefresh={() => setRunsRefreshNonce((value) => value + 1)}
          onResetFilters={() => {
            setRunsSearchInput("");
            setRunsSearch("");
            setRunsSourceFilter("");
            setRunsStatusFilter("");
            setRunsPage(1);
            setRunsPageSize(50);
          }}
        />
      </div>
    </section>
  );
}
