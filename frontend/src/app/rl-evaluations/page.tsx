"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import EvaluationReportPanel from "../../components/rl-agent/EvaluationReportPanel";
import EvaluationExecutionTimeline, {
  type EvaluationExecutionInput,
} from "../../components/rl-agent/EvaluationExecutionTimeline";
import NautilusBacktestStatusPanel from "../../components/rl-agent/NautilusBacktestStatusPanel";
import { listAgentVersions, type AgentVersion } from "../../services/rl_agent";
import {
  listEvaluationReports,
  runEvaluation,
  type EvaluationReport,
  type EvaluationRequest,
} from "../../services/rl_evaluations";
import { fetchOnlineLearningStatus, type OnlineLearningStatus } from "../../services/rl_ops";

const ALL_PAIRS_OPTION = "__all_pairs__";

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(start: string, end: string) {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "—";
  const totalMinutes = Math.round((to - from) / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function normalizePairToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseIntervalCsv(value: string) {
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(tokens));
  const invalid = unique.filter((token) => !/^\d+(m|h|d|w|M)$/.test(token));
  if (invalid.length > 0) {
    throw new Error(`Invalid interval(s): ${invalid.join(", ")}`);
  }
  return unique;
}

function parseIntervalToMinutes(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const amountRaw = match[1];
  const unit = match[2];
  if (!amountRaw || !unit) return null;
  const amount = Number.parseInt(amountRaw, 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "m") return amount;
  if (unit === "h") return amount * 60;
  if (unit === "d") return amount * 24 * 60;
  return null;
}

function toFriendlyEvaluationError(message: string) {
  if (message.includes("No trades available for fold")) {
    return "Evaluation failed because one walk-forward fold had zero trades. Try a longer period (for example 7 days), use 5m/15m interval, or set Walk Forward to disabled in Advanced settings.";
  }
  if (message.includes("No features available for dataset window")) {
    return "Evaluation failed because no usable features were built for this window. Expand the time range and keep interval/context intervals aligned with available market data.";
  }
  if (message.includes("dataset_features are required")) {
    return "Evaluation failed because feature inputs were empty. Use default feature settings or run with a wider period window.";
  }
  return message;
}

function toBingxSymbolToken(pair: string) {
  const token = normalizePairToken(pair);
  if (token === "GOLDUSDT" || token === "GOLD" || token === "XAUTUSDT") return "XAUTUSDT";
  if (token === "PAXGUSDT") return "PAXGUSDT";
  return token;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractDataFields(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const candidates: unknown[] = [
    metadata.feature_columns,
    metadata.featureColumns,
    metadata.data_fields,
    metadata.dataFields,
    metadata.feature_names,
    metadata.featureNames,
    metadata.dataset_features,
    metadata.datasetFeatures,
  ];
  const fields = new Set<string>();
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === "string" && item.trim()) {
        fields.add(item.trim());
        continue;
      }
      const record = asRecord(item);
      if (!record) continue;
      const nameLike = [record.name, record.field, record.feature, record.key];
      for (const value of nameLike) {
        if (typeof value === "string" && value.trim()) {
          fields.add(value.trim());
        }
      }
    }
  }
  return [...fields];
}

function extractDataSources(metadata: Record<string, unknown> | null) {
  if (!metadata) return [] as Array<{ source: string; rows: number; pairs: string[] }>;
  const provenance = asRecord(metadata.dataset_provenance) ?? asRecord(metadata.datasetProvenance);
  const sources = provenance?.dataSources ?? provenance?.data_sources;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const source = typeof record.source === "string" ? record.source : "";
      const rows = Number(record.rows ?? 0);
      const pairs = Array.isArray(record.pairs) ? record.pairs.filter((value): value is string => typeof value === "string") : [];
      if (!source || !Number.isFinite(rows)) return null;
      return { source, rows, pairs };
    })
    .filter((value): value is { source: string; rows: number; pairs: string[] } => value !== null);
}

function buildRunParams(report: EvaluationReport | null): Record<string, unknown> {
  if (!report) return {};
  const params: Record<string, unknown> = {};
  params.agentVersionId = report.agent_version_id;
  params.pair = report.pair;
  params.periodStart = report.period_start;
  params.periodEnd = report.period_end;
  if (report.dataset_version_id) params.datasetVersionId = report.dataset_version_id;
  if (report.feature_set_version_id) params.featureSetVersionId = report.feature_set_version_id;
  if (report.dataset_hash) params.datasetHash = report.dataset_hash;
  if (report.backtest_run_id) params.backtestRunId = report.backtest_run_id;
  if (report.artifact_uri) params.artifactUri = report.artifact_uri;

  const metadata = asRecord(report.metadata);
  const metadataParams =
    asRecord(metadata?.parameters) ?? asRecord(metadata?.params) ?? asRecord(metadata?.request) ?? asRecord(metadata?.config);
  if (metadataParams) {
    for (const [key, value] of Object.entries(metadataParams)) {
      if (value === null || value === undefined) continue;
      params[key] = value;
    }
  }

  return params;
}

export default function RlEvaluationsPage() {
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [learningStatus, setLearningStatus] = useState<OnlineLearningStatus | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [pair, setPair] = useState<string>(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [versionId, setVersionId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(() => toInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toInputValue(new Date()));
  const [interval, setInterval] = useState("1m");
  const [contextIntervals, setContextIntervals] = useState("5m,15m,1h");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [featureSetVersionId, setFeatureSetVersionId] = useState("");
  const [decisionThreshold, setDecisionThreshold] = useState("");
  const [windowSize, setWindowSize] = useState("");
  const [stride, setStride] = useState("");
  const [leverage, setLeverage] = useState("");
  const [takerFeeBps, setTakerFeeBps] = useState("");
  const [slippageBps, setSlippageBps] = useState("");
  const [fundingWeight, setFundingWeight] = useState("");
  const [drawdownPenalty, setDrawdownPenalty] = useState("");
  const [walkForwardMode, setWalkForwardMode] = useState<"default" | "enabled" | "disabled">("default");
  const [walkForwardFolds, setWalkForwardFolds] = useState("4");
  const [walkForwardPurgeBars, setWalkForwardPurgeBars] = useState("0");
  const [walkForwardEmbargoBars, setWalkForwardEmbargoBars] = useState("0");
  const [walkForwardMinTrainBars, setWalkForwardMinTrainBars] = useState("");
  const [walkForwardStrict, setWalkForwardStrict] = useState(true);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [useFullWindowSize, setUseFullWindowSize] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentVersions, evaluationReports, learning] = await Promise.all([
        listAgentVersions(),
        listEvaluationReports("gold-rl-agent", versionId || undefined),
        fetchOnlineLearningStatus(1).catch(() => null),
      ]);
      setVersions(agentVersions);
      setReports(evaluationReports);
      setLearningStatus(learning);
      const firstVersion = agentVersions[0];
      if (!versionId && firstVersion) {
        setVersionId(firstVersion.id);
      }
      const firstReport = evaluationReports[0];
      if (!selectedReportId && firstReport) {
        setSelectedReportId(firstReport.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluation reports.");
    } finally {
      setLoading(false);
    }
  }, [selectedReportId, versionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );

  const selectedMetadata = useMemo(() => asRecord(selectedReport?.metadata ?? null), [selectedReport]);
  const selectedRunParams = useMemo(() => buildRunParams(selectedReport), [selectedReport]);
  const selectedDataFields = useMemo(() => extractDataFields(selectedMetadata), [selectedMetadata]);
  const selectedDataSources = useMemo(() => extractDataSources(selectedMetadata), [selectedMetadata]);
  const selectedExecutionInput = useMemo<EvaluationExecutionInput | null>(() => {
    if (!selectedReport) return null;
    return {
      pair: selectedReport.pair,
      periodStart: selectedReport.period_start,
      periodEnd: selectedReport.period_end,
      status: selectedReport.status,
      winRate: selectedReport.win_rate,
      netPnlAfterFees: selectedReport.net_pnl_after_fees,
      maxDrawdown: selectedReport.max_drawdown,
      tradeCount: selectedReport.trade_count,
      backtestRunId: selectedReport.backtest_run_id,
      metadata: selectedReport.metadata ?? null,
    };
  }, [selectedReport]);
  const selectedParameters = useMemo(
    () =>
      asRecord(selectedMetadata?.parameters) ??
      asRecord(selectedMetadata?.params) ??
      asRecord(selectedMetadata?.request) ??
      asRecord(selectedMetadata?.config),
    [selectedMetadata],
  );
  const fullWindowSizeEstimate = useMemo(() => {
    const intervalMinutes = parseIntervalToMinutes(interval);
    if (!intervalMinutes) return null;
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return Math.max(1, Math.floor((end - start) / (intervalMinutes * 60_000)));
  }, [interval, periodEnd, periodStart]);

  const handleRunEvaluation = async () => {
    setActionLoading(true);
    setActionNote(null);
    setError(null);
    try {
      const periodStartIso = new Date(periodStart).toISOString();
      const periodEndIso = new Date(periodEnd).toISOString();
      if (new Date(periodEndIso).getTime() <= new Date(periodStartIso).getTime()) {
        throw new Error("Period end must be after period start.");
      }

      const targetPairs =
        pair === ALL_PAIRS_OPTION
          ? ALL_PAIRS.filter((candidate, index, list) => {
              const symbolToken = toBingxSymbolToken(candidate);
              return list.findIndex((item) => toBingxSymbolToken(item) === symbolToken) === index;
            })
          : [pair];
      if (targetPairs.length === 0) {
        throw new Error("No pairs available for evaluation.");
      }

      for (const [index, targetPair] of targetPairs.entries()) {
        setActionNote(`Running ${index + 1}/${targetPairs.length}: ${targetPair}`);
        const payload: EvaluationRequest = {
          pair: targetPair,
          periodStart: periodStartIso,
          periodEnd: periodEndIso,
          interval,
        };
        const parsedContextIntervals = parseIntervalCsv(contextIntervals);
        if (parsedContextIntervals.length > 0) {
          payload.contextIntervals = parsedContextIntervals.filter((candidate) => candidate !== interval);
        }
        if (versionId) payload.agentVersionId = versionId;
        if (datasetVersionId.trim()) payload.datasetVersionId = datasetVersionId.trim();
        if (featureSetVersionId.trim()) payload.featureSetVersionId = featureSetVersionId.trim();

        if (decisionThreshold.trim()) {
          const parsedThreshold = Number(decisionThreshold);
          if (!Number.isFinite(parsedThreshold)) {
            throw new Error("Decision threshold must be numeric.");
          }
          payload.decisionThreshold = parsedThreshold;
        }

        if (useFullWindowSize) {
          if (!fullWindowSizeEstimate || fullWindowSizeEstimate <= 0) {
            throw new Error("Unable to derive full window size. Check period start/end and interval.");
          }
          payload.windowSize = fullWindowSizeEstimate;
        } else if (windowSize.trim()) {
          const parsedWindowSize = Number(windowSize);
          if (!Number.isFinite(parsedWindowSize) || parsedWindowSize <= 0) {
            throw new Error("Window size must be a positive number.");
          }
          payload.windowSize = Math.round(parsedWindowSize);
        }

        if (stride.trim()) {
          const parsedStride = Number(stride);
          if (!Number.isFinite(parsedStride) || parsedStride <= 0) {
            throw new Error("Stride must be a positive number.");
          }
          payload.stride = Math.round(parsedStride);
        }

        if (leverage.trim()) {
          const parsedLeverage = Number(leverage);
          if (!Number.isFinite(parsedLeverage) || parsedLeverage <= 0) {
            throw new Error("Leverage must be a positive number.");
          }
          payload.leverage = parsedLeverage;
        }

        if (takerFeeBps.trim()) {
          const parsedTakerFeeBps = Number(takerFeeBps);
          if (!Number.isFinite(parsedTakerFeeBps) || parsedTakerFeeBps < 0) {
            throw new Error("Taker fee must be zero or positive.");
          }
          payload.takerFeeBps = parsedTakerFeeBps;
        }

        if (slippageBps.trim()) {
          const parsedSlippageBps = Number(slippageBps);
          if (!Number.isFinite(parsedSlippageBps) || parsedSlippageBps < 0) {
            throw new Error("Slippage must be zero or positive.");
          }
          payload.slippageBps = parsedSlippageBps;
        }

        if (fundingWeight.trim()) {
          const parsedFundingWeight = Number(fundingWeight);
          if (!Number.isFinite(parsedFundingWeight) || parsedFundingWeight < 0) {
            throw new Error("Funding weight must be zero or positive.");
          }
          payload.fundingWeight = parsedFundingWeight;
        }

        if (drawdownPenalty.trim()) {
          const parsedDrawdownPenalty = Number(drawdownPenalty);
          if (!Number.isFinite(parsedDrawdownPenalty) || parsedDrawdownPenalty < 0) {
            throw new Error("Drawdown penalty must be zero or positive.");
          }
          payload.drawdownPenalty = parsedDrawdownPenalty;
        }

        if (walkForwardMode !== "default") {
          if (walkForwardMode === "disabled") {
            payload.walkForward = {
              folds: 1,
              purgeBars: 0,
              embargoBars: 0,
              strict: false,
            };
          } else {
            const folds = Number(walkForwardFolds || "4");
            const purgeBars = Number(walkForwardPurgeBars || "0");
            const embargoBars = Number(walkForwardEmbargoBars || "0");
            const minTrainBarsRaw = walkForwardMinTrainBars.trim();
            if (!Number.isFinite(folds) || folds < 1 || folds > 24) {
              throw new Error("Walk-forward folds must be between 1 and 24.");
            }
            if (!Number.isFinite(purgeBars) || purgeBars < 0) {
              throw new Error("Walk-forward purge bars must be zero or positive.");
            }
            if (!Number.isFinite(embargoBars) || embargoBars < 0) {
              throw new Error("Walk-forward embargo bars must be zero or positive.");
            }
            payload.walkForward = {
              folds: Math.round(folds),
              purgeBars: Math.round(purgeBars),
              embargoBars: Math.round(embargoBars),
              strict: walkForwardStrict,
            };
            if (minTrainBarsRaw) {
              const minTrainBars = Number(minTrainBarsRaw);
              if (!Number.isFinite(minTrainBars) || minTrainBars <= 0) {
                throw new Error("Walk-forward min train bars must be a positive number.");
              }
              payload.walkForward.minTrainBars = Math.round(minTrainBars);
            }
          }
        }

        await runEvaluation("gold-rl-agent", payload);
      }
      setActionNote(`Completed ${targetPairs.length} evaluation run(s).`);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run evaluation.";
      setError(toFriendlyEvaluationError(message));
    } finally {
      setActionLoading(false);
    }
  };

  const applyQuickSetup = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    setPeriodStart(toInputValue(start));
    setPeriodEnd(toInputValue(end));
    setInterval("5m");
    setContextIntervals("15m,1h,4h");
    setDecisionThreshold("");
    setWindowSize("");
    setStride("");
    setLeverage("");
    setTakerFeeBps("");
    setSlippageBps("");
    setFundingWeight("");
    setDrawdownPenalty("");
    setWalkForwardMode("default");
    setWalkForwardFolds("4");
    setWalkForwardPurgeBars("0");
    setWalkForwardEmbargoBars("0");
    setWalkForwardMinTrainBars("");
    setWalkForwardStrict(true);
    setUseFullWindowSize(false);
  };

  return (
    <Layout>
      <section className="hero">
        <h1>Evaluation Command</h1>
        <p>
          Run historical evaluations before promoting a model to live trading. Review win rate,
          drawdown, and net PnL for each evaluation window.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}
      {actionNote ? <div className="empty">{actionNote}</div> : null}

      <NautilusBacktestStatusPanel
        status={learningStatus}
        latestBacktestRunId={selectedReport?.backtest_run_id ?? null}
        title="Where Nautilus backtesting is shown"
        description="Nautilus runs are attached to evaluation reports as backtest_run_id. Use this summary plus execution timelines below to verify backtesting is active and recorded."
      />

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Reports</span>
          <strong>{reports.length}</strong>
          <div className="inline-muted">Evaluation runs</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Selected</span>
          <strong>{selectedReport?.status ?? "—"}</strong>
          <div className="inline-muted">{selectedReport?.pair ?? "No report"}</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Win Rate</span>
          <strong>{selectedReport ? `${(selectedReport.win_rate * 100).toFixed(1)}%` : "—"}</strong>
          <div className="inline-muted">Latest evaluation</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Version</span>
          <strong>{versionId || "—"}</strong>
          <div className="inline-muted">Active selection</div>
        </div>
      </section>

      <section className="rl-grid">
        <div className="table-card">
          <h3>Run Evaluation</h3>
          <p>Basic mode is usually enough: pick pair/version and time window, then run. Advanced mode is for walk-forward and cost-model tuning.</p>
          <div className="action-row" style={{ marginBottom: 10 }}>
            <button type="button" onClick={applyQuickSetup}>
              Quick setup (recommended)
            </button>
            <button type="button" onClick={() => setShowAdvancedConfig((value) => !value)}>
              {showAdvancedConfig ? "Hide advanced" : "Show advanced"}
            </button>
          </div>
          <div className="empty" style={{ marginBottom: 12 }}>
            If you hit "No trades available for fold 1", widen period to 7d+, use 5m/15m candles, or disable Walk Forward in advanced settings.
          </div>
          <div className="form-grid">
            <label>
              Pair target
              <select value={pair} onChange={(event) => setPair(event.target.value)}>
                <option value={ALL_PAIRS_OPTION}>All pairs</option>
                {ALL_PAIRS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model version
              <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name ?? version.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Period Start
              <input type="datetime-local" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </label>
            <label>
              Period End
              <input type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </label>
            <label>
              Candle Interval
              <select value={interval} onChange={(event) => setInterval(event.target.value)}>
                {["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decision Threshold (optional)
              <input
                type="number"
                step="0.01"
                value={decisionThreshold}
                placeholder="0.50"
                onChange={(event) => setDecisionThreshold(event.target.value)}
              />
            </label>
            <label className="toggle-row">
              <span>Use full period as window size</span>
              <input type="checkbox" checked={useFullWindowSize} onChange={(event) => setUseFullWindowSize(event.target.checked)} />
            </label>
            {useFullWindowSize ? (
              <label>
                Derived window size
                <input value={fullWindowSizeEstimate ?? ""} readOnly placeholder="Adjust period/interval to derive" />
              </label>
            ) : null}
            {showAdvancedConfig ? (
              <>
                <label>
                  Context Intervals (CSV)
                  <input
                    type="text"
                    value={contextIntervals}
                    placeholder="15m,1h,4h"
                    onChange={(event) => setContextIntervals(event.target.value)}
                  />
                </label>
                <label>
                  Dataset Version (optional)
                  <input
                    type="text"
                    value={datasetVersionId}
                    placeholder="dataset version id"
                    onChange={(event) => setDatasetVersionId(event.target.value)}
                  />
                </label>
                <label>
                  Feature Set Version (optional)
                  <input
                    type="text"
                    value={featureSetVersionId}
                    placeholder="feature set version id"
                    onChange={(event) => setFeatureSetVersionId(event.target.value)}
                  />
                </label>
                {!useFullWindowSize ? (
                  <label>
                    Window Size (optional)
                    <input
                      type="number"
                      min={1}
                      value={windowSize}
                      placeholder="30"
                      onChange={(event) => setWindowSize(event.target.value)}
                    />
                  </label>
                ) : null}
                <label>
                  Stride (optional)
                  <input
                    type="number"
                    min={1}
                    value={stride}
                    placeholder="1"
                    onChange={(event) => setStride(event.target.value)}
                  />
                </label>
                <label>
                  Walk Forward
                  <select value={walkForwardMode} onChange={(event) => setWalkForwardMode(event.target.value as typeof walkForwardMode)}>
                    <option value="default">Use backend default</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <label>
                  Leverage (optional)
                  <input type="number" min={0.01} step="0.01" value={leverage} onChange={(event) => setLeverage(event.target.value)} />
                </label>
                <label>
                  Taker Fee Bps (optional)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={takerFeeBps}
                    onChange={(event) => setTakerFeeBps(event.target.value)}
                  />
                </label>
                <label>
                  Slippage Bps (optional)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={slippageBps}
                    onChange={(event) => setSlippageBps(event.target.value)}
                  />
                </label>
                <label>
                  Funding Weight (optional)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={fundingWeight}
                    onChange={(event) => setFundingWeight(event.target.value)}
                  />
                </label>
                <label>
                  Drawdown Penalty (optional)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={drawdownPenalty}
                    onChange={(event) => setDrawdownPenalty(event.target.value)}
                  />
                </label>
                <label>
                  WF Folds
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={walkForwardFolds}
                    onChange={(event) => setWalkForwardFolds(event.target.value)}
                  />
                </label>
                <label>
                  WF Purge Bars
                  <input
                    type="number"
                    min={0}
                    value={walkForwardPurgeBars}
                    onChange={(event) => setWalkForwardPurgeBars(event.target.value)}
                  />
                </label>
                <label>
                  WF Embargo Bars
                  <input
                    type="number"
                    min={0}
                    value={walkForwardEmbargoBars}
                    onChange={(event) => setWalkForwardEmbargoBars(event.target.value)}
                  />
                </label>
                <label>
                  WF Min Train Bars (optional)
                  <input
                    type="number"
                    min={1}
                    value={walkForwardMinTrainBars}
                    onChange={(event) => setWalkForwardMinTrainBars(event.target.value)}
                  />
                </label>
                <label className="toggle-row">
                  <span>WF Strict Mode</span>
                  <input
                    type="checkbox"
                    checked={walkForwardStrict}
                    onChange={(event) => setWalkForwardStrict(event.target.checked)}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="action-row">
            <button type="button" onClick={handleRunEvaluation} disabled={actionLoading || loading}>
              {actionLoading ? "Running…" : "Run Evaluation"}
            </button>
          </div>
        </div>

        <div className="table-card">
          <h3>Evaluation Details</h3>
          <p>Inspect the selected report for risk, performance, and exposure breakdown.</p>
          <EvaluationReportPanel report={selectedReport} />
        </div>
      </section>

      <section className="table-card">
        <h3>Evaluation History</h3>
        <p>Most recent evaluation runs for the selected agent version. Select any row to inspect full run details.</p>
        {reports.length === 0 ? (
          <div className="empty">
            No evaluation reports available yet. Run one evaluation from the panel above. If it fails, the error banner explains what to adjust.
          </div>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Backtest</th>
                <th>Pair</th>
                <th>Period</th>
                <th>Duration</th>
                <th>Win Rate</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const active = report.id === selectedReport?.id;
                return (
                  <tr
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    style={{ cursor: "pointer", outline: active ? "1px solid rgba(94, 234, 212, 0.4)" : "none" }}
                  >
                    <td>{formatDate(report.created_at)}</td>
                    <td>
                      <span className="badge">{report.status}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${report.backtest_run_id ? "status-ok" : "status-warn"}`}>
                        {report.backtest_run_id ? "recorded" : "missing"}
                      </span>
                    </td>
                    <td>{report.pair}</td>
                    <td>
                      {formatDate(report.period_start)} - {formatDate(report.period_end)}
                    </td>
                    <td>{formatDuration(report.period_start, report.period_end)}</td>
                    <td>{(report.win_rate * 100).toFixed(1)}%</td>
                    <td>{report.trade_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="table-card">
        <h3>Selected Run Metadata</h3>
        <p>Requested vs resolved ticker, Nautilus settings, data fields, and backtest metadata for this run.</p>
        {!selectedReport ? (
          <div className="empty">Select an evaluation run from history.</div>
        ) : (
          <>
            <div className="detail-grid">
              <div>
                <span>Requested Pair</span>
                <strong>{selectedReport.pair}</strong>
              </div>
              <div>
                <span>Resolved Ticker</span>
                <strong>
                  {(typeof selectedParameters?.resolvedPair === "string" && selectedParameters.resolvedPair) ||
                    selectedReport.pair}
                </strong>
              </div>
              <div>
                <span>Resolved BingX Symbol</span>
                <strong>
                  {(typeof selectedParameters?.resolvedBingxSymbol === "string" && selectedParameters.resolvedBingxSymbol) ||
                    "—"}
                </strong>
              </div>
              <div>
                <span>Interval Used</span>
                <strong>{(typeof selectedParameters?.interval === "string" && selectedParameters.interval) || "1m"}</strong>
              </div>
              <div>
                <span>Backtest Window</span>
                <strong>
                  {formatDate(selectedReport.period_start)} - {formatDate(selectedReport.period_end)}
                </strong>
              </div>
              <div>
                <span>Backtest Duration</span>
                <strong>{formatDuration(selectedReport.period_start, selectedReport.period_end)}</strong>
              </div>
              <div>
                <span>Dataset Version</span>
                <strong className="mono">{selectedReport.dataset_version_id ?? "—"}</strong>
              </div>
              <div>
                <span>Feature Set Version</span>
                <strong className="mono">{selectedReport.feature_set_version_id ?? "—"}</strong>
              </div>
              <div>
                <span>Backtest Run Id</span>
                <strong className="mono">{selectedReport.backtest_run_id ?? "—"}</strong>
              </div>
              <div>
                <span>Artifact</span>
                <strong className="mono">{selectedReport.artifact_uri ?? "—"}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Data Fields Used</span>
                <strong>{selectedDataFields.length > 0 ? selectedDataFields.join(", ") : "No data fields recorded in metadata."}</strong>
              </div>
              <div className="detail-grid-span">
                <span>Data Sources Used</span>
                <strong>
                  {selectedDataSources.length > 0
                    ? selectedDataSources
                        .map((source) =>
                          source.pairs.length > 0
                            ? `${source.source} [${source.pairs.join(", ")}] (${source.rows} rows)`
                            : `${source.source} (${source.rows} rows)`,
                        )
                        .join(", ")
                    : "No source table metadata recorded."}
                </strong>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <span style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
                Run Parameters
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(2, 6, 23, 0.45)",
                  overflowX: "auto",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(selectedRunParams, null, 2)}
              </pre>
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={{ display: "block", marginBottom: 6, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.75 }}>
                Raw Metadata
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(2, 6, 23, 0.45)",
                  overflowX: "auto",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(selectedMetadata ?? {}, null, 2)}
              </pre>
            </div>
          </>
        )}
      </section>

      <section className="table-card">
        <h3>Execution Timeline</h3>
        <p>Step-by-step trace of dataset preparation, walk-forward scoring, Nautilus backtest execution, and promotion gating.</p>
        <EvaluationExecutionTimeline report={selectedExecutionInput} />
      </section>

      {loading && reports.length === 0 ? <div className="empty">Loading evaluation reports…</div> : null}
    </Layout>
  );
}
