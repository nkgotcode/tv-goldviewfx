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
  const totalSources = sources.length;
  const enabledSources = sources.filter((source) => source.enabled).length;
  const staleSources = sources.filter((source) => source.status === "stale").length;
  const unavailableSources = sources.filter((source) => source.status === "unavailable").length;

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

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Total Sources</span>
          <strong>{totalSources}</strong>
          <div className="inline-muted">{enabledSources} enabled</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Stale</span>
          <strong>{staleSources}</strong>
          <div className="inline-muted">Needs refresh</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Unavailable</span>
          <strong>{unavailableSources}</strong>
          <div className="inline-muted">Paused feeds</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Pairs</span>
          <strong>{PAIRS.length}</strong>
          <div className="inline-muted">Active instruments</div>
        </div>
      </section>

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

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Source Routine</span>
            <h2>Freshness guardrails</h2>
            <p>Keep ingestion feeds aligned with the RL agent's expected cadence.</p>
          </div>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card" data-tone="slate">
            <strong>Threshold Checks</strong>
            <ul className="bullet-list">
              <li>Align freshness thresholds to the smallest candle interval.</li>
              <li>Review stale sources before resuming live mode.</li>
              <li>Disable feeds during provider maintenance windows.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="teal">
            <strong>Recovery Flow</strong>
            <ul className="bullet-list">
              <li>Trigger backfills for missing candle windows.</li>
              <li>Confirm last seen timestamps update after refresh.</li>
              <li>Log escalations in the ops audit trail.</li>
            </ul>
          </article>
        </div>
      </section>

      {loading && sources.length === 0 ? <div className="empty">Loading data source status…</div> : null}
    </Layout>
  );
}
