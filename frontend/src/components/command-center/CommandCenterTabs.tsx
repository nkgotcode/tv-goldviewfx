"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import ControlSummaryPanel from "../ControlSummaryPanel";
import IngestionControls from "../IngestionControls";
import OpsAuditLog from "../OpsAuditLog";
import RecentSignalsPanel from "../RecentSignalsPanel";
import RecentTradesPanel from "../RecentTradesPanel";
import SentimentPnlChart from "../SentimentPnlChart";
import SourceEfficacyPanel from "../SourceEfficacyPanel";
import SourceGatingPanel from "../SourceGatingPanel";
import TopicTrendsPanel from "../TopicTrendsPanel";
import TradeControls from "../TradeControls";
import TradingAnalyticsPanel from "../TradingAnalyticsPanel";
import DriftAlertsPanel from "../rl-agent/DriftAlertsPanel";
import NautilusOptimizationPanel from "./NautilusOptimizationPanel";
import { fetchOnlineLearningStatus, type OnlineLearningStatus } from "../../services/rl_ops";
import {
  fetchDashboardSummary,
  fetchHealth,
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

export function CommandCenterTabs() {
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
    <div className="command-center">
      <nav className="command-center-nav" aria-label="Command Center sections">
        <ul className="command-center-nav-list">
          {TABS.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className={`command-center-nav-btn ${current === id ? "active" : ""}`}
                onClick={() => setTab(id)}
                aria-current={current === id ? "true" : undefined}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="command-center-content">
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

function TabPanel({
  title,
  description,
  headerBadges,
  children,
}: {
  title: string;
  description: string;
  headerBadges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="command-center-panel">
      <div className="action-row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 className="command-center-panel-title" style={{ margin: 0 }}>{title}</h2>
        {headerBadges ? <div className="action-row" style={{ gap: 6, flexWrap: "wrap" }}>{headerBadges}</div> : null}
      </div>
      <p className="text-muted">{description}</p>
      <div className="command-center-stack">{children}</div>
    </div>
  );
}

function BacktestsHeaderBadges() {
  const [status, setStatus] = useState<OnlineLearningStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOnlineLearningStatus({ limit: 1, includeHealth: true })
      .then((payload) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const health = status?.rlService?.health ?? null;
  const latestReport = status?.latestReport ?? null;
  return (
    <>
      <span className={`status-pill ${health?.status === "ok" ? "status-ok" : "status-warn"}`}>
        RL: {health?.status ?? "unknown"}
      </span>
      <span className={`status-pill ${health?.mlDependencies?.nautilus_trader ? "status-ok" : "status-warn"}`}>
        Nautilus: {health?.mlDependencies?.nautilus_trader ? "ready" : "missing"}
      </span>
      <span className={`status-pill ${latestReport?.backtestRunId ? "status-ok" : "status-warn"}`}>
        Run: {latestReport?.backtestRunId ? "recorded" : "none"}
      </span>
    </>
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
      <TabPanel title="Overview" description="System posture and operational summary.">
        <p>Loading system health and jobs…</p>
      </TabPanel>
    );
  }

  if (error) {
    return (
      <TabPanel title="Overview" description="System posture and operational summary.">
        <p className="text-muted">Error loading overview: {error}</p>
      </TabPanel>
    );
  }

  const openTrades = trades?.filter((t) => t.status !== "closed" && t.status !== "cancelled") ?? [];
  const recentLearning = learning?.items?.slice(0, 5) ?? [];

  return (
    <TabPanel
      title="Overview"
      description="Real-time pulse of data, learning, and execution coverage."
    >
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
            <li>
              Last sync: {summary?.last_sync_status ?? "—"}{" "}
              {summary?.last_sync_at ? `(${summary.last_sync_at})` : ""}
            </li>
          </ul>
        </section>
        <section className="overview-card">
          <h3>Ingestion status</h3>
          <p>Generated: {ingestion?.generated_at ?? "—"}</p>
          {ingestion?.sources?.length ? (
            <ul className="bullet-list">
              {ingestion.sources.slice(0, 5).map((src, i) => (
                <li key={i}>
                  {src.source_type ?? src.source_id ?? "source"}: {src.status ?? "—"}
                </li>
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
      <ControlSummaryPanel />
      <OpsAuditLog />
    </TabPanel>
  );
}

function DataLakeTab() {
  return (
    <TabPanel
      title="Data Lake"
      description="Operate ingestion cadence, source policies, and market context feeds."
    >
      <IngestionControls />
      <SourceGatingPanel />
      <TopicTrendsPanel />
    </TabPanel>
  );
}

function BacktestsTab() {
  return (
    <TabPanel
      title="Backtests"
      description="Review performance structure and sentiment-linked trade quality."
      headerBadges={<BacktestsHeaderBadges />}
    >
      <NautilusOptimizationPanel />
      <TradingAnalyticsPanel />
      <SentimentPnlChart />
      <RecentSignalsPanel />
    </TabPanel>
  );
}

function RLTrainingTab() {
  return (
    <TabPanel
      title="RL Training"
      description="Monitor training-side drift risk and decision input quality."
    >
      <DriftAlertsPanel />
      <SourceEfficacyPanel />
      <RecentSignalsPanel />
    </TabPanel>
  );
}

function ModelRegistryTab() {
  return (
    <TabPanel
      title="Model Registry"
      description="Use governance gates and drift telemetry before any promotion."
    >
      <ControlSummaryPanel />
      <DriftAlertsPanel />
    </TabPanel>
  );
}

function PaperTradingTab() {
  return (
    <TabPanel
      title="Paper Trading"
      description="Validate behavior in sandbox with controls and latest fills."
    >
      <TradeControls />
      <RecentTradesPanel />
      <TradingAnalyticsPanel />
    </TabPanel>
  );
}

function LiveTradingTab() {
  return (
    <TabPanel
      title="Live Trading"
      description="Operate live execution guardrails and inspect current outcomes."
    >
      <TradeControls />
      <RecentTradesPanel />
      <OpsAuditLog scope="trading" />
    </TabPanel>
  );
}

function RiskControlsTab() {
  return (
    <TabPanel
      title="Risk & Controls"
      description="Enforce policy thresholds, source gates, and drift interventions."
    >
      <ControlSummaryPanel />
      <SourceGatingPanel />
      <DriftAlertsPanel />
    </TabPanel>
  );
}

function LogsAlertsTab() {
  return (
    <TabPanel
      title="Logs & Alerts"
      description="Track operator actions and anomaly indicators across the stack."
    >
      <OpsAuditLog />
      <SourceEfficacyPanel />
      <TopicTrendsPanel />
    </TabPanel>
  );
}

function SettingsTab() {
  return (
    <TabPanel
      title="Settings"
      description="Manage ingestion/runtime defaults and execution policy controls."
    >
      <IngestionControls />
      <TradeControls />
    </TabPanel>
  );
}
