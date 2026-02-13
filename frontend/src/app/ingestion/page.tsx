"use client";

import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import IngestionSummaryCards from "../../components/ingestion/IngestionSummaryCards";
import IngestionSourcesTable from "../../components/ingestion/IngestionSourcesTable";
import BingxFeedTable from "../../components/ingestion/BingxFeedTable";
import IngestionControlPanel from "../../components/ingestion/IngestionControlPanel";
import { fetchIngestionStatus, type IngestionStatus } from "../../services/ingestion";

function statusTone(status: string | undefined) {
  if (status === "ok") return "status-ok";
  if (status === "running") return "status-warn";
  if (status === "stale") return "status-warn";
  if (status === "failed") return "status-bad";
  return "status-muted";
}

export default function IngestionPage() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIngestionStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ingestion status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Layout>
      <section className="hero">
        <h1>Ingestion Command</h1>
        <p>
          Monitor ingestion health for TradingView, Telegram, and BingX market feeds. Trigger syncs,
          backfills, and refresh cycles without leaving the operator console.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      {status ? (
        <section className="summary-grid">
          <div className="summary-card" data-tone="ember">
            <span>TradingView</span>
            <strong>{status.tradingview.sources.length}</strong>
            <div className="inline-muted">
              <span className={`status-pill ${statusTone(status.tradingview.overall_status)}`}>
                {status.tradingview.overall_status}
              </span>
            </div>
          </div>
          <div className="summary-card" data-tone="teal">
            <span>Telegram</span>
            <strong>{status.telegram.sources.length}</strong>
            <div className="inline-muted">
              <span className={`status-pill ${statusTone(status.telegram.overall_status)}`}>
                {status.telegram.overall_status}
              </span>
            </div>
          </div>
          <div className="summary-card" data-tone="slate">
            <span>BingX Pairs</span>
            <strong>{status.bingx.pairs.length}</strong>
            <div className="inline-muted">
              <span className={`status-pill ${statusTone(status.bingx.overall_status)}`}>
                {status.bingx.overall_status}
              </span>
            </div>
          </div>
          <div className="summary-card" data-tone="clay">
            <span>Generated</span>
            <strong>{new Date(status.generated_at).toLocaleString()}</strong>
            <div className="inline-muted">Snapshot timestamp</div>
          </div>
        </section>
      ) : null}

      {status ? <IngestionSummaryCards status={status} /> : null}

      <section className="rl-grid">
        <IngestionControlPanel status={status} onUpdated={refresh} />
        <IngestionSourcesTable
          title="TradingView Sources"
          description="Latest sync results and identifiers for TradingView profiles."
          sources={status?.tradingview.sources ?? []}
        />
      </section>

      <IngestionSourcesTable
        title="Telegram Sources"
        description="Channel ingestion status for Telegram feeds."
        sources={status?.telegram.sources ?? []}
      />

      <BingxFeedTable pairs={status?.bingx.pairs ?? []} />

      <section className="table-card">
        <h3>Cadence Notes</h3>
        <p>Keep ingestion aligned to the smallest candle interval to protect training freshness.</p>
        <div className="panel-grid">
          <div className="panel">
            <h5>TradingView</h5>
            <div className="inline-muted">Default sync interval 60m unless overridden.</div>
          </div>
          <div className="panel">
            <h5>Telegram</h5>
            <div className="inline-muted">Auto-ingest runs when scheduler + sources are active.</div>
          </div>
          <div className="panel">
            <h5>BingX Market</h5>
            <div className="inline-muted">Use 1m cadence with multi-interval backfills.</div>
          </div>
        </div>
      </section>

      {loading && !status ? <div className="empty">Loading ingestion status…</div> : null}
    </Layout>
  );
}
