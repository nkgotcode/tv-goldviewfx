"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import type { AgentStatus, RiskLimitSet } from "../../services/rl_agent";
import type { IngestionStatus } from "../../services/ingestion";
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

export default function OpsControlPanel({
  agentStatus,
  riskLimits,
  ingestionStatus,
  onUpdated,
}: {
  agentStatus: AgentStatus | null;
  riskLimits: RiskLimitSet[];
  ingestionStatus: IngestionStatus | null;
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

  useEffect(() => {
    if (!riskLimitId && riskLimits.length > 0) {
      setRiskLimitId(riskLimits[0].id);
    }
  }, [riskLimitId, riskLimits]);

  useEffect(() => {
    if (!telegramSourceId && telegramSources.length > 0) {
      setTelegramSourceId(telegramSources[0].id);
    }
  }, [telegramSourceId, telegramSources]);

  const activeRun = agentStatus?.currentRun ?? null;

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
      <h3>Ops Control Panel</h3>
      <p>Manage trading runs alongside ingestion controls for TradingView, Telegram, and BingX.</p>

      {error ? <div className="empty">{error}</div> : null}

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
          Risk Limits
          <select value={riskLimitId} onChange={(event) => setRiskLimitId(event.target.value)}>
            {riskLimits.map((limit) => (
              <option key={limit.id} value={limit.id}>
                {limit.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Learning Window (min)
          <input
            type="number"
            value={learningWindow}
            onChange={(event) => setLearningWindow(event.target.value)}
          />
        </label>
        <label className="toggle-row">
          <span>Learning Enabled</span>
          <input
            type="checkbox"
            checked={learningEnabled}
            onChange={(event) => setLearningEnabled(event.target.checked)}
          />
        </label>
        <label>
          Telegram Source
          <select value={telegramSourceId} onChange={(event) => setTelegramSourceId(event.target.value)}>
            {telegramSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.display_name ?? source.identifier}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="action-row">
        <button type="button" onClick={handleStart} disabled={actionLoading}>
          Start Run
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
    </section>
  );
}
