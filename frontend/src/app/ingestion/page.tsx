"use client";

import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import IngestionSummaryCards from "../../components/ingestion/IngestionSummaryCards";
import IngestionSourcesTable from "../../components/ingestion/IngestionSourcesTable";
import BingxFeedTable from "../../components/ingestion/BingxFeedTable";
import IngestionControlPanel from "../../components/ingestion/IngestionControlPanel";
import { fetchIngestionStatus, type IngestionStatus } from "../../services/ingestion";

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

      {status ? <BingxFeedTable pairs={status.bingx.pairs} /> : null}

      {loading && !status ? <div className="empty">Loading ingestion status…</div> : null}
    </Layout>
  );
}
