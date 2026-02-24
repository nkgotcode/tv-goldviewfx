"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  fetchHealth,
  fetchDashboardSummary,
  fetchOpsIngestionStatus,
  fetchOpsLearningHistory,
  fetchTrades,
  type DashboardSummary,
  type OpsIngestionStatus,
  type OpsLearningHistoryResponse,
  type Trade,
} from "../../services/api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "data-lake", label: "Data Lake" },
  { id: "backtests", label: "Backtests" },
  { id: "rl-training", label: "RL Training" },
  { id: "model-registry", label: "Model Registry" },
  { id: "paper-trading", label: "Paper Trading" },
  { id: "live-trading", label: "Live Trading" },
  { id: "risk-controls", label: "Risk & Controls" },
  { id: "logs-alerts", label: "Logs & Alerts" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function InstitutionalOpsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = (searchParams.get("tab") as TabId) || "overview";

  const setTab = useCallback(
    (tab: TabId) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", tab);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="institutional-ops">
      <nav className="institutional-ops-nav" aria-label="Institutional Ops sections">
        <ul className="institutional-ops-nav-list">
          {TABS.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className={`institutional-ops-nav-btn ${current === id ? "active" : ""}`}
                onClick={() => setTab(id)}
                aria-current={current === id ? "true" : undefined}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="institutional-ops-content">
        {current === "overview" && <OverviewTab />}
        {current === "data-lake" && <DataLakeTab />}
        {current === "backtests" && <BacktestsTab />}
        {current === "rl-training" && <RLTrainingTab />}
        {current === "model-registry" && <ModelRegistryTab />}
        {current === "paper-trading" && <PaperTradingTab />}
        {current === "live-trading" && <LiveTradingTab />}
        {current === "risk-controls" && <RiskControlsTab />}
        {current === "logs-alerts" && <LogsAlertsTab />}
        {current === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function TabPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="institutional-ops-panel">
      <h2 className="institutional-ops-panel-title">{title}</h2>
      {children}
    </div>
  );
}

function OverviewTab() {
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ingestion, setIngestion] = useState<OpsIngestionStatus | null>(null);
  const [learning, setLearning] = useState<OpsLearningHistoryResponse | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchHealth().catch((e) => (cancelled ? null : { status: `error: ${e.message}` })),
      fetchDashboardSummary().catch(() => null),
      fetchOpsIngestionStatus().catch(() => null),
      fetchOpsLearningHistory({ page: 1, page_size: 10 }).catch(() => null),
      fetchTrades().catch(() => null),
    ])
      .then(([h, s, i, l, t]) => {
        if (cancelled) return;
        setHealth(h ?? null);
        setSummary(s ?? null);
        setIngestion(i ?? null);
        setLearning(l ?? null);
        setTrades(Array.isArray(t) ? t : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <TabPanel title="Overview">
        <p>Loading system health and jobs…</p>
      </TabPanel>
    );
  }

  if (error) {
    return (
      <TabPanel title="Overview">
        <p className="text-muted">Error loading overview: {error}</p>
      </TabPanel>
    );
  }

  const openTrades = trades?.filter((t) => t.status !== "closed" && t.status !== "cancelled") ?? [];
  const recentLearning = learning?.items?.slice(0, 5) ?? [];

  return (
    <TabPanel title="Overview">
      <div className="overview-grid">
        <section className="overview-card">
          <h3>System health</h3>
          <p>{health?.status === "ok" ? "API OK" : health?.status ?? "—"}</p>
        </section>
        <section className="overview-card">
          <h3>Dashboard summary</h3>
          <ul className="bullet-list">
            <li>Ideas: {summary?.idea_count ?? "—"}</li>
            <li>Signals: {summary?.signal_count ?? "—"}</li>
            <li>Trades: {summary?.trade_count ?? "—"}</li>
            <li>Last sync: {summary?.last_sync_status ?? "—"} {summary?.last_sync_at ? `(${summary.last_sync_at})` : ""}</li>
          </ul>
        </section>
        <section className="overview-card">
          <h3>Ingestion status</h3>
          <p>Generated: {ingestion?.generated_at ?? "—"}</p>
          {ingestion?.sources?.length ? (
            <ul className="bullet-list">
              {ingestion.sources.slice(0, 5).map((src, i) => (
                <li key={i}>{src.source_type ?? src.source_id ?? "source"}: {src.status ?? "—"}</li>
              ))}
            </ul>
          ) : (
            <p>No sources</p>
          )}
        </section>
        <section className="overview-card">
          <h3>Recent learning runs</h3>
          {recentLearning.length === 0 ? (
            <p>No recent runs</p>
          ) : (
            <ul className="bullet-list">
              {recentLearning.map((item) => (
                <li key={item.id}>
                  {item.pair ?? "—"} | {item.status ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="overview-card">
          <h3>Open positions / recent trades</h3>
          {openTrades.length === 0 && (!trades || trades.length === 0) ? (
            <p>No open positions or trades</p>
          ) : openTrades.length > 0 ? (
            <ul className="bullet-list">
              {openTrades.slice(0, 10).map((t) => (
                <li key={t.id}>
                  {t.instrument} {t.side} {t.quantity} — {t.status}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="bullet-list">
              {(trades ?? []).slice(0, 5).map((t) => (
                <li key={t.id}>
                  {t.instrument} {t.side} {t.quantity} — {t.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TabPanel>
  );
}

function DataLakeTab() {
  return (
    <TabPanel title="Data Lake">
      <p>Choose venues/instruments and date ranges; start/stop backfills; data coverage heatmap and missing day detection; trigger gap-fill; rate-limit status and ingestion error drilldowns.</p>
    </TabPanel>
  );
}

function BacktestsTab() {
  return (
    <TabPanel title="Backtests">
      <p>Select dataset version and strategy config; run backtest or grid search; compare runs side-by-side; export report bundle.</p>
    </TabPanel>
  );
}

function RLTrainingTab() {
  return (
    <TabPanel title="RL Training">
      <p>Choose env/feature version; train/resume from checkpoint; view live training curves; run evaluation suite; register model to staging.</p>
    </TabPanel>
  );
}

function ModelRegistryTab() {
  return (
    <TabPanel title="Model Registry">
      <p>Model artifact path, training data hash, feature version, hyperparameters, evaluation report bundle. Promotion rules: +5% net return, drawdown gate, sanity checks.</p>
    </TabPanel>
  );
}

function PaperTradingTab() {
  return (
    <TabPanel title="Paper Trading">
      <p>Nautilus sandbox and venue testnets. Deploy model to sandbox; view real-time telemetry.</p>
    </TabPanel>
  );
}

function LiveTradingTab() {
  return (
    <TabPanel title="Live Trading">
      <p>Deploy model to live; real-time telemetry; risk override controls (admin); kill switch + flatten; optional manual order tool.</p>
    </TabPanel>
  );
}

function RiskControlsTab() {
  return (
    <TabPanel title="Risk & Controls">
      <p>Max leverage 3x; max position notional 10% equity; max total exposure 30%; daily loss limit 2%; max drawdown 5%; kill switch.</p>
    </TabPanel>
  );
}

function LogsAlertsTab() {
  return (
    <TabPanel title="Logs & Alerts">
      <p>Prometheus metrics, Grafana dashboards; optional Loki for logs; Alertmanager for notifications.</p>
    </TabPanel>
  );
}

function SettingsTab() {
  return (
    <TabPanel title="Settings">
      <p>Global runtime configuration and policy state.</p>
    </TabPanel>
  );
}
