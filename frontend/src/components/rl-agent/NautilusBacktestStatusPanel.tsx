"use client";

import Link from "next/link";
import type { OnlineLearningStatus } from "../../services/rl_ops";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function tone(status: "ok" | "error" | "unavailable" | undefined) {
  if (status === "ok") return "status-ok";
  if (status === "error") return "status-bad";
  if (status === "unavailable") return "status-warn";
  return "status-muted";
}

function asBooleanLabel(value: boolean | undefined) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

export default function NautilusBacktestStatusPanel({
  status,
  latestBacktestRunId,
  title = "Learning + Nautilus Status",
  description = "Verify that online learning is active and Nautilus backtesting is available before trusting evaluation outcomes.",
}: {
  status: OnlineLearningStatus | null;
  latestBacktestRunId?: string | null;
  title?: string;
  description?: string;
}) {
  const health = status?.rlService?.health ?? null;
  const latestUpdate = status?.latestUpdates?.[0] ?? null;
  const backtestRunId =
    latestBacktestRunId ??
    status?.latestReport?.backtestRunId ??
    latestUpdate?.evaluationReport?.backtestRunId ??
    null;

  return (
    <section className="table-card">
      <div className="section-head">
        <div>
          <span>Backtesting</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="action-row">
          <Link href="/rl-evaluations" className="text-link">
            Open evaluation timeline -&gt;
          </Link>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card" data-tone="teal">
          <span>Learning Enabled</span>
          <strong>{status?.config?.enabled ? "yes" : "no"}</strong>
          <div className="inline-muted">
            {status?.config?.intervalMin ?? "—"} min cadence · {status?.config?.interval ?? "—"} candles
          </div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>RL Service Health</span>
          <strong>{health?.status ?? "unknown"}</strong>
          <div className="inline-muted">
            <span className={`status-pill ${tone(health?.status)}`}>{health?.status ?? "not checked"}</span>
          </div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Nautilus Installed</span>
          <strong>{asBooleanLabel(health?.mlDependencies?.nautilus_trader)}</strong>
          <div className="inline-muted">strict backtest: {asBooleanLabel(health?.strictBacktest)}</div>
        </div>
        <div className="summary-card" data-tone="ember">
          <span>Latest Backtest Run ID</span>
          <strong className="mono">{backtestRunId ?? "not recorded"}</strong>
          <div className="inline-muted">Latest evaluation metadata</div>
        </div>
      </div>

      <div className="inline-muted">
        Last learning update: {latestUpdate?.status ?? "none"} · Started {formatTimestamp(latestUpdate?.startedAt)} · Completed{" "}
        {formatTimestamp(latestUpdate?.completedAt)}
      </div>
      <div className="inline-muted">Health checked: {formatTimestamp(health?.checkedAt ?? null)}</div>
      {health?.error ? <div className="empty">{health.error}</div> : null}
    </section>
  );
}
