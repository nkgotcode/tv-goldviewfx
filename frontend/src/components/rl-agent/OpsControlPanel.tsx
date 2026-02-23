"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import type { AgentStatus, RiskLimitSet } from "../../services/rl_agent";
import type { IngestionStatus } from "../../services/ingestion";
import type { OnlineLearningStatus } from "../../services/rl_ops";
import {
  pauseAgentRun,
  resumeAgentRun,
  startAgentRun,
  stopAgentRun,
  triggerBingxBackfill,
  triggerBingxRefresh,
  triggerTelegramIngest,
  triggerTradingViewSync,
} from "../../services/rl_ops";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function asBooleanLabel(value: boolean | undefined) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function healthTone(status: "ok" | "error" | "unavailable" | undefined) {
  if (status === "ok") return "status-ok";
  if (status === "error") return "status-bad";
  if (status === "unavailable") return "status-warn";
  return "status-muted";
}

export default function OpsControlPanel({
  agentStatus,
  riskLimits,
  ingestionStatus,
  learningStatus,
  onUpdated,
}: {
  agentStatus: AgentStatus | null;
  riskLimits: RiskLimitSet[];
  ingestionStatus: IngestionStatus | null;
  learningStatus: OnlineLearningStatus | null;
  onUpdated: () => Promise<void>;
}) {
  const [pair, setPair] = useState<string>(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [learningWindow, setLearningWindow] = useState("30");
  const [riskLimitId, setRiskLimitId] = useState("");
  const [telegramSourceId, setTelegramSourceId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telegramSources = ingestionStatus?.telegram.sources ?? [];
  const firstRiskLimit = riskLimits[0];
  const firstTelegramSource = telegramSources[0];

  useEffect(() => {
    if (!riskLimitId && firstRiskLimit) {
      setRiskLimitId(firstRiskLimit.id);
    }
  }, [riskLimitId, firstRiskLimit]);

  useEffect(() => {
    if (!telegramSourceId && firstTelegramSource) {
      setTelegramSourceId(firstTelegramSource.id);
    }
  }, [telegramSourceId, firstTelegramSource]);

  const activeRun = agentStatus?.currentRun ?? null;
  const learningHealth = learningStatus?.rlService?.health ?? null;
  const latestLearningUpdate = learningStatus?.latestUpdates?.[0] ?? null;
  const latestBacktestRunId =
    learningStatus?.latestReport?.backtestRunId ??
    latestLearningUpdate?.evaluationReport?.backtestRunId ??
    null;

  const handleStart = async () => {
    if (!riskLimitId) {
      setError("Select a risk limit set before starting a run.");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await startAgentRun("gold-rl-agent", {
        mode,
        pair,
        riskLimitSetId: riskLimitId,
        learningEnabled,
        learningWindowMinutes: Number(learningWindow),
      });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await pauseAgentRun();
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await resumeAgentRun();
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await stopAgentRun();
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTradingViewSync = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await triggerTradingViewSync({ full_content: false, include_updates: false });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync TradingView.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTelegramIngest = async () => {
    if (!telegramSourceId) {
      setError("Select a Telegram source before ingesting.");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await triggerTelegramIngest({ source_id: telegramSourceId });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest Telegram.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBingxRefresh = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await triggerBingxRefresh({ pairs: [pair] });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh BingX feeds.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBingxBackfill = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await triggerBingxBackfill({ pairs: [pair], maxBatches: 1 });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to backfill BingX feeds.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="table-card">
      <div className="section-head">
        <div>
          <span>Ops Control</span>
          <h3>Run + backtest + ingestion controls</h3>
          <p>One horizontal command strip for run controls, Nautilus health, and ingestion operations.</p>
        </div>
        <div className="action-row">
          <Link href="/rl-evaluations" className="text-link">
            Open evaluation timeline -&gt;
          </Link>
          <Link href="/ops#ingestion-run-history" className="text-link">
            Open full ingestion run history -&gt;
          </Link>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      <div className="ops-control-strip">
        <div className="panel" data-tone="ember">
          <h5>Agent run</h5>
          <strong>{activeRun?.status ?? "idle"}</strong>
          <div className="inline-muted">Mode {activeRun?.mode ?? "paper"} · Pair {activeRun?.pair ?? pair}</div>
          <div className="inline-muted">Gate {agentStatus?.promotionGateStatus ?? "unknown"}</div>
        </div>
        <div className="panel" data-tone="teal">
          <h5>Learning cadence</h5>
          <strong>{learningStatus?.config?.enabled ? "enabled" : "disabled"}</strong>
          <div className="inline-muted">
            Every {learningStatus?.config?.intervalMin ?? "—"} min · Candle {learningStatus?.config?.interval ?? "—"}
          </div>
          <div className="inline-muted">
            Last update {latestLearningUpdate?.status ?? "none"} · {formatTimestamp(latestLearningUpdate?.completedAt)}
          </div>
        </div>
        <div className="panel" data-tone="slate">
          <h5>RL service</h5>
          <strong>{learningHealth?.status ?? "unknown"}</strong>
          <div className="inline-muted">
            <span className={`status-pill ${healthTone(learningHealth?.status)}`}>{learningHealth?.status ?? "not checked"}</span>
          </div>
          <div className="inline-muted">Checked {formatTimestamp(learningHealth?.checkedAt ?? null)}</div>
        </div>
        <div className="panel" data-tone="clay">
          <h5>Nautilus backtest</h5>
          <strong>{asBooleanLabel(learningHealth?.mlDependencies?.nautilus_trader)}</strong>
          <div className="inline-muted">Strict backtest {asBooleanLabel(learningHealth?.strictBacktest)}</div>
          <div className="inline-muted mono">{latestBacktestRunId ?? "backtest id not recorded"}</div>
        </div>
        <div className="panel" data-tone="slate">
          <h5>TradingView</h5>
          <div className="inline-muted">State {ingestionStatus?.tradingview.overall_status ?? "unknown"}</div>
          <div className="inline-muted">Last run {formatTimestamp(ingestionStatus?.tradingview.last_run?.finished_at ?? null)}</div>
        </div>
        <div className="panel" data-tone="teal">
          <h5>Telegram + BingX</h5>
          <div className="inline-muted">Telegram {ingestionStatus?.telegram.overall_status ?? "unknown"}</div>
          <div className="inline-muted">BingX {ingestionStatus?.bingx.overall_status ?? "unknown"}</div>
          <div className="inline-muted">BingX update {formatTimestamp(ingestionStatus?.bingx.last_updated_at ?? null)}</div>
        </div>
      </div>

      <div className="ops-control-actions">
        <div className="panel">
          <h5>Trading run actions</h5>
          <div className="form-grid">
            <label>
              Pair
              <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
                {ALL_PAIRS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label>
              Risk limits
              <select value={riskLimitId} onChange={(event) => setRiskLimitId(event.target.value)}>
                {riskLimits.map((limit) => (
                  <option key={limit.id} value={limit.id}>
                    {limit.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Learning window (min)
              <input type="number" value={learningWindow} onChange={(event) => setLearningWindow(event.target.value)} />
            </label>
            <label className="toggle-row">
              <span>Learning enabled</span>
              <input
                type="checkbox"
                checked={learningEnabled}
                onChange={(event) => setLearningEnabled(event.target.checked)}
              />
            </label>
          </div>
          <div className="action-row">
            <button type="button" onClick={handleStart} disabled={actionLoading}>
              Start run
            </button>
            <button type="button" className="secondary" onClick={handlePause} disabled={actionLoading || activeRun?.status !== "running"}>
              Pause
            </button>
            <button type="button" className="secondary" onClick={handleResume} disabled={actionLoading || activeRun?.status !== "paused"}>
              Resume
            </button>
            <button type="button" className="ghost" onClick={handleStop} disabled={actionLoading || !activeRun}>
              Stop
            </button>
          </div>
        </div>

        <div className="panel">
          <h5>Ingestion actions</h5>
          <div className="form-grid">
            <label>
              Telegram source
              <select value={telegramSourceId} onChange={(event) => setTelegramSourceId(event.target.value)}>
                {telegramSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.display_name ?? source.identifier}
                  </option>
                ))}
              </select>
            </label>
            <label>
              BingX pair target
              <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
                {ALL_PAIRS.map((option) => (
                  <option key={`ingest-pair-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="action-row">
            <button type="button" onClick={handleTradingViewSync} disabled={actionLoading}>
              Sync TradingView
            </button>
            <button type="button" className="secondary" onClick={handleTelegramIngest} disabled={actionLoading}>
              Ingest Telegram
            </button>
            <button type="button" className="secondary" onClick={handleBingxRefresh} disabled={actionLoading}>
              Refresh BingX
            </button>
            <button type="button" className="ghost" onClick={handleBingxBackfill} disabled={actionLoading}>
              Backfill BingX
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
