"use client";

import { useEffect, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import type { OnlineLearningRunRequest, OnlineLearningStatus, OnlineLearningUpdate } from "../../services/rl_ops";

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

function statusTone(status?: string | null) {
  if (!status) return "status-muted";
  if (status === "pass" || status === "succeeded") return "status-ok";
  if (status === "fail" || status === "failed") return "status-bad";
  if (status === "running") return "status-warn";
  return "status-muted";
}

function renderUpdateRow(update: OnlineLearningUpdate) {
  const report = update.evaluationReport;
  const champion = update.championEvaluationReport;
  const netDelta = update.metricDeltas?.netPnlDelta;
  const winDelta = update.metricDeltas?.winRateDelta;
  return (
    <tr key={update.id}>
      <td>{formatTimestamp(update.startedAt)}</td>
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
    </tr>
  );
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
  const [pair, setPair] = useState(config?.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT");
  const [interval, setInterval] = useState(config?.interval ?? "1m");
  const [contextIntervalsCsv, setContextIntervalsCsv] = useState((config?.contextIntervals ?? []).join(","));
  const [trainWindowMin, setTrainWindowMin] = useState(String(config?.trainWindowMin ?? 360));
  const [evalWindowMin, setEvalWindowMin] = useState(String(config?.evalWindowMin ?? 120));
  const [evalLagMin, setEvalLagMin] = useState(String(config?.evalLagMin ?? 1));
  const [windowSize, setWindowSize] = useState(String(config?.windowSize ?? 30));
  const [stride, setStride] = useState(String(config?.stride ?? 1));
  const [timesteps, setTimesteps] = useState(String(config?.timesteps ?? 500));
  const [decisionThreshold, setDecisionThreshold] = useState(String(config?.decisionThreshold ?? 0.2));
  const [autoRollForward, setAutoRollForward] = useState(Boolean(config?.autoRollForward ?? true));
  const [minWinRate, setMinWinRate] = useState(String(config?.minWinRate ?? 0.55));
  const [minNetPnl, setMinNetPnl] = useState(String(config?.minNetPnl ?? 0));
  const [maxDrawdown, setMaxDrawdown] = useState(String(config?.maxDrawdown ?? 0.25));
  const [minTradeCount, setMinTradeCount] = useState(String(config?.minTradeCount ?? 20));
  const [minWinRateDelta, setMinWinRateDelta] = useState(String(config?.minWinRateDelta ?? 0));
  const [minNetPnlDelta, setMinNetPnlDelta] = useState(String(config?.minNetPnlDelta ?? 0));
  const [maxDrawdownDelta, setMaxDrawdownDelta] = useState(String(config?.maxDrawdownDelta ?? 0.05));
  const [minTradeCountDelta, setMinTradeCountDelta] = useState(String(config?.minTradeCountDelta ?? -5));

  useEffect(() => {
    if (!config) return;
    setPair(config.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT");
    setInterval(config.interval ?? "1m");
    setContextIntervalsCsv((config.contextIntervals ?? []).join(","));
    setTrainWindowMin(String(config.trainWindowMin ?? 360));
    setEvalWindowMin(String(config.evalWindowMin ?? 120));
    setEvalLagMin(String(config.evalLagMin ?? 1));
    setWindowSize(String(config.windowSize ?? 30));
    setStride(String(config.stride ?? 1));
    setTimesteps(String(config.timesteps ?? 500));
    setDecisionThreshold(String(config.decisionThreshold ?? 0.2));
    setAutoRollForward(Boolean(config.autoRollForward ?? true));
    setMinWinRate(String(config.minWinRate ?? 0.55));
    setMinNetPnl(String(config.minNetPnl ?? 0));
    setMaxDrawdown(String(config.maxDrawdown ?? 0.25));
    setMinTradeCount(String(config.minTradeCount ?? 20));
    setMinWinRateDelta(String(config.minWinRateDelta ?? 0));
    setMinNetPnlDelta(String(config.minNetPnlDelta ?? 0));
    setMaxDrawdownDelta(String(config.maxDrawdownDelta ?? 0.05));
    setMinTradeCountDelta(String(config.minTradeCountDelta ?? -5));
  }, [config]);

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
    const payload: OnlineLearningRunRequest = {
      pair,
      interval: interval.trim() || undefined,
      contextIntervalsCsv: contextIntervalsCsv.trim() || undefined,
      trainWindowMin: parseOptionalInt(trainWindowMin),
      evalWindowMin: parseOptionalInt(evalWindowMin),
      evalLagMin: parseOptionalInt(evalLagMin),
      windowSize: parseOptionalInt(windowSize),
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
        Pair {config?.pair ?? ALL_PAIRS[0] ?? "XAUTUSDT"} · Window size {config?.windowSize ?? "—"} · Timesteps{" "}
        {config?.timesteps ?? "—"} · RL service {status?.rlService?.mock ? "mock" : "live"}
      </div>
      <div className="inline-muted">
        Context intervals: {(config?.contextIntervals ?? []).join(", ") || "none"} · Delta gates: Win Δ{" "}
        {formatNumber(config?.minWinRateDelta, 3)} · PnL Δ {formatNumber(config?.minNetPnlDelta, 2)} · Drawdown Δ{" "}
        {formatNumber(config?.maxDrawdownDelta, 3)}
      </div>
      <div className="inline-muted">
        Leverage x{formatNumber(config?.leverageDefault, 2)} · Fees {formatNumber(config?.takerFeeBps, 2)} bps ·
        Slippage {formatNumber(config?.slippageBps, 2)} bps · Funding weight {formatNumber(config?.fundingWeight, 2)} ·
        Feedback rounds {config?.feedbackRounds ?? "—"} ({config?.feedbackTimesteps ?? "—"} steps, hard ratio{" "}
        {formatNumber(config?.feedbackHardRatio, 2)})
      </div>

      <div>
        <h5>Run with overrides</h5>
        <div className="form-grid">
          <label>
            Pair
            <select value={pair} onChange={(event) => setPair(event.target.value)}>
              {ALL_PAIRS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Primary interval
            <input value={interval} onChange={(event) => setInterval(event.target.value)} placeholder="1m" />
          </label>
          <label>
            Context intervals CSV
            <input
              value={contextIntervalsCsv}
              onChange={(event) => setContextIntervalsCsv(event.target.value)}
              placeholder="5m,15m,1h"
            />
          </label>
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
            Window size
            <input value={windowSize} onChange={(event) => setWindowSize(event.target.value)} />
          </label>
          <label>
            Stride
            <input value={stride} onChange={(event) => setStride(event.target.value)} />
          </label>
          <label>
            Timesteps
            <input value={timesteps} onChange={(event) => setTimesteps(event.target.value)} />
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
          <div className="empty">No evaluation reports yet.</div>
        )}
      </div>

      {updates.length === 0 ? (
        <div className="empty">No learning updates recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Started</th>
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
            </tr>
          </thead>
          <tbody>{updates.map(renderUpdateRow)}</tbody>
        </table>
      )}
      {updates.some((update) => (update.decisionReasons ?? []).length > 0) ? (
        <div>
          <h5>Latest rejection reasons</h5>
          {updates.slice(0, 3).map((update) => {
            if (!update.decisionReasons || update.decisionReasons.length === 0) return null;
            return (
              <div key={`${update.id}-reasons`} className="inline-muted">
                {formatTimestamp(update.startedAt)}: {update.decisionReasons.join(", ")}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
