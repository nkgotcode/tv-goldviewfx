"use client";

import type { IngestionStatus } from "../../services/ingestion";

function formatStatus(value?: string | null) {
  if (!value) return "unavailable";
  return value.replace(/_/g, " ");
}

function formatTimestamp(value?: string | null) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString();
}

export default function IngestionSummaryCards({ status }: { status: IngestionStatus }) {
  return (
    <section className="summary-grid">
      <div className="summary-card">
        <span>TradingView</span>
        <strong>{formatStatus(status.tradingview.overall_status)}</strong>
        <div className="inline-muted">{formatTimestamp(status.tradingview.last_run?.finished_at ?? null)}</div>
      </div>
      <div className="summary-card">
        <span>Telegram</span>
        <strong>{formatStatus(status.telegram.overall_status)}</strong>
        <div className="inline-muted">{formatTimestamp(status.telegram.last_run?.finished_at ?? null)}</div>
      </div>
      <div className="summary-card">
        <span>BingX Market</span>
        <strong>{formatStatus(status.bingx.overall_status)}</strong>
        <div className="inline-muted">{formatTimestamp(status.bingx.last_updated_at)}</div>
      </div>
      <div className="summary-card">
        <span>Snapshot</span>
        <strong>{formatTimestamp(status.generated_at)}</strong>
        <div className="inline-muted">Last refresh</div>
      </div>
    </section>
  );
}
