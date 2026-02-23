"use client";

import { useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import type { IngestionRun } from "../services/ops";

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function tableTargetsForRun(run: IngestionRun) {
  if (run.source_type === "tradingview") {
    return "ideas, idea_revisions, idea_media";
  }
  if (run.source_type === "telegram") {
    return "telegram_posts, signals";
  }
  if (run.source_type === "bingx") {
    switch ((run.feed ?? "").toLowerCase()) {
      case "candles":
        return "bingx_candles";
      case "trades":
        return "bingx_trades";
      case "funding":
        return "bingx_funding_rates";
      case "open_interest":
        return "bingx_open_interest";
      case "orderbook":
        return "bingx_orderbook_snapshots";
      case "mark_index":
        return "bingx_mark_index_prices";
      case "ticker":
        return "bingx_tickers";
      default:
        return "bingx_* market-data tables";
    }
  }
  return "Source-specific ingestion tables";
}

function sourceTypeOptions(runs: IngestionRun[]) {
  const options = new Set<string>(["tradingview", "telegram", "bingx"]);
  for (const run of runs) {
    if (run.source_type) options.add(run.source_type);
  }
  return [...options];
}

export default function IngestionRunsTable({
  runs,
  loading,
  total,
  page,
  pageSize,
  search,
  sourceType,
  status,
  scanTruncated,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onSourceTypeChange,
  onStatusChange,
  onRefresh,
  onResetFilters,
}: {
  runs: IngestionRun[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  search: string;
  sourceType: string;
  status: string;
  scanTruncated: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSearchChange: (value: string) => void;
  onSourceTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
  onResetFilters: () => void;
}) {
  const [selectedRun, setSelectedRun] = useState<IngestionRun | null>(null);
  const runSourceOptions = useMemo(() => sourceTypeOptions(runs), [runs]);

  return (
    <div className="table-card" id="ingestion-run-history">
      <h3>Ingestion Run History</h3>
      <p>
        Use this history to audit pipeline health across TradingView, Telegram, and BingX. Each run records what source
        executed, what table family it targeted, and how many rows were inserted, updated, or failed.
      </p>

      <div className="learning-history-toolbar">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search run id, source, feed, trigger, status, error summary..."
        />
        <select value={sourceType} onChange={(event) => onSourceTypeChange(event.target.value)}>
          <option value="">All sources</option>
          {runSourceOptions.map((option) => (
            <option key={`runs-source-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="">All statuses</option>
          <option value="running">running</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
        </select>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" onClick={onResetFilters}>
          Reset filters
        </button>
      </div>

      {scanTruncated ? (
        <div className="empty">
          Search scope reached scan limit. Narrow filters for exact totals when run volume is high.
        </div>
      ) : null}

      {loading ? (
        <div className="empty">Loading ingestion runs…</div>
      ) : runs.length === 0 ? (
        <div className="empty">No ingestion runs recorded for the selected filters.</div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Feed</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Errors</th>
                  <th>Coverage</th>
                  <th>Missing Fields</th>
                  <th>Parse Conf</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.source_type}</td>
                    <td>{run.feed ?? "default"}</td>
                    <td>{run.status}</td>
                    <td>{formatDate(run.started_at)}</td>
                    <td>{formatDate(run.finished_at ?? null)}</td>
                    <td>{run.new_count}</td>
                    <td>{run.updated_count}</td>
                    <td>{run.error_count}</td>
                    <td>{run.coverage_pct ?? "—"}</td>
                    <td>{run.missing_fields_count ?? "—"}</td>
                    <td>{run.parse_confidence ?? "—"}</td>
                    <td>
                      <button type="button" onClick={() => setSelectedRun(run)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}

      {selectedRun ? (
        <div className="modal-backdrop" onClick={() => setSelectedRun(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h4>Ingestion run · {selectedRun.id.slice(0, 8)}</h4>
              <button type="button" onClick={() => setSelectedRun(null)}>
                Close
              </button>
            </div>
            <div className="modal-meta">
              <span>Started {formatDate(selectedRun.started_at)}</span>
              <span>Finished {formatDate(selectedRun.finished_at ?? null)}</span>
              <span>Status {selectedRun.status}</span>
              <span>Trigger {selectedRun.trigger}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span>Source type</span>
                <strong>{selectedRun.source_type}</strong>
              </div>
              <div>
                <span>Source id</span>
                <strong>{selectedRun.source_id ?? "n/a"}</strong>
              </div>
              <div>
                <span>Feed</span>
                <strong>{selectedRun.feed ?? "default"}</strong>
              </div>
              <div>
                <span>Target tables</span>
                <strong>{tableTargetsForRun(selectedRun)}</strong>
              </div>
              <div>
                <span>New rows</span>
                <strong>{selectedRun.new_count}</strong>
              </div>
              <div>
                <span>Updated rows</span>
                <strong>{selectedRun.updated_count}</strong>
              </div>
              <div>
                <span>Error rows</span>
                <strong>{selectedRun.error_count}</strong>
              </div>
              <div>
                <span>Coverage %</span>
                <strong>{selectedRun.coverage_pct ?? "n/a"}</strong>
              </div>
              <div>
                <span>Missing fields</span>
                <strong>{selectedRun.missing_fields_count ?? "n/a"}</strong>
              </div>
              <div>
                <span>Parse confidence</span>
                <strong>{selectedRun.parse_confidence ?? "n/a"}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Error summary</span>
                <strong>{selectedRun.error_summary ?? "No error summary recorded."}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Why this history exists</span>
                <strong>
                  Ingestion run history is the operational audit trail for data freshness, parsing quality, and table write
                  impact before model training, evaluation, and live decisions.
                </strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
