"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
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
import {
  fetchOpsIngestionRuns,
  fetchOpsAudit,
  fetchTradingSummary,
  type OpsAuditEvent,
  type IngestionRun,
  type TradingSummary,
} from "../../services/ops";
import {
  fetchAgentStatus,
  listAgentRuns,
  listAgentVersions,
  listRiskLimitSets,
  startAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  stopAgentRun,
  createRiskLimitSet,
  type AgentRun,
  type AgentStatus,
  type AgentVersion,
  type RiskLimitSet,
} from "../../services/rl_agent";
import {
  fetchOnlineLearningStatus,
  fetchOnlineLearningHistory,
  runOnlineLearningNow,
  triggerBingxBackfill,
  triggerBingxRefresh,
  triggerTradingViewSync,
  type OnlineLearningStatus,
  type OnlineLearningUpdate,
} from "../../services/rl_ops";
import {
  fetchKillSwitch,
  fetchPromotionGates,
  updateKillSwitch,
  updatePromotionGates,
  listDriftAlerts,
  type KillSwitchState,
  type PromotionGateConfig,
  type DriftAlert,
} from "../../services/rl_governance";
import { listEvaluationReports, type EvaluationReport } from "../../services/rl_evaluations";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function fmtNum(v?: number | null, d = 2) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(d);
}

function statusPill(status?: string | null) {
  if (!status) return "status-muted";
  const s = status.toLowerCase();
  if (s === "ok" || s === "pass" || s === "succeeded" || s === "running" || s === "active") return "status-ok";
  if (s === "fail" || s === "failed" || s === "error" || s === "bad") return "status-bad";
  if (s === "warn" || s === "paused" || s === "degraded") return "status-warn";
  return "status-muted";
}

// ─── tab config ──────────────────────────────────────────────────────────────

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

// ─── root component ───────────────────────────────────────────────────────────

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
    [pathname, router, searchParams],
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

// ─── shared panel ─────────────────────────────────────────────────────────────

function TabPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="institutional-ops-panel" style={{ maxWidth: "100%" }}>
      <h2 className="institutional-ops-panel-title">{title}</h2>
      {children}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <p className="text-muted">{label}</p>;
}

function Err({ msg }: { msg: string }) {
  return <p className="text-muted">Error: {msg}</p>;
}

// ─── 1. OVERVIEW ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ingestion, setIngestion] = useState<OpsIngestionStatus | null>(null);
  const [learning, setLearning] = useState<OpsLearningHistoryResponse | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHealth().catch(() => null),
      fetchDashboardSummary().catch(() => null),
      fetchOpsIngestionStatus().catch(() => null),
      fetchOpsLearningHistory({ page: 1, page_size: 10 }).catch(() => null),
      fetchTrades().catch(() => null),
      fetchAgentStatus().catch(() => null),
    ]).then(([h, s, i, l, t, a]) => {
      if (cancelled) return;
      setHealth(h ?? null);
      setSummary(s ?? null);
      setIngestion(i ?? null);
      setLearning(l ?? null);
      setTrades(Array.isArray(t) ? t : null);
      setAgentStatus(a ?? null);
      setLoading(false);
    }).catch((e) => {
      if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <TabPanel title="Overview"><Loading label="Loading system overview…" /></TabPanel>;
  if (error) return <TabPanel title="Overview"><Err msg={error} /></TabPanel>;

  const openTrades = trades?.filter((t) => t.status !== "closed" && t.status !== "cancelled") ?? [];
  const recentLearning = learning?.items?.slice(0, 5) ?? [];
  const activeRun = agentStatus?.currentRun;

  return (
    <TabPanel title="Overview">
      <div className="overview-grid">
        <section className="overview-card">
          <h3>System health</h3>
          <span className={`status-pill ${statusPill(health?.status)}`}>{health?.status ?? "—"}</span>
          {agentStatus && (
            <ul className="bullet-list">
              <li>Agent run: {activeRun?.status ?? "idle"} ({activeRun?.mode ?? "—"})</li>
              <li>Kill switch: {agentStatus.killSwitchEnabled ? "ENABLED" : "off"}</li>
              <li>Promotion gate: {agentStatus.promotionGateStatus ?? "unknown"}</li>
              <li>Learning: {agentStatus.learningEnabled ? "enabled" : "disabled"}</li>
            </ul>
          )}
        </section>
        <section className="overview-card">
          <h3>Dashboard summary</h3>
          <ul className="bullet-list">
            <li>Ideas: {summary?.idea_count ?? "—"}</li>
            <li>Signals: {summary?.signal_count ?? "—"}</li>
            <li>Trades: {summary?.trade_count ?? "—"}</li>
            <li>Last sync: {summary?.last_sync_status ?? "—"}</li>
          </ul>
        </section>
        <section className="overview-card">
          <h3>Ingestion status</h3>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>As of {fmt(ingestion?.generated_at)}</p>
          {ingestion?.sources?.length ? (
            <ul className="bullet-list">
              {ingestion.sources.slice(0, 6).map((src, i) => (
                <li key={i}>
                  <span className={`status-pill ${statusPill(src.status)}`}>{src.status ?? "—"}</span>
                  {" "}{src.source_type ?? src.source_id ?? "source"}
                </li>
              ))}
            </ul>
          ) : <p>No sources</p>}
        </section>
        <section className="overview-card">
          <h3>Recent learning runs</h3>
          {recentLearning.length === 0 ? (
            <p>No recent runs</p>
          ) : (
            <ul className="bullet-list">
              {recentLearning.map((item) => (
                <li key={item.id}>
                  <span className={`status-pill ${statusPill(item.status)}`}>{item.status ?? "—"}</span>
                  {" "}{item.pair ?? "—"} · eval: {item.evaluationReport?.status ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="overview-card">
          <h3>Open positions</h3>
          {openTrades.length === 0 ? (
            <p>No open positions</p>
          ) : (
            <ul className="bullet-list">
              {openTrades.slice(0, 8).map((t) => (
                <li key={t.id}>
                  {t.instrument} {t.side} ×{t.quantity} — PnL {fmtNum(t.pnl)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="overview-card">
          <h3>Active model</h3>
          {agentStatus?.activeVersion ? (
            <ul className="bullet-list">
              <li>Name: {agentStatus.activeVersion.name}</li>
              <li>Status: {agentStatus.activeVersion.status}</li>
              <li>Promoted: {fmt(agentStatus.activeVersion.promoted_at)}</li>
              <li>Created: {fmt(agentStatus.activeVersion.created_at)}</li>
            </ul>
          ) : <p>No active model version</p>}
          <div style={{ marginTop: 8 }}>
            <Link href="/rl-evaluations" className="text-link">Open evaluation command →</Link>
          </div>
        </section>
      </div>
    </TabPanel>
  );
}

// ─── 2. DATA LAKE ─────────────────────────────────────────────────────────────

function DataLakeTab() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [pair, setPair] = useState(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFeed, setFilterFeed] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchOpsIngestionRuns({
        status: filterStatus || undefined,
        feed: filterFeed || undefined,
        page: 1,
        page_size: 40,
      });
      setRuns(resp.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ingestion runs.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterFeed]);

  useEffect(() => { load(); }, [load]);

  const doBackfill = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await triggerBingxBackfill({ pairs: [pair] });
      setActionMsg(`Backfill triggered for ${pair}.`);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Backfill failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const doRefresh = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await triggerBingxRefresh({ pairs: [pair] });
      setActionMsg(`Refresh triggered for ${pair}.`);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const doTVSync = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await triggerTradingViewSync({ full_content: false, include_updates: false });
      setActionMsg("TradingView sync triggered.");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "TV sync failed.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <TabPanel title="Data Lake">
      <p className="text-muted">Manage BingX market-data backfills, TradingView syncs, and ingestion coverage. Monitor recent ingestion run history and error rates.</p>

      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Ingestion Actions</h3>
        <div className="form-grid">
          <label>
            Pair target
            <select value={pair} onChange={(e) => setPair(e.target.value)}>
              {ALL_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {actionMsg && <div className="empty" style={{ marginBottom: 8 }}>{actionMsg}</div>}
        <div className="action-row">
          <button type="button" onClick={doBackfill} disabled={actionLoading}>Backfill BingX</button>
          <button type="button" className="secondary" onClick={doRefresh} disabled={actionLoading}>Refresh BingX</button>
          <button type="button" className="secondary" onClick={doTVSync} disabled={actionLoading}>Sync TradingView</button>
        </div>
      </div>

      <div className="table-card">
        <h3>Ingestion Run History</h3>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>
            Status filter
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
            </select>
          </label>
          <label>
            Feed filter
            <input type="text" value={filterFeed} placeholder="e.g. candles" onChange={(e) => setFilterFeed(e.target.value)} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="button" className="secondary" onClick={load} disabled={loading}>Refresh</button>
          </div>
        </div>
        {error && <Err msg={error} />}
        {loading ? <Loading label="Loading ingestion runs…" /> : runs.length === 0 ? (
          <div className="empty">No ingestion runs found for selected filters.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Started</th>
                <th>Source</th>
                <th>Feed</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>New</th>
                <th>Updated</th>
                <th>Errors</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const dur = r.started_at && r.finished_at
                  ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={r.id}>
                    <td>{fmt(r.started_at)}</td>
                    <td>{r.source_type}{r.source_id ? ` / ${r.source_id}` : ""}</td>
                    <td>{r.feed ?? "—"}</td>
                    <td>{r.trigger}</td>
                    <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                    <td>{r.new_count}</td>
                    <td>{r.updated_count}</td>
                    <td style={{ color: r.error_count > 0 ? "var(--tone-clay)" : undefined }}>{r.error_count}</td>
                    <td>{dur != null ? `${dur}s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8 }}>
          <Link href="/ingestion" className="text-link">Full ingestion dashboard →</Link>
        </div>
      </div>
    </TabPanel>
  );
}

// ─── 3. BACKTESTS ────────────────────────────────────────────────────────────

function BacktestsTab() {
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initDone = useRef(false);

  const load = useCallback(async (vid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [vs, rs] = await Promise.all([
        listAgentVersions(),
        listEvaluationReports("gold-rl-agent", vid || undefined),
      ]);
      setVersions(vs);
      setReports(rs);
      if (!initDone.current) {
        initDone.current = true;
        const first = vs[0];
        if (first && !vid) setSelectedVersionId(first.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backtests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const passRate = reports.length > 0
    ? ((reports.filter((r) => r.status === "pass").length / reports.length) * 100).toFixed(0)
    : null;
  const avgWinRate = reports.length > 0
    ? (reports.reduce((s, r) => s + r.win_rate, 0) / reports.length * 100).toFixed(1)
    : null;
  const avgPnl = reports.length > 0
    ? (reports.reduce((s, r) => s + r.net_pnl_after_fees, 0) / reports.length).toFixed(2)
    : null;

  return (
    <TabPanel title="Backtests">
      <p className="text-muted">Historical Nautilus backtest runs attached to evaluation reports. Use the Evaluation Command page to run new backtests.</p>

      <div className="overview-grid" style={{ marginBottom: 16 }}>
        <section className="overview-card">
          <h3>Total runs</h3>
          <strong style={{ fontSize: "1.5rem" }}>{reports.length}</strong>
        </section>
        <section className="overview-card">
          <h3>Pass rate</h3>
          <strong style={{ fontSize: "1.5rem" }}>{passRate != null ? `${passRate}%` : "—"}</strong>
        </section>
        <section className="overview-card">
          <h3>Avg win rate</h3>
          <strong style={{ fontSize: "1.5rem" }}>{avgWinRate != null ? `${avgWinRate}%` : "—"}</strong>
        </section>
        <section className="overview-card">
          <h3>Avg net PnL</h3>
          <strong style={{ fontSize: "1.5rem" }}>{avgPnl ?? "—"}</strong>
        </section>
      </div>

      <div className="table-card">
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label>
            Model version
            <select value={selectedVersionId} onChange={(e) => { setSelectedVersionId(e.target.value); load(e.target.value); }}>
              <option value="">All versions</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.name ?? v.id}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="button" className="secondary" onClick={() => load(selectedVersionId)} disabled={loading}>Refresh</button>
          </div>
        </div>
        {error && <Err msg={error} />}
        {loading ? <Loading label="Loading backtest reports…" /> : reports.length === 0 ? (
          <div className="empty">No backtest reports found. <Link href="/rl-evaluations" className="text-link">Run one →</Link></div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Pair</th>
                <th>Period</th>
                <th>Win Rate</th>
                <th>Net PnL</th>
                <th>Max DD</th>
                <th>Trades</th>
                <th>Backtest ID</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.created_at)}</td>
                  <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                  <td>{r.pair}</td>
                  <td style={{ fontSize: 11 }}>
                    {fmt(r.period_start).slice(0, 16)} – {fmt(r.period_end).slice(0, 16)}
                  </td>
                  <td>{(r.win_rate * 100).toFixed(1)}%</td>
                  <td style={{ color: r.net_pnl_after_fees >= 0 ? "var(--tone-teal)" : "var(--tone-clay)" }}>
                    {fmtNum(r.net_pnl_after_fees)}
                  </td>
                  <td>{fmtNum(r.max_drawdown)}%</td>
                  <td>{r.trade_count}</td>
                  <td className="mono" style={{ fontSize: 10 }}>{r.backtest_run_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8 }}>
          <Link href="/rl-evaluations" className="text-link">Open evaluation command →</Link>
        </div>
      </div>
    </TabPanel>
  );
}

// ─── 4. RL TRAINING ──────────────────────────────────────────────────────────

function RLTrainingTab() {
  const [status, setStatus] = useState<OnlineLearningStatus | null>(null);
  const [history, setHistory] = useState<OnlineLearningUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([
        fetchOnlineLearningStatus(10),
        fetchOnlineLearningHistory({ page: 1, pageSize: 20 }),
      ]);
      setStatus(s);
      setHistory(h.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load RL training status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doRunNow = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      await runOnlineLearningNow();
      setActionMsg("Online learning run triggered.");
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed to trigger run.");
    } finally {
      setActionLoading(false);
    }
  };

  const cfg = status?.config;
  const rlHealth = status?.rlService?.health;
  const latestUpdate = status?.latestUpdates?.[0];

  return (
    <TabPanel title="RL Training">
      <p className="text-muted">Online learning status, cadence configuration, and run history. Train/resume from the latest checkpoint using the walk-forward evaluation workflow.</p>

      {error && <Err msg={error} />}

      {actionMsg && <div className="empty" style={{ marginBottom: 12 }}>{actionMsg}</div>}

      <div className="overview-grid" style={{ marginBottom: 16 }}>
        <section className="overview-card">
          <h3>Learning</h3>
          <span className={`status-pill ${cfg?.enabled ? "status-ok" : "status-muted"}`}>{cfg?.enabled ? "enabled" : "disabled"}</span>
          <ul className="bullet-list">
            <li>Cadence: every {cfg?.intervalMin ?? "—"} min</li>
            <li>Candle: {cfg?.interval ?? "—"}</li>
            <li>Pairs: {cfg?.pairs?.join(", ") ?? cfg?.pair ?? "—"}</li>
          </ul>
        </section>
        <section className="overview-card">
          <h3>RL Service</h3>
          <span className={`status-pill ${statusPill(rlHealth?.status)}`}>{rlHealth?.status ?? "unknown"}</span>
          <ul className="bullet-list">
            <li>Strict backtest: {rlHealth?.strictBacktest ? "yes" : "no"}</li>
            <li>Model inference: {rlHealth?.strictModelInference ? "yes" : "no"}</li>
            <li>Checked: {fmt(rlHealth?.checkedAt)}</li>
          </ul>
        </section>
        <section className="overview-card">
          <h3>Latest run</h3>
          {latestUpdate ? (
            <ul className="bullet-list">
              <li>Status: <span className={`status-pill ${statusPill(latestUpdate.status)}`}>{latestUpdate.status}</span></li>
              <li>Pair: {latestUpdate.pair ?? "—"}</li>
              <li>Promoted: {latestUpdate.promoted ? "yes" : "no"}</li>
              <li>Window: {fmt(latestUpdate.windowStart)} – {fmt(latestUpdate.windowEnd)}</li>
            </ul>
          ) : <p>No recent runs</p>}
        </section>
        <section className="overview-card">
          <h3>Promotion gates</h3>
          {cfg ? (
            <ul className="bullet-list">
              <li>Min win rate: {fmtNum(cfg.minWinRate * 100, 0)}%</li>
              <li>Min net PnL: {fmtNum(cfg.minNetPnl)}</li>
              <li>Max drawdown: {fmtNum(cfg.maxDrawdown * 100, 0)}%</li>
              <li>Min trades: {cfg.minTradeCount}</li>
            </ul>
          ) : <p>—</p>}
        </section>
      </div>

      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Run controls</h3>
        <div className="action-row">
          <button type="button" onClick={doRunNow} disabled={actionLoading || loading}>
            {actionLoading ? "Triggering…" : "Run learning now"}
          </button>
          <button type="button" className="secondary" onClick={load} disabled={loading}>Refresh</button>
          <Link href="/rl-agent" className="text-link">Full RL agent page →</Link>
        </div>
      </div>

      <div className="table-card">
        <h3>Run history</h3>
        {loading ? <Loading label="Loading history…" /> : history.length === 0 ? (
          <div className="empty">No learning runs recorded yet.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Started</th>
                <th>Completed</th>
                <th>Status</th>
                <th>Pair</th>
                <th>Promoted</th>
                <th>Win Rate</th>
                <th>PnL</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((u) => {
                const eval_ = u.evaluationReport;
                return (
                  <tr key={u.id}>
                    <td>{fmt(u.startedAt)}</td>
                    <td>{fmt(u.completedAt)}</td>
                    <td><span className={`status-pill ${statusPill(u.status)}`}>{u.status}</span></td>
                    <td>{u.pair ?? "—"}</td>
                    <td>{u.promoted ? "✓ yes" : "no"}</td>
                    <td>{eval_ ? `${(eval_.winRate * 100).toFixed(1)}%` : "—"}</td>
                    <td style={{ color: (eval_?.netPnlAfterFees ?? 0) >= 0 ? "var(--tone-teal)" : "var(--tone-clay)" }}>
                      {eval_ ? fmtNum(eval_.netPnlAfterFees) : "—"}
                    </td>
                    <td style={{ fontSize: 11 }}>{u.decisionReasons?.slice(0, 1).join("") ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </TabPanel>
  );
}

// ─── 5. MODEL REGISTRY ───────────────────────────────────────────────────────

function ModelRegistryTab() {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [promotion, setPromotion] = useState<PromotionGateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vs, gates] = await Promise.all([
        listAgentVersions(),
        fetchPromotionGates().catch(() => null),
      ]);
      setVersions(vs);
      setPromotion(gates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <TabPanel title="Model Registry">
      <p className="text-muted">
        Versioned model artifacts, training lineage, and promotion gate configuration. Promotion requires +5% net return, max drawdown gate, and sanity checks across evaluation windows.
      </p>

      {error && <Err msg={error} />}

      {promotion && (
        <div className="table-card" style={{ marginBottom: 16 }}>
          <h3>Promotion gate policy</h3>
          <div className="detail-grid">
            <div><span>Promotion required</span><strong>{promotion.promotion_required ? "yes" : "no"}</strong></div>
            <div><span>Min trades</span><strong>{promotion.promotion_min_trades ?? "—"}</strong></div>
            <div><span>Min win rate</span><strong>{promotion.promotion_min_win_rate != null ? `${(promotion.promotion_min_win_rate * 100).toFixed(0)}%` : "—"}</strong></div>
            <div><span>Min net PnL</span><strong>{promotion.promotion_min_net_pnl ?? "—"}</strong></div>
            <div><span>Max drawdown</span><strong>{promotion.promotion_max_drawdown != null ? `${(promotion.promotion_max_drawdown * 100).toFixed(0)}%` : "—"}</strong></div>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="action-row" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Model versions</h3>
          <button type="button" className="secondary" onClick={load} disabled={loading}>Refresh</button>
        </div>
        {loading ? <Loading label="Loading model versions…" /> : versions.length === 0 ? (
          <div className="empty">No model versions registered yet.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Name / ID</th>
                <th>Status</th>
                <th>Created</th>
                <th>Promoted</th>
                <th>Artifact</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div>{v.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{v.id}</div>
                  </td>
                  <td><span className={`status-pill ${statusPill(v.status)}`}>{v.status}</span></td>
                  <td>{fmt(v.created_at)}</td>
                  <td>{fmt(v.promoted_at)}</td>
                  <td className="mono" style={{ fontSize: 10 }}>{v.artifact_uri ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8 }}>
          <Link href="/rl-evaluations" className="text-link">Run evaluation to register new version →</Link>
        </div>
      </div>
    </TabPanel>
  );
}

// ─── 6. PAPER TRADING ────────────────────────────────────────────────────────

function TradingModeTab({ mode }: { mode: "paper" | "live" }) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [riskLimits, setRiskLimits] = useState<RiskLimitSet[]>([]);
  const [tradingSummary, setTradingSummary] = useState<TradingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [pair, setPair] = useState(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [riskLimitId, setRiskLimitId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, r, rl, ts] = await Promise.all([
        fetchAgentStatus(),
        listAgentRuns(),
        listRiskLimitSets(),
        fetchTradingSummary().catch(() => null),
      ]);
      setAgentStatus(a);
      setRuns(r.filter((run) => run.mode === mode));
      setRiskLimits(rl);
      setTradingSummary(ts);
      if (!riskLimitId && rl[0]) setRiskLimitId(rl[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trading status.");
    } finally {
      setLoading(false);
    }
  }, [mode, riskLimitId]);

  useEffect(() => { load(); }, [load]);

  const activeRun = agentStatus?.currentRun;
  const isActive = activeRun?.status === "running" && activeRun?.mode === mode;

  const doStart = async () => {
    if (!riskLimitId) { setActionMsg("Select a risk limit set first."); return; }
    setActionLoading(true);
    setActionMsg(null);
    try {
      await startAgentRun("gold-rl-agent", { mode, pair, riskLimitSetId: riskLimitId, learningEnabled: mode === "paper" });
      setActionMsg(`${mode} run started for ${pair}.`);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed to start run.");
    } finally {
      setActionLoading(false);
    }
  };

  const doPause = async () => {
    setActionLoading(true);
    try {
      await pauseAgentRun();
      setActionMsg("Run paused.");
      await load();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : "Pause failed."); }
    finally { setActionLoading(false); }
  };

  const doResume = async () => {
    setActionLoading(true);
    try {
      await resumeAgentRun();
      setActionMsg("Run resumed.");
      await load();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : "Resume failed."); }
    finally { setActionLoading(false); }
  };

  const doStop = async () => {
    setActionLoading(true);
    try {
      await stopAgentRun();
      setActionMsg("Run stopped.");
      await load();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : "Stop failed."); }
    finally { setActionLoading(false); }
  };

  const title = mode === "paper" ? "Paper Trading" : "Live Trading";

  return (
    <TabPanel title={title}>
      <p className="text-muted">
        {mode === "paper"
          ? "Deploy model to Nautilus sandbox. View real-time paper telemetry without risk capital."
          : "Deploy model to live trading on BingX. Max leverage 3×; daily loss limit 2%; kill switch auto-disables at 5% drawdown."}
      </p>

      {error && <Err msg={error} />}
      {actionMsg && <div className="empty" style={{ marginBottom: 12 }}>{actionMsg}</div>}

      <div className="overview-grid" style={{ marginBottom: 16 }}>
        <section className="overview-card">
          <h3>Current run</h3>
          <span className={`status-pill ${isActive ? "status-ok" : "status-muted"}`}>
            {activeRun?.mode === mode ? activeRun.status : "idle"}
          </span>
          {activeRun?.mode === mode && (
            <ul className="bullet-list">
              <li>Pair: {activeRun.pair}</li>
              <li>Started: {fmt(activeRun.started_at)}</li>
              <li>Learning: {activeRun.learning_enabled ? "on" : "off"}</li>
            </ul>
          )}
        </section>
        {tradingSummary && (
          <section className="overview-card">
            <h3>Trading summary</h3>
            <ul className="bullet-list">
              <li>Trades: {tradingSummary.trade_count} (filled {tradingSummary.filled_count})</li>
              <li>Win rate: {(tradingSummary.win_rate * 100).toFixed(1)}%</li>
              <li>Net PnL: {fmtNum(tradingSummary.net_pnl)}</li>
              <li>Max drawdown: {fmtNum(tradingSummary.max_drawdown)}%</li>
            </ul>
          </section>
        )}
        <section className="overview-card">
          <h3>Agent</h3>
          <ul className="bullet-list">
            <li>Active version: {agentStatus?.activeVersion?.name ?? "—"}</li>
            <li>Kill switch: {agentStatus?.killSwitchEnabled ? "ENABLED" : "off"}</li>
            <li>Promotion gate: {agentStatus?.promotionGateStatus ?? "—"}</li>
          </ul>
        </section>
      </div>

      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Run controls</h3>
        <div className="form-grid">
          <label>
            Pair
            <select value={pair} onChange={(e) => setPair(e.target.value)}>
              {ALL_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Risk limit set
            <select value={riskLimitId} onChange={(e) => setRiskLimitId(e.target.value)}>
              {riskLimits.map((rl) => <option key={rl.id} value={rl.id}>{rl.name}</option>)}
            </select>
          </label>
        </div>
        <div className="action-row">
          <button type="button" onClick={doStart} disabled={actionLoading || loading}>Start {mode}</button>
          <button type="button" className="secondary" onClick={doPause} disabled={actionLoading || activeRun?.status !== "running"}>Pause</button>
          <button type="button" className="secondary" onClick={doResume} disabled={actionLoading || activeRun?.status !== "paused"}>Resume</button>
          <button type="button" className="ghost" onClick={doStop} disabled={actionLoading || !activeRun}>Stop</button>
        </div>
      </div>

      <div className="table-card">
        <h3>{mode === "paper" ? "Paper" : "Live"} run history</h3>
        {loading ? <Loading label="Loading runs…" /> : runs.length === 0 ? (
          <div className="empty">No {mode} runs recorded.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Started</th>
                <th>Stopped</th>
                <th>Status</th>
                <th>Pair</th>
                <th>Version</th>
                <th>Learning</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.started_at)}</td>
                  <td>{fmt(r.stopped_at)}</td>
                  <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                  <td>{r.pair}</td>
                  <td className="mono" style={{ fontSize: 10 }}>{r.agent_version_id}</td>
                  <td>{r.learning_enabled ? "on" : "off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8 }}>
          <Link href="/rl-ops" className="text-link">Full RL ops page →</Link>
        </div>
      </div>
    </TabPanel>
  );
}

function PaperTradingTab() { return <TradingModeTab mode="paper" />; }
function LiveTradingTab() { return <TradingModeTab mode="live" />; }

// ─── 8. RISK & CONTROLS ──────────────────────────────────────────────────────

function RiskControlsTab() {
  const [killSwitch, setKillSwitch] = useState<KillSwitchState>({ enabled: false });
  const [promotionGates, setPromotionGates] = useState<PromotionGateConfig>({});
  const [riskLimits, setRiskLimits] = useState<RiskLimitSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // New risk limit set form
  const [newLimitName, setNewLimitName] = useState("");
  const [newMaxPos, setNewMaxPos] = useState("1");
  const [newLevCap, setNewLevCap] = useState("3");
  const [newDailyLoss, setNewDailyLoss] = useState("500");
  const [newMaxDD, setNewMaxDD] = useState("800");
  const [newMaxOpen, setNewMaxOpen] = useState("2");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ks, pg, rl] = await Promise.all([
        fetchKillSwitch().catch(() => null),
        fetchPromotionGates().catch(() => null),
        listRiskLimitSets(),
      ]);
      if (ks) setKillSwitch(ks);
      if (pg) setPromotionGates(pg);
      setRiskLimits(rl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load risk controls.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doKillSwitch = async (enabled: boolean) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await updateKillSwitch("gold-rl-agent", { enabled, reason: enabled ? "Manual via Dashboard" : null });
      setKillSwitch(result);
      setSaveMsg(`Kill switch ${enabled ? "ENABLED" : "disabled"}.`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to update kill switch.");
    } finally {
      setSaving(false);
    }
  };

  const doSavePromotionGates = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await updatePromotionGates("gold-rl-agent", promotionGates);
      setPromotionGates(result);
      setSaveMsg("Promotion gates saved.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save promotion gates.");
    } finally {
      setSaving(false);
    }
  };

  const doCreateRiskLimit = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await createRiskLimitSet({
        name: newLimitName.trim() || `Limits ${new Date().toLocaleDateString()}`,
        maxPositionSize: Number(newMaxPos),
        leverageCap: Number(newLevCap),
        maxDailyLoss: Number(newDailyLoss),
        maxDrawdown: Number(newMaxDD),
        maxOpenPositions: Number(newMaxOpen),
      });
      setSaveMsg("Risk limit set created.");
      setNewLimitName("");
      await load();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to create risk limit set.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TabPanel title="Risk & Controls">
      <p className="text-muted">
        Manage kill switch, promotion gates, and risk limit sets. Default institutional safety limits: max leverage 3×, max position 10% equity, daily loss 2%, max drawdown 5%.
      </p>

      {error && <Err msg={error} />}
      {saveMsg && <div className="empty" style={{ marginBottom: 12 }}>{saveMsg}</div>}

      {/* Kill Switch */}
      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Kill Switch</h3>
        <p>When enabled, cancels all open orders and flattens positions immediately.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <span className={`status-pill ${killSwitch.enabled ? "status-bad" : "status-ok"}`}>
            {killSwitch.enabled ? "KILL SWITCH ACTIVE" : "Kill switch off"}
          </span>
          {killSwitch.reason && <span style={{ fontSize: 12, color: "var(--muted)" }}>Reason: {killSwitch.reason}</span>}
        </div>
        <div className="action-row">
          <button
            type="button"
            onClick={() => doKillSwitch(!killSwitch.enabled)}
            disabled={saving || loading}
            style={{ background: killSwitch.enabled ? undefined : "var(--tone-clay)", color: killSwitch.enabled ? undefined : "#fff" }}
          >
            {killSwitch.enabled ? "Disable kill switch" : "ENABLE KILL SWITCH"}
          </button>
        </div>
      </div>

      {/* Promotion Gates */}
      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Promotion gates</h3>
        <p>Model must pass all gates to be promoted from challenger to champion.</p>
        <div className="form-grid">
          <label>
            Promotion required
            <select
              value={promotionGates.promotion_required ? "yes" : "no"}
              onChange={(e) => setPromotionGates({ ...promotionGates, promotion_required: e.target.value === "yes" })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Min trades
            <input
              type="number"
              value={promotionGates.promotion_min_trades ?? ""}
              onChange={(e) => setPromotionGates({ ...promotionGates, promotion_min_trades: Number(e.target.value) })}
            />
          </label>
          <label>
            Min win rate (0–1)
            <input
              type="number"
              step="0.01"
              value={promotionGates.promotion_min_win_rate ?? ""}
              onChange={(e) => setPromotionGates({ ...promotionGates, promotion_min_win_rate: Number(e.target.value) })}
            />
          </label>
          <label>
            Min net PnL
            <input
              type="number"
              step="0.01"
              value={promotionGates.promotion_min_net_pnl ?? ""}
              onChange={(e) => setPromotionGates({ ...promotionGates, promotion_min_net_pnl: Number(e.target.value) })}
            />
          </label>
          <label>
            Max drawdown (0–1)
            <input
              type="number"
              step="0.01"
              value={promotionGates.promotion_max_drawdown ?? ""}
              onChange={(e) => setPromotionGates({ ...promotionGates, promotion_max_drawdown: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="action-row">
          <button type="button" onClick={doSavePromotionGates} disabled={saving}>Save gates</button>
        </div>
      </div>

      {/* Risk Limit Sets */}
      <div className="table-card" style={{ marginBottom: 16 }}>
        <h3>Risk limit sets</h3>
        {loading ? <Loading label="Loading risk limits…" /> : riskLimits.length === 0 ? (
          <div className="empty">No risk limit sets defined.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Max Position</th>
                <th>Leverage Cap</th>
                <th>Daily Loss</th>
                <th>Max Drawdown</th>
                <th>Max Positions</th>
              </tr>
            </thead>
            <tbody>
              {riskLimits.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td><span className={`status-pill ${r.active ? "status-ok" : "status-muted"}`}>{r.active ? "active" : "inactive"}</span></td>
                  <td>{r.max_position_size}</td>
                  <td>{r.leverage_cap}×</td>
                  <td>{r.max_daily_loss}</td>
                  <td>{r.max_drawdown}</td>
                  <td>{r.max_open_positions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Risk Limit Set */}
      <div className="table-card">
        <h3>Create risk limit set</h3>
        <div className="form-grid">
          <label>Name<input value={newLimitName} onChange={(e) => setNewLimitName(e.target.value)} placeholder="Gold Day Session" /></label>
          <label>Max position size<input type="number" step="0.01" value={newMaxPos} onChange={(e) => setNewMaxPos(e.target.value)} /></label>
          <label>Leverage cap<input type="number" step="0.1" value={newLevCap} onChange={(e) => setNewLevCap(e.target.value)} /></label>
          <label>Max daily loss<input type="number" step="1" value={newDailyLoss} onChange={(e) => setNewDailyLoss(e.target.value)} /></label>
          <label>Max drawdown<input type="number" step="1" value={newMaxDD} onChange={(e) => setNewMaxDD(e.target.value)} /></label>
          <label>Max open positions<input type="number" step="1" value={newMaxOpen} onChange={(e) => setNewMaxOpen(e.target.value)} /></label>
        </div>
        <div className="action-row">
          <button type="button" onClick={doCreateRiskLimit} disabled={saving}>Create risk limit set</button>
        </div>
      </div>
    </TabPanel>
  );
}

// ─── 9. LOGS & ALERTS ────────────────────────────────────────────────────────

function LogsAlertsTab() {
  const [audit, setAudit] = useState<OpsAuditEvent[]>([]);
  const [driftAlerts, setDriftAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, d] = await Promise.all([
        fetchOpsAudit(50).then((r) => r.data),
        listDriftAlerts().catch(() => [] as DriftAlert[]),
      ]);
      setAudit(a);
      setDriftAlerts(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDrift = driftAlerts.filter((d) => d.status === "open");

  return (
    <TabPanel title="Logs & Alerts">
      <p className="text-muted">Audit trail for all operator actions and detected model drift alerts. Full observability stack uses Prometheus exporters and Grafana dashboards.</p>

      {error && <Err msg={error} />}

      {openDrift.length > 0 && (
        <div className="table-card" style={{ marginBottom: 16, border: "1px solid var(--tone-clay)" }}>
          <h3>Open drift alerts ({openDrift.length})</h3>
          <table className="table compact">
            <thead>
              <tr><th>Detected</th><th>Metric</th><th>Baseline</th><th>Current</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {openDrift.map((d) => (
                <tr key={d.id}>
                  <td>{fmt(d.detected_at)}</td>
                  <td>{d.metric}</td>
                  <td>{fmtNum(d.baseline_value)}</td>
                  <td>{fmtNum(d.current_value)}</td>
                  <td><span className={`status-pill ${d.status === "open" ? "status-bad" : "status-ok"}`}>{d.status}</span></td>
                  <td>{d.action_taken ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-card" style={{ marginBottom: 16 }}>
        <div className="action-row" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>All drift alerts</h3>
          <button type="button" className="secondary" onClick={load} disabled={loading}>Refresh</button>
        </div>
        {loading ? <Loading label="Loading alerts…" /> : driftAlerts.length === 0 ? (
          <div className="empty">No drift alerts recorded.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>Detected</th><th>Metric</th><th>Baseline</th><th>Current</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {driftAlerts.map((d) => (
                <tr key={d.id}>
                  <td>{fmt(d.detected_at)}</td>
                  <td>{d.metric}</td>
                  <td>{fmtNum(d.baseline_value)}</td>
                  <td>{fmtNum(d.current_value)}</td>
                  <td><span className={`status-pill ${d.status === "open" ? "status-bad" : d.status === "resolved" ? "status-ok" : "status-warn"}`}>{d.status}</span></td>
                  <td>{d.action_taken ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-card">
        <h3>Audit log</h3>
        {loading ? <Loading label="Loading audit log…" /> : audit.length === 0 ? (
          <div className="empty">No audit events recorded yet.</div>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.created_at)}</td>
                  <td>{e.actor}</td>
                  <td><span className="badge">{e.action}</span></td>
                  <td>{e.resource_type}{e.resource_id ? ` / ${e.resource_id}` : ""}</td>
                  <td style={{ fontSize: 11, color: "var(--muted)" }}>{JSON.stringify(e.metadata).slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TabPanel>
  );
}

// ─── 10. SETTINGS ────────────────────────────────────────────────────────────

function SettingsTab() {
  const [status, setStatus] = useState<OnlineLearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchOnlineLearningStatus(1);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cfg = status?.config;

  return (
    <TabPanel title="Settings">
      <p className="text-muted">
        Global runtime configuration for the online learning system. To modify settings, update the backend environment variables and restart the worker. This page shows the current active configuration.
      </p>

      {error && <Err msg={error} />}
      {loading ? <Loading label="Loading configuration…" /> : !cfg ? (
        <div className="empty">No configuration available. Backend may be offline.</div>
      ) : (
        <>
          <div className="table-card" style={{ marginBottom: 16 }}>
            <h3>Online learning configuration</h3>
            <div className="detail-grid">
              <div><span>Enabled</span><strong>{cfg.enabled ? "yes" : "no"}</strong></div>
              <div><span>Cadence</span><strong>every {cfg.intervalMin} min</strong></div>
              <div><span>Candle interval</span><strong>{cfg.interval}</strong></div>
              <div><span>Context intervals</span><strong>{cfg.contextIntervals?.join(", ") ?? "—"}</strong></div>
              <div><span>Pairs</span><strong>{cfg.pairs?.join(", ") ?? cfg.pair ?? "—"}</strong></div>
              <div><span>Train window</span><strong>{cfg.trainWindowMin} min</strong></div>
              <div><span>Eval window</span><strong>{cfg.evalWindowMin} min</strong></div>
              <div><span>Eval lag</span><strong>{cfg.evalLagMin} min</strong></div>
              <div><span>Window size</span><strong>{cfg.windowSize} bars</strong></div>
              <div><span>Stride</span><strong>{cfg.stride}</strong></div>
              <div><span>Timesteps</span><strong>{cfg.timesteps?.toLocaleString() ?? "—"}</strong></div>
              <div><span>Decision threshold</span><strong>{cfg.decisionThreshold}</strong></div>
              <div><span>Auto roll-forward</span><strong>{cfg.autoRollForward ? "yes" : "no"}</strong></div>
              <div><span>Rollout mode</span><strong>{cfg.rolloutMode ?? "full"}</strong></div>
            </div>
          </div>
          <div className="table-card" style={{ marginBottom: 16 }}>
            <h3>Cost model</h3>
            <div className="detail-grid">
              <div><span>Leverage default</span><strong>{cfg.leverageDefault}×</strong></div>
              <div><span>Taker fee</span><strong>{cfg.takerFeeBps} bps</strong></div>
              <div><span>Slippage</span><strong>{cfg.slippageBps} bps</strong></div>
              <div><span>Funding weight</span><strong>{cfg.fundingWeight}</strong></div>
              <div><span>Drawdown penalty</span><strong>{cfg.drawdownPenalty}</strong></div>
            </div>
          </div>
          <div className="table-card" style={{ marginBottom: 16 }}>
            <h3>Promotion gates (live config)</h3>
            <div className="detail-grid">
              <div><span>Min win rate</span><strong>{fmtNum(cfg.minWinRate * 100, 0)}%</strong></div>
              <div><span>Min net PnL</span><strong>{fmtNum(cfg.minNetPnl)}</strong></div>
              <div><span>Max drawdown</span><strong>{fmtNum(cfg.maxDrawdown * 100, 0)}%</strong></div>
              <div><span>Min trades</span><strong>{cfg.minTradeCount}</strong></div>
              <div><span>Min win rate delta</span><strong>{fmtNum(cfg.minWinRateDelta * 100, 1)}%</strong></div>
              <div><span>Min PnL delta</span><strong>{fmtNum(cfg.minNetPnlDelta)}</strong></div>
              <div><span>Min effect size</span><strong>{fmtNum(cfg.minEffectSize)}</strong></div>
              <div><span>Min confidence Z</span><strong>{fmtNum(cfg.minConfidenceZ)}</strong></div>
              <div><span>Min sample size</span><strong>{cfg.minSampleSize}</strong></div>
            </div>
          </div>
          <div className="table-card">
            <h3>Feedback learning</h3>
            <div className="detail-grid">
              <div><span>Feedback rounds</span><strong>{cfg.feedbackRounds}</strong></div>
              <div><span>Feedback timesteps</span><strong>{cfg.feedbackTimesteps?.toLocaleString() ?? "—"}</strong></div>
              <div><span>Hard ratio</span><strong>{cfg.feedbackHardRatio}</strong></div>
            </div>
            {status?.rlService && (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>RL service URL: </span>
                <span className="mono" style={{ fontSize: 12 }}>{status.rlService.url}</span>
                {status.rlService.mock && <span className="badge" style={{ marginLeft: 8 }}>mock</span>}
              </div>
            )}
          </div>
        </>
      )}
    </TabPanel>
  );
}
