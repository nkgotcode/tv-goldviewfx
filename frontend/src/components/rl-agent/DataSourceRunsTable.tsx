"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DataSourceRun } from "../../services/data_sources";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function tableTargetsForSource(sourceType: string) {
  switch (sourceType) {
    case "ideas":
      return "ideas, idea_revisions, idea_media";
    case "signals":
      return "telegram_posts, signals";
    case "bingx":
      return "bingx_* market-data tables (candles/trades/funding/open-interest/orderbook/mark-index/ticker)";
    default:
      return "source-specific ingestion tables";
  }
}

export default function DataSourceRunsTable({ runs }: { runs: DataSourceRun[] }) {
  const [selectedRun, setSelectedRun] = useState<DataSourceRun | null>(null);
  const latestRuns = useMemo(() => runs.slice(0, 50), [runs]);

  return (
    <section className="table-card">
      <h3>Ingestion Run History</h3>
      <p>
        Latest ingestion executions for TradingView, Telegram, and BingX. Each run is an operational audit record showing
        source, timing, and write impact to ingestion tables.
      </p>
      <div className="inline-muted">
        Showing latest {Math.min(latestRuns.length, 50)} runs in RL Ops.
        {" "}
        <Link className="text-link" href="/ops#ingestion-run-history">
          Open full ingestion run history -&gt;
        </Link>
      </div>
      {latestRuns.length === 0 ? (
        <div className="empty">No runs recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Pair</th>
              <th>Status</th>
              <th>New</th>
              <th>Updated</th>
              <th>Errors</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {latestRuns.map((run) => (
              <tr key={run.id}>
                <td>{formatTimestamp(run.startedAt)}</td>
                <td className="mono">{run.sourceType}</td>
                <td>{run.pair}</td>
                <td>
                  <span className="badge">{run.status}</span>
                </td>
                <td>{run.newCount}</td>
                <td>{run.updatedCount}</td>
                <td>{run.errorCount}</td>
                <td>
                  <button type="button" onClick={() => setSelectedRun(run)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <span>Started {formatTimestamp(selectedRun.startedAt)}</span>
              <span>Finished {formatTimestamp(selectedRun.finishedAt)}</span>
              <span>Status {selectedRun.status}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span>Source</span>
                <strong>{selectedRun.sourceType}</strong>
              </div>
              <div>
                <span>Pair</span>
                <strong>{selectedRun.pair}</strong>
              </div>
              <div>
                <span>New rows</span>
                <strong>{selectedRun.newCount}</strong>
              </div>
              <div>
                <span>Updated rows</span>
                <strong>{selectedRun.updatedCount}</strong>
              </div>
              <div>
                <span>Error rows</span>
                <strong>{selectedRun.errorCount}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Tables written</span>
                <strong>{tableTargetsForSource(selectedRun.sourceType)}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Error summary</span>
                <strong>{selectedRun.errorSummary ?? "No error summary recorded."}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
