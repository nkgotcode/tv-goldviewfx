"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import PaginationControls from "../PaginationControls";
import {
  fetchOnlineLearningHistory,
  type OnlineLearningRunRequest,
  type OnlineLearningStatus,
  type OnlineLearningUpdate,
} from "../../services/rl_ops";
import EvaluationExecutionTimeline, { type EvaluationExecutionInput } from "./EvaluationExecutionTimeline";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatBoolean(value?: boolean) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function parseIntervalToMinutes(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (match[2] === "m") return amount;
  if (match[2] === "h") return amount * 60;
  if (match[2] === "d") return amount * 24 * 60;
  return null;
}

function statusTone(status?: string | null) {
  if (!status) return "status-muted";
  if (status === "pass" || status === "succeeded") return "status-ok";
  if (status === "fail" || status === "failed") return "status-bad";
  if (status === "running") return "status-warn";
  return "status-muted";
}

function summarizeDecisionReason(update: OnlineLearningUpdate) {
  if (update.decisionReasons && update.decisionReasons.length > 0) {
    return update.decisionReasons.slice(0, 2).join(" · ");
  }
  if (update.status === "failed" && update.evaluationReport?.status === "fail") {
    return "Evaluation failed promotion gates.";
  }
  if (update.status === "failed") {
    return "Run failed. Open details for context.";
  }
  return "—";
}

function renderUpdateRow(update: OnlineLearningUpdate, onOpenDetails: (id: string) => void) {
  const report = update.evaluationReport;
  const champion = update.championEvaluationReport;
  const netDelta = update.metricDeltas?.netPnlDelta;
  const winDelta = update.metricDeltas?.winRateDelta;
  const pair = update.pair ?? report?.pair ?? champion?.pair ?? "—";
  return (
    <tr key={update.id}>
      <td>{formatTimestamp(update.startedAt)}</td>
      <td>{pair}</td>
      <td className="mono">{update.agentVersionId ? update.agentVersionId.slice(0, 8) : "—"}</td>
      <td>{formatTimestamp(update.windowStart)}</td>
      <td>{formatTimestamp(update.windowEnd)}</td>
      <td>
        <span className={`status-pill ${statusTone(update.status)}`}>{update.status}</span>
      </td>
      <td>
        {report ? (
          <span className={`status-pill ${statusTone(report.status)}`}>{report.status}</span>
        ) : (
          "—"
        )}
      </td>
      <td>{report ? formatNumber(report.winRate, 3) : "—"}</td>
      <td>{report ? formatNumber(report.netPnlAfterFees, 2) : "—"}</td>
      <td>{report ? report.tradeCount : "—"}</td>
      <td>{champion ? formatNumber(champion.netPnlAfterFees, 2) : "—"}</td>
      <td>{netDelta !== undefined ? formatNumber(netDelta, 2) : "—"}</td>
      <td>{winDelta !== undefined ? formatNumber(winDelta, 3) : "—"}</td>
      <td>
        <span className={`status-pill ${statusTone(update.promoted === null || update.promoted === undefined ? "running" : update.promoted ? "succeeded" : "failed")}`}>
          {update.promoted === null || update.promoted === undefined ? "pending" : update.promoted ? "promoted" : "rejected"}
        </span>
      </td>
      <td className="inline-muted">{summarizeDecisionReason(update)}</td>
      <td>
        <button type="button" onClick={() => onOpenDetails(update.id)}>
          Details
        </button>
      </td>
    </tr>
  );
}

function hasExecutionMetadata(report: OnlineLearningUpdate["evaluationReport"]) {
  const metadata = report?.metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const execution = (metadata as Record<string, unknown>).execution;
  const executionSteps = (metadata as Record<string, unknown>).execution_steps;
  if (Array.isArray(executionSteps) && executionSteps.length > 0) return true;
  if (execution && typeof execution === "object") {
    const executionRecord = execution as Record<string, unknown>;
    return Array.isArray(executionRecord.steps) && executionRecord.steps.length > 0;
  }
  return false;
}

function toExecutionInput(report: NonNullable<OnlineLearningUpdate["evaluationReport"]>): EvaluationExecutionInput {
  return {
    pair: report.pair,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    status: report.status,
    winRate: report.winRate,
    netPnlAfterFees: report.netPnlAfterFees,
    maxDrawdown: report.maxDrawdown,
    tradeCount: report.tradeCount,
    backtestRunId: report.backtestRunId ?? null,
    metadata: report.metadata ?? null,
  };
}

export default function OnlineLearningPanel({
  status,
  onRunNow,
  actionLoading,
  error,
}: {
  status: OnlineLearningStatus | null;
  onRunNow: (payload?: OnlineLearningRunRequest) => Promise<void>;
  actionLoading: boolean;
  error?: string | null;
}) {
  const config = status?.config;
  const updates = status?.latestUpdates ?? [];
  const latestReport = status?.latestReport ?? null;
  const latestExecutionReport = latestReport ? toExecutionInput(latestReport) : null;
  const [pair, setPair] = useState(config?.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT");
  const [runAllConfiguredPairs, setRunAllConfiguredPairs] = useState(true);
  const [pairsCsv, setPairsCsv] = useState((config?.pairs ?? []).join(","));
  const [interval, setInterval] = useState(config?.interval ?? "5m");
  const [contextIntervalsCsv, setContextIntervalsCsv] = useState((config?.contextIntervals ?? []).join(","));
  const [trainWindowMin, setTrainWindowMin] = useState(String(config?.trainWindowMin ?? 360));
  const [evalWindowMin, setEvalWindowMin] = useState(String(config?.evalWindowMin ?? 120));
  const [evalLagMin, setEvalLagMin] = useState(String(config?.evalLagMin ?? 1));
  const [windowSize, setWindowSize] = useState(String(config?.windowSize ?? 30));
  const [stride, setStride] = useState(String(config?.stride ?? 1));
  const [timesteps, setTimesteps] = useState(String(config?.timesteps ?? 500));
  const [decisionThreshold, setDecisionThreshold] = useState(String(config?.decisionThreshold ?? 0.35));
  const [autoRollForward, setAutoRollForward] = useState(Boolean(config?.autoRollForward ?? true));
  const [minWinRate, setMinWinRate] = useState(String(config?.minWinRate ?? 0.55));
  const [minNetPnl, setMinNetPnl] = useState(String(config?.minNetPnl ?? 0));
  const [maxDrawdown, setMaxDrawdown] = useState(String(config?.maxDrawdown ?? 0.25));
  const [minTradeCount, setMinTradeCount] = useState(String(config?.minTradeCount ?? 20));
  const [minWinRateDelta, setMinWinRateDelta] = useState(String(config?.minWinRateDelta ?? 0));
  const [minNetPnlDelta, setMinNetPnlDelta] = useState(String(config?.minNetPnlDelta ?? 0));
  const [maxDrawdownDelta, setMaxDrawdownDelta] = useState(String(config?.maxDrawdownDelta ?? 0.05));
  const [minTradeCountDelta, setMinTradeCountDelta] = useState(String(config?.minTradeCountDelta ?? -5));
  const [minEffectSize, setMinEffectSize] = useState(String(config?.minEffectSize ?? 0));
  const [minConfidenceZ, setMinConfidenceZ] = useState(String(config?.minConfidenceZ ?? 0));
  const [minSampleSize, setMinSampleSize] = useState(String(config?.minSampleSize ?? 0));
  const [showAdvancedOverrides, setShowAdvancedOverrides] = useState(false);
  const [useFullTrainWindow, setUseFullTrainWindow] = useState(false);
  const [historyRows, setHistoryRows] = useState<OnlineLearningUpdate[]>(updates);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySearchInput, setHistorySearchInput] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"" | "running" | "succeeded" | "failed">("");
  const [historyPairFilter, setHistoryPairFilter] = useState("");
  const [historyRefreshNonce, setHistoryRefreshNonce] = useState(0);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);

  const applyConfigToForm = (nextConfig: NonNullable<typeof config>) => {
    setRunAllConfiguredPairs(true);
    setPair(nextConfig.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT");
    setPairsCsv((nextConfig.pairs ?? []).join(","));
    setInterval(nextConfig.interval ?? "5m");
    setContextIntervalsCsv((nextConfig.contextIntervals ?? []).join(","));
    setTrainWindowMin(String(nextConfig.trainWindowMin ?? 360));
    setEvalWindowMin(String(nextConfig.evalWindowMin ?? 120));
    setEvalLagMin(String(nextConfig.evalLagMin ?? 1));
    setWindowSize(String(nextConfig.windowSize ?? 30));
    setStride(String(nextConfig.stride ?? 1));
    setTimesteps(String(nextConfig.timesteps ?? 500));
    setDecisionThreshold(String(nextConfig.decisionThreshold ?? 0.35));
    setAutoRollForward(Boolean(nextConfig.autoRollForward ?? true));
    setMinWinRate(String(nextConfig.minWinRate ?? 0.55));
    setMinNetPnl(String(nextConfig.minNetPnl ?? 0));
    setMaxDrawdown(String(nextConfig.maxDrawdown ?? 0.25));
    setMinTradeCount(String(nextConfig.minTradeCount ?? 20));
    setMinWinRateDelta(String(nextConfig.minWinRateDelta ?? 0));
    setMinNetPnlDelta(String(nextConfig.minNetPnlDelta ?? 0));
    setMaxDrawdownDelta(String(nextConfig.maxDrawdownDelta ?? 0.05));
    setMinTradeCountDelta(String(nextConfig.minTradeCountDelta ?? -5));
    setMinEffectSize(String(nextConfig.minEffectSize ?? 0));
    setMinConfidenceZ(String(nextConfig.minConfidenceZ ?? 0));
    setMinSampleSize(String(nextConfig.minSampleSize ?? 0));
  };

  useEffect(() => {
    if (!config) return;
    applyConfigToForm(config);
  }, [config]);

  useEffect(() => {
    setHistoryRows(updates);
  }, [updates]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setHistoryPage(1);
      setHistorySearch(historySearchInput.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [historySearchInput]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const response = await fetchOnlineLearningHistory({
          page: historyPage,
          pageSize: historyPageSize,
          search: historySearch || undefined,
          status: historyStatusFilter || undefined,
          pair: historyPairFilter || undefined,
        });
        if (cancelled) return;
        setHistoryRows(response.items);
        setHistoryTotal(response.pagination.total);
        if (response.pagination.page !== historyPage) {
          setHistoryPage(response.pagination.page);
        }
      } catch (err) {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : "Failed to load learning history.");
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyPage, historyPageSize, historySearch, historyStatusFilter, historyPairFilter, historyRefreshNonce, status?.generatedAt]);

  useEffect(() => {
    if (!selectedUpdateId) return;
    if (!historyRows.some((item) => item.id === selectedUpdateId)) {
      setSelectedUpdateId(null);
    }
  }, [historyRows, selectedUpdateId]);

  const selectedUpdate = useMemo(
    () => historyRows.find((item) => item.id === selectedUpdateId) ?? null,
    [historyRows, selectedUpdateId],
  );

  const intervalMinutes = useMemo(() => parseIntervalToMinutes(interval), [interval]);
  const fullWindowSizeEstimate = useMemo(() => {
    const parsedTrainWindow = Number.parseInt(trainWindowMin.trim(), 10);
    if (!intervalMinutes || !Number.isFinite(parsedTrainWindow) || parsedTrainWindow <= 0) return null;
    return Math.max(1, Math.floor(parsedTrainWindow / intervalMinutes));
  }, [intervalMinutes, trainWindowMin]);

  const historyPairOptions = useMemo(() => {
    const configured = config?.pairs ?? [];
    const fromRows = historyRows.map((item) => item.pair).filter((value): value is string => Boolean(value));
    const options = new Set<string>([...configured, ...ALL_PAIRS, ...fromRows]);
    return [...options];
  }, [config?.pairs, historyRows]);

  const parseOptionalNumber = (value: string) => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseOptionalInt = (value: string) => {
    const parsed = parseOptionalNumber(value);
    if (parsed === undefined) return undefined;
    return Math.trunc(parsed);
  };

  const handleRun = async () => {
    const parsedPairs = pairsCsv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const computedWindowSize = useFullTrainWindow ? fullWindowSizeEstimate ?? undefined : parseOptionalInt(windowSize);
    const payload: OnlineLearningRunRequest = {
      useConfiguredPairs: runAllConfiguredPairs,
      pair: runAllConfiguredPairs ? undefined : pair,
      pairs: runAllConfiguredPairs ? undefined : parsedPairs.length > 0 ? parsedPairs : undefined,
      interval: interval.trim() || undefined,
      contextIntervalsCsv: contextIntervalsCsv.trim() || undefined,
      trainWindowMin: parseOptionalInt(trainWindowMin),
      evalWindowMin: parseOptionalInt(evalWindowMin),
      evalLagMin: parseOptionalInt(evalLagMin),
      windowSize: computedWindowSize,
      stride: parseOptionalInt(stride),
      timesteps: parseOptionalInt(timesteps),
      decisionThreshold: parseOptionalNumber(decisionThreshold),
      autoRollForward,
      promotionGates: {
        minWinRate: parseOptionalNumber(minWinRate),
        minNetPnl: parseOptionalNumber(minNetPnl),
        maxDrawdown: parseOptionalNumber(maxDrawdown),
        minTradeCount: parseOptionalInt(minTradeCount),
        minWinRateDelta: parseOptionalNumber(minWinRateDelta),
        minNetPnlDelta: parseOptionalNumber(minNetPnlDelta),
        maxDrawdownDelta: parseOptionalNumber(maxDrawdownDelta),
        minTradeCountDelta: parseOptionalInt(minTradeCountDelta),
        minEffectSize: parseOptionalNumber(minEffectSize),
        minConfidenceZ: parseOptionalNumber(minConfidenceZ),
        minSampleSize: parseOptionalInt(minSampleSize),
      },
    };
    await onRunNow(payload);
  };

  return (
    <section className="table-card">
      <div className="section-head">
        <div>
          <span>Online Learning</span>
          <h3>Rolling window training loop</h3>
          <p>Monitor scheduled training/evaluation windows and trigger manual runs.</p>
        </div>
        <div className="action-row">
          <button type="button" onClick={handleRun} disabled={actionLoading}>
            Run Now
          </button>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card" data-tone="teal">
          <span>Enabled</span>
          <strong>{config?.enabled ? "Yes" : "No"}</strong>
          <div className="inline-muted">
            Every {config?.intervalMin ?? "—"} min · Candle {config?.interval ?? "—"}
          </div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Train window</span>
          <strong>{config?.trainWindowMin ?? "—"} min</strong>
          <div className="inline-muted">Stride {config?.stride ?? "—"}</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Eval window</span>
          <strong>{config?.evalWindowMin ?? "—"} min</strong>
          <div className="inline-muted">Lag {config?.evalLagMin ?? "—"} min</div>
        </div>
        <div className="summary-card" data-tone="ember">
          <span>Decision threshold</span>
          <strong>{config?.decisionThreshold ?? "—"}</strong>
          <div className="inline-muted">Auto roll {config?.autoRollForward ? "on" : "off"}</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Absolute gates</span>
          <strong>Win {formatNumber(config?.minWinRate, 3)}</strong>
          <div className="inline-muted">
            PnL {formatNumber(config?.minNetPnl, 2)} · DD {formatNumber(config?.maxDrawdown, 3)}
          </div>
        </div>
      </div>

      <div className="inline-muted">
        Pairs {(config?.pairs ?? []).join(", ") || config?.pair || ALL_PAIRS[0] || "XAUTUSDT"} · Window size{" "}
        {config?.windowSize ?? "—"} · Timesteps {config?.timesteps ?? "—"} · RL service {status?.rlService?.mock ? "mock" : "live"} ·
        Health {status?.rlService?.health?.status ?? "unknown"} · Nautilus{" "}
        {formatBoolean(status?.rlService?.health?.mlDependencies?.nautilus_trader)} · Strict backtest{" "}
        {formatBoolean(status?.rlService?.health?.strictBacktest)}
      </div>
      <div className="inline-muted">
        Context intervals: {(config?.contextIntervals ?? []).join(", ") || "none"} · Delta gates: Win Δ{" "}
        {formatNumber(config?.minWinRateDelta, 3)} · PnL Δ {formatNumber(config?.minNetPnlDelta, 2)} · Drawdown Δ{" "}
        {formatNumber(config?.maxDrawdownDelta, 3)}
      </div>
      <div className="inline-muted">
        Statistical gates: Effect size {formatNumber(config?.minEffectSize, 3)} · Confidence Z{" "}
        {formatNumber(config?.minConfidenceZ, 2)} · Min sample {formatNumber(config?.minSampleSize, 0)}
      </div>
      <div className="inline-muted">
        Leverage x{formatNumber(config?.leverageDefault, 2)} · Fees {formatNumber(config?.takerFeeBps, 2)} bps ·
        Slippage {formatNumber(config?.slippageBps, 2)} bps · Funding weight {formatNumber(config?.fundingWeight, 2)} ·
        Feedback rounds {config?.feedbackRounds ?? "—"} ({config?.feedbackTimesteps ?? "—"} steps, hard ratio{" "}
        {formatNumber(config?.feedbackHardRatio, 2)})
      </div>

      <div>
        <h5>Run with overrides</h5>
        <div className="inline-muted" style={{ marginBottom: 10 }}>
          Basic mode is enough for most runs: choose scope, interval, and train/eval windows. Advanced mode exposes gating and SB3 tuning.
        </div>
        <div className="action-row" style={{ marginBottom: 10 }}>
          <button type="button" onClick={() => setShowAdvancedOverrides((value) => !value)}>
            {showAdvancedOverrides ? "Hide advanced" : "Show advanced"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!config) return;
              applyConfigToForm(config);
              setUseFullTrainWindow(false);
            }}
          >
            Reset to configured defaults
          </button>
        </div>
        <div className="form-grid">
          <label>
            Pair (single run)
            <select value={pair} onChange={(event) => setPair(event.target.value)}>
              {ALL_PAIRS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target mode
            <select
              value={runAllConfiguredPairs ? "configured" : "custom"}
              onChange={(event) => setRunAllConfiguredPairs(event.target.value === "configured")}
            >
              <option value="configured">All configured pairs (recommended)</option>
              <option value="custom">Single/custom pairs</option>
            </select>
          </label>
          {!runAllConfiguredPairs ? (
            <label>
              Pairs CSV
              <input
                value={pairsCsv}
                onChange={(event) => setPairsCsv(event.target.value)}
                placeholder="XAUTUSDT,BTC-USDT,ETH-USDT"
              />
            </label>
          ) : null}
          <label>
            Primary interval
            <input
              list="interval-options"
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              placeholder="5m"
            />
            <datalist id="interval-options">
              {["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"].map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="toggle-row">
            <span>Use full train window for feature window</span>
            <input
              type="checkbox"
              checked={useFullTrainWindow}
              onChange={(event) => setUseFullTrainWindow(event.target.checked)}
            />
          </label>
          {useFullTrainWindow ? (
            <label>
              Derived window size
              <input value={fullWindowSizeEstimate ?? ""} readOnly placeholder="Adjust interval/train window to derive" />
            </label>
          ) : null}
          <label>
            Train window (min)
            <input value={trainWindowMin} onChange={(event) => setTrainWindowMin(event.target.value)} />
          </label>
          <label>
            Eval window (min)
            <input value={evalWindowMin} onChange={(event) => setEvalWindowMin(event.target.value)} />
          </label>
          <label>
            Eval lag (min)
            <input value={evalLagMin} onChange={(event) => setEvalLagMin(event.target.value)} />
          </label>
          <label>
            Decision threshold
            <input value={decisionThreshold} onChange={(event) => setDecisionThreshold(event.target.value)} />
          </label>
          <label>
            Auto roll-forward
            <select value={autoRollForward ? "true" : "false"} onChange={(event) => setAutoRollForward(event.target.value === "true")}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          {showAdvancedOverrides ? (
            <>
              <label>
                Context intervals CSV
                <input
                  value={contextIntervalsCsv}
                  onChange={(event) => setContextIntervalsCsv(event.target.value)}
                  placeholder="15m,1h,4h"
                />
              </label>
              {!useFullTrainWindow ? (
                <label>
                  Window size
                  <input value={windowSize} onChange={(event) => setWindowSize(event.target.value)} />
                </label>
              ) : null}
              <label>
                Stride
                <input value={stride} onChange={(event) => setStride(event.target.value)} />
              </label>
              <label>
                Timesteps
                <input value={timesteps} onChange={(event) => setTimesteps(event.target.value)} />
              </label>
              <label>
                Min win rate
                <input value={minWinRate} onChange={(event) => setMinWinRate(event.target.value)} />
              </label>
              <label>
                Min net PnL
                <input value={minNetPnl} onChange={(event) => setMinNetPnl(event.target.value)} />
              </label>
              <label>
                Max drawdown
                <input value={maxDrawdown} onChange={(event) => setMaxDrawdown(event.target.value)} />
              </label>
              <label>
                Min trades
                <input value={minTradeCount} onChange={(event) => setMinTradeCount(event.target.value)} />
              </label>
              <label>
                Min win delta
                <input value={minWinRateDelta} onChange={(event) => setMinWinRateDelta(event.target.value)} />
              </label>
              <label>
                Min net PnL delta
                <input value={minNetPnlDelta} onChange={(event) => setMinNetPnlDelta(event.target.value)} />
              </label>
              <label>
                Max drawdown delta
                <input value={maxDrawdownDelta} onChange={(event) => setMaxDrawdownDelta(event.target.value)} />
              </label>
              <label>
                Min trade delta
                <input value={minTradeCountDelta} onChange={(event) => setMinTradeCountDelta(event.target.value)} />
              </label>
              <label>
                Min effect size
                <input value={minEffectSize} onChange={(event) => setMinEffectSize(event.target.value)} />
              </label>
              <label>
                Min confidence Z
                <input value={minConfidenceZ} onChange={(event) => setMinConfidenceZ(event.target.value)} />
              </label>
              <label>
                Min sample size
                <input value={minSampleSize} onChange={(event) => setMinSampleSize(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <h5>Latest evaluation</h5>
        {latestReport ? (
          <div className="summary-grid">
            <div className="summary-card" data-tone="teal">
              <span>Status</span>
              <strong>{latestReport.status}</strong>
              <div className="inline-muted">{formatTimestamp(latestReport.createdAt)}</div>
            </div>
            <div className="summary-card" data-tone="slate">
              <span>Win rate</span>
              <strong>{formatNumber(latestReport.winRate, 3)}</strong>
              <div className="inline-muted">{latestReport.tradeCount} trades</div>
            </div>
            <div className="summary-card" data-tone="clay">
              <span>Net PnL</span>
              <strong>{formatNumber(latestReport.netPnlAfterFees, 2)}</strong>
              <div className="inline-muted">Drawdown {formatNumber(latestReport.maxDrawdown, 2)}</div>
            </div>
          </div>
        ) : (
          <div className="empty">
            No evaluation reports yet. Runs are being attempted, but failed runs before report creation will not appear here.
          </div>
        )}
        {status?.latestReportsByPair && status.latestReportsByPair.length > 0 ? (
          <table className="table compact">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Status</th>
                <th>Win</th>
                <th>Net PnL</th>
                <th>Trades</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {status.latestReportsByPair.map((entry) => (
                <tr key={`latest-${entry.pair}`}>
                  <td>{entry.pair}</td>
                  <td>{entry.report?.status ?? "—"}</td>
                  <td>{entry.report ? formatNumber(entry.report.winRate, 3) : "—"}</td>
                  <td>{entry.report ? formatNumber(entry.report.netPnlAfterFees, 2) : "—"}</td>
                  <td>{entry.report?.tradeCount ?? "—"}</td>
                  <td>{formatTimestamp(entry.report?.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <h5>Latest run steps</h5>
          <EvaluationExecutionTimeline report={latestExecutionReport} compact />
        </div>
      </div>

      <div>
        <h5>Learning history</h5>
        <div className="learning-history-toolbar">
          <input
            value={historySearchInput}
            onChange={(event) => setHistorySearchInput(event.target.value)}
            placeholder="Search pair, status, version, decision reason..."
          />
          <select
            value={historyStatusFilter}
            onChange={(event) => {
              setHistoryStatusFilter(event.target.value as "" | "running" | "succeeded" | "failed");
              setHistoryPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={historyPairFilter}
            onChange={(event) => {
              setHistoryPairFilter(event.target.value);
              setHistoryPage(1);
            }}
          >
            <option value="">All pairs</option>
            {historyPairOptions.map((option) => (
              <option key={`history-pair-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setHistoryPage(1);
              setHistoryPageSize(5);
            }}
          >
            Latest 5
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryPage(1);
              setHistoryPageSize(25);
            }}
          >
            Full history
          </button>
          <button type="button" onClick={() => setHistoryRefreshNonce((value) => value + 1)}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryPage(1);
              setHistorySearchInput("");
              setHistoryStatusFilter("");
              setHistoryPairFilter("");
            }}
          >
            Reset filters
          </button>
        </div>

        {historyError ? <div className="empty">{historyError}</div> : null}
        {historyLoading && historyRows.length === 0 ? (
          <div className="empty">Loading learning history…</div>
        ) : historyRows.length === 0 ? (
          <div className="empty">No learning updates match the selected filters.</div>
        ) : (
          <>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Pair</th>
                  <th>Version</th>
                  <th>Eval start</th>
                  <th>Eval end</th>
                  <th>Status</th>
                  <th>Eval</th>
                  <th>Win</th>
                  <th>Net PnL</th>
                  <th>Trades</th>
                  <th>Champion PnL</th>
                  <th>PnL Δ</th>
                  <th>Win Δ</th>
                  <th>Decision</th>
                  <th>Why</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>{historyRows.map((update) => renderUpdateRow(update, setSelectedUpdateId))}</tbody>
            </table>
            <PaginationControls
              page={historyPage}
              pageSize={historyPageSize}
              total={historyTotal}
              onPageChange={setHistoryPage}
              onPageSizeChange={(nextSize) => {
                setHistoryPageSize(nextSize);
                setHistoryPage(1);
              }}
            />
          </>
        )}

        {selectedUpdate ? (
          <div className="modal-backdrop" onClick={() => setSelectedUpdateId(null)}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h4>Run details · {selectedUpdate.id.slice(0, 8)}</h4>
                <button type="button" onClick={() => setSelectedUpdateId(null)}>
                  Close
                </button>
              </div>
              <div className="modal-meta">
                <span>Started {formatTimestamp(selectedUpdate.startedAt)}</span>
                <span>Completed {formatTimestamp(selectedUpdate.completedAt)}</span>
                <span>Status {selectedUpdate.status}</span>
              </div>
              <div className="modal-body">
                <div className="inline-muted">
                  Decision{" "}
                  {selectedUpdate.promoted === null || selectedUpdate.promoted === undefined
                    ? "pending"
                    : selectedUpdate.promoted
                      ? "promoted"
                      : "rejected"}
                </div>
                <div className="inline-muted">
                  Reasons{" "}
                  {selectedUpdate.decisionReasons && selectedUpdate.decisionReasons.length > 0
                    ? selectedUpdate.decisionReasons.join(" · ")
                    : "No explicit decision reasons were recorded for this run."}
                </div>
                {selectedUpdate.evaluationReport && !hasExecutionMetadata(selectedUpdate.evaluationReport) ? (
                  <div className="empty">
                    Some steps are marked partial because execution telemetry was not fully recorded for this run.
                  </div>
                ) : null}
                {selectedUpdate.evaluationReport ? (
                  <div style={{ marginTop: 12 }}>
                    <h5>Evaluation steps</h5>
                    <EvaluationExecutionTimeline report={toExecutionInput(selectedUpdate.evaluationReport)} compact />
                  </div>
                ) : (
                  <div className="empty">No evaluation report was attached to this learning update.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
