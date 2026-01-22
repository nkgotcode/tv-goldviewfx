"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import DataSourceStatusTable from "../../components/rl-agent/DataSourceStatusTable";
import { fetchDataSourceStatus, updateDataSourceConfig, type DataSourceStatus } from "../../services/data_sources";

const PAIRS = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"] as const;

export default function RlDataSourcesPage() {
  const [sources, setSources] = useState<DataSourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchDataSourceStatus();
      setSources(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sourcesByPair = useMemo(() => {
    return PAIRS.reduce<Record<string, DataSourceStatus[]>>((acc, pair) => {
      acc[pair] = sources.filter((source) => source.pair === pair);
      return acc;
    }, {});
  }, [sources]);

  const handleToggle = async (sourceType: string, enabled: boolean) => {
    setError(null);
    try {
      await updateDataSourceConfig({ sources: [{ sourceType, enabled }] });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update data source config.");
    }
  };

  return (
    <Layout>
      <section className="hero">
        <h1>Data Source Guardrails</h1>
        <p>
          Enable or disable market, idea, and signal feeds across supported pairs. Trading pauses
          automatically when required inputs become stale.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      <section className="rl-grid">
        {PAIRS.map((pair) => (
          <DataSourceStatusTable
            key={pair}
            pair={pair}
            sources={sourcesByPair[pair] ?? []}
            onToggle={handleToggle}
          />
        ))}
      </section>

      {loading && sources.length === 0 ? <div className="empty">Loading data source status…</div> : null}
    </Layout>
  );
}
