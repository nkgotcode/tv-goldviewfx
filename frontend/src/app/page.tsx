"use client";

import { useCustom } from "@refinedev/core";
import Link from "next/link";
import Layout from "../components/Layout";
import HeroActions from "../components/HeroActions";
import MarketKlinePanel from "../components/MarketKlinePanel";
import type { DashboardSummary } from "../services/api";

export default function HomePage() {
  const { result: summaryResult, query: summaryQuery } = useCustom<DashboardSummary>({
    url: "/dashboard/summary",
    method: "get",
  });

  const summary = summaryResult?.data ?? summaryQuery?.data?.data ?? {
    idea_count: 0,
    signal_count: 0,
    trade_count: 0,
    last_sync_status: "unavailable",
    last_sync_at: null,
  };

  const syncStatus = summary.last_sync_status ?? "unknown";
  const syncTone =
    syncStatus === "succeeded" ? "status-ok" : syncStatus === "failed" ? "status-bad" : "status-muted";
  const lastSyncAt = summary.last_sync_at ?? "not recorded";

  return (
    <Layout>
      <section className="hero hero-command">
        <div className="hero-intro">
          <span className="hero-eyebrow">Goldviewfx Intelligence</span>
          <h1>Signal Command Atlas</h1>
          <p>
            A full-stack command deck for the gold signal pipeline: ingestion, enrichment, execution,
            and RL evaluations. Navigate each subsystem with dedicated views for controls, telemetry,
            insights, and the signal library.
          </p>
          <HeroActions />
          <div className="hero-status">
            <span className={`status-pill ${syncTone}`}>Sync {syncStatus}</span>
            <span className="hero-subtle">Last run {lastSyncAt}</span>
          </div>
        </div>
        <div className="hero-board">
          <div className="summary-grid">
            <div className="summary-card" data-tone="ember">
              <span>Ideas</span>
              <strong>{summary.idea_count}</strong>
              <div className="inline-muted">TradingView narratives</div>
            </div>
            <div className="summary-card" data-tone="slate">
              <span>Signals</span>
              <strong>{summary.signal_count}</strong>
              <div className="inline-muted">Confidence-ranked intel</div>
            </div>
            <div className="summary-card" data-tone="olive">
              <span>Trades</span>
              <strong>{summary.trade_count}</strong>
              <div className="inline-muted">Paper + live execution</div>
            </div>
            <div className="summary-card" data-tone="clay">
              <span>Sync Window</span>
              <strong>{syncStatus}</strong>
              <div className="inline-muted">{lastSyncAt}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="system-map">
        <div className="section-head">
          <div>
            <span>System Atlas</span>
            <h2>Every subsystem, one glance</h2>
            <p>
              Track the full signal chain from ingestion to RL training. Each card anchors a critical
              subsystem with direct access to its dedicated view.
            </p>
          </div>
        </div>
        <div className="system-grid">
          <article className="system-card" data-tone="ember">
            <div className="system-title">
              <span>Ingestion Command</span>
              <strong>{summary.idea_count}</strong>
            </div>
            <p>TradingView + Telegram intake with dedup, OCR, and enrichment.</p>
            <div className="system-tags">
              <span className="tag">Dedup</span>
              <span className="tag">OCR</span>
              <span className="tag">NLP</span>
            </div>
            <div className="system-meta">
              <span>Last sync</span>
              <strong>{syncStatus}</strong>
            </div>
            <Link className="text-link" href="/ingestion">
              Open ingestion -&gt;
            </Link>
          </article>
          <article className="system-card" data-tone="teal">
            <div className="system-title">
              <span>Signal Intelligence</span>
              <strong>{summary.signal_count}</strong>
            </div>
            <p>Sentiment overlays, source efficacy, and topic drift monitoring.</p>
            <div className="system-tags">
              <span className="tag">Confidence</span>
              <span className="tag">Sentiment</span>
            </div>
            <div className="system-meta">
              <span>Focus</span>
              <strong>GOLD-USDT</strong>
            </div>
            <Link className="text-link" href="/insights">
              Open insights -&gt;
            </Link>
          </article>
          <article className="system-card" data-tone="slate">
            <div className="system-title">
              <span>Execution + Risk</span>
              <strong>{summary.trade_count}</strong>
            </div>
            <p>Paper + live trades with risk limits, kill switch, and PnL data.</p>
            <div className="system-tags">
              <span className="tag">Kill switch</span>
              <span className="tag">Limits</span>
            </div>
            <div className="system-meta">
              <span>Mode</span>
              <strong>Policy gated</strong>
            </div>
            <Link className="text-link" href="/controls">
              Open controls -&gt;
            </Link>
          </article>
          <article className="system-card" data-tone="olive">
            <div className="system-title">
              <span>BingX Market Data</span>
              <strong>Convex indexed</strong>
            </div>
            <p>1m candles, trades, and funding synced for training + backtests.</p>
            <div className="system-tags">
              <span className="tag">1m cadence</span>
              <span className="tag">Live head</span>
            </div>
            <div className="system-meta">
              <span>Coverage</span>
              <strong>Multi-frame</strong>
            </div>
            <Link className="text-link" href="/rl-data-sources">
              Data guardrails -&gt;
            </Link>
          </article>
          <article className="system-card" data-tone="clay">
            <div className="system-title">
              <span>RL Training</span>
              <strong>Policy loops</strong>
            </div>
            <p>Continuous learning, promotion gates, and artifact retention.</p>
            <div className="system-tags">
              <span className="tag">SB3</span>
              <span className="tag">Nautilus</span>
            </div>
            <div className="system-meta">
              <span>Access</span>
              <strong>Ops dashboard</strong>
            </div>
            <Link className="text-link" href="/rl-ops">
              Open RL ops -&gt;
            </Link>
          </article>
          <article className="system-card" data-tone="ember">
            <div className="system-title">
              <span>RL Evaluation</span>
              <strong>Reports</strong>
            </div>
            <p>Regression checks, drawdown tracking, and promotion readiness.</p>
            <div className="system-tags">
              <span className="tag">Backtest</span>
              <span className="tag">Audit</span>
            </div>
            <div className="system-meta">
              <span>Gate</span>
              <strong>Promotion</strong>
            </div>
            <Link className="text-link" href="/rl-evaluations">
              Open evaluations -&gt;
            </Link>
          </article>
        </div>
      </section>

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Market Pulse</span>
            <h2>Live tape preview</h2>
            <p>Quick read on recent candles with trade annotations before diving deeper.</p>
          </div>
        </div>
        <div className="pulse-grid">
          <MarketKlinePanel
            title="Gold-USDT preview"
            description="Recent candles with the latest trades overlaid."
            defaultLimit={200}
            showModeToggle={false}
            tone="teal"
          />
          <div className="table-card">
            <h3>Signal pulse checklist</h3>
            <p>Confirm the pipeline is healthy before triggering live actions.</p>
            <div className="panel-grid">
              <div className="panel">
                <h5>Ideas intake</h5>
                <div className="inline-muted">{summary.idea_count} ideas ingested</div>
              </div>
              <div className="panel">
                <h5>Signal output</h5>
                <div className="inline-muted">{summary.signal_count} signals generated</div>
              </div>
              <div className="panel">
                <h5>Trade actions</h5>
                <div className="inline-muted">{summary.trade_count} trades recorded</div>
              </div>
              <div className="panel">
                <h5>Sync status</h5>
                <div className="inline-muted">Last run {lastSyncAt}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="command-deck">
        <div className="section-head">
          <div>
            <span>Command Deck</span>
            <h2>Navigate the live control rooms</h2>
            <p>Jump into each operational lane without crowding the landing view.</p>
          </div>
        </div>
        <div className="command-grid">
          <Link className="command-card" href="/controls" data-tone="ember">
            <span>Controls</span>
            <strong>Trade + policy gates</strong>
            <p>Switch modes, tune risk limits, and enforce promotion thresholds.</p>
          </Link>
          <Link className="command-card" href="/ops" data-tone="slate">
            <span>Ops</span>
            <strong>Scheduler telemetry</strong>
            <p>Review ingestion health, audit trails, and retry queues.</p>
          </Link>
          <Link className="command-card" href="/insights" data-tone="teal">
            <span>Insights</span>
            <strong>Signal efficacy</strong>
            <p>Track source performance, sentiment impact, and topic drift.</p>
          </Link>
          <Link className="command-card" href="/library" data-tone="clay">
            <span>Library</span>
            <strong>Signal archive</strong>
            <p>Filter and review historical ideas, signals, trades, and posts.</p>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
