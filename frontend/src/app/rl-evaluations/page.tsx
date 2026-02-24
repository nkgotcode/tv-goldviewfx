"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import EvaluationReportPanel from "../../components/rl-agent/EvaluationReportPanel";
import EvaluationExecutionTimeline, {
  type EvaluationExecutionInput,
} from "../../components/rl-agent/EvaluationExecutionTimeline";
import NautilusBacktestStatusPanel from "../../components/rl-agent/NautilusBacktestStatusPanel";
import { listAgentVersions, type AgentVersion } from "../../services/rl_agent";
import {
  ApiError,
  listEvaluationReports,
  runEvaluation,
  runEvaluationConfirmHeal,
  type EvaluationReport,
  type EvaluationRequest,
} from "../../services/rl_evaluations";
import { fetchOnlineLearningStatus, type OnlineLearningStatus } from "../../services/rl_ops";

const ALL_PAIRS_OPTION = "__all_pairs__";
const MAX_DERIVED_WINDOW_SIZE = 4096;
const MAX_PERIOD_DAYS = 365;
type NautilusPreset = "quick" | "promotion" | "research";

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

function parseIdentifierCsv(value: string) {
  const tokens = value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tokens));
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
  if (message.includes("Backtest blocked: data gaps detected")) {
    return "Evaluation blocked due to market-data gaps. Confirm heal-and-continue to trigger immediate backfill and rerun.";
  }
  if (message.includes("MAX_PARAMETERS_EXCEEDED")) {
    return "Evaluation window was too large for a single run. Use a shorter period, or keep Auto window enabled so the system uses a safe capped window.";
  }
  if (message.includes("No evaluation windows generated")) {
    return "Evaluation failed because the requested window size is larger than available feature rows for this period. Expand the period range or reduce window size (or enable auto window sizing).";
  }
  if (message.includes("Nautilus backtest did not return a usable PnL metric")) {
    return "Evaluation failed because Nautilus returned incomplete portfolio stats. Verify the run generated closed positions and portfolio PnL metrics.";
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

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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
  const [periodStart, setPeriodStart] = useState(() => toInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toInputValue(new Date()));
  const [interval, setInterval] = useState("5m");
  const [contextIntervals, setContextIntervals] = useState("15m,1h,4h");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [featureSetVersionId, setFeatureSetVersionId] = useState("");
  const [decisionThreshold, setDecisionThreshold] = useState("0.35");
  const [windowSize, setWindowSize] = useState("240");
  const [stride, setStride] = useState("1");
  const [leverage, setLeverage] = useState("");
  const [takerFeeBps, setTakerFeeBps] = useState("");
  const [slippageBps, setSlippageBps] = useState("");
  const [fundingWeight, setFundingWeight] = useState("");
  const [drawdownPenalty, setDrawdownPenalty] = useState("");
  const [fullHistory, setFullHistory] = useState(false);
  const [maxFeatureRows, setMaxFeatureRows] = useState("");
  const [strategyIdsCsv, setStrategyIdsCsv] = useState("");
  const [venueIdsCsv, setVenueIdsCsv] = useState("");
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [useFullWindowSize, setUseFullWindowSize] = useState(false);
  const [nautilusPreset, setNautilusPreset] = useState<NautilusPreset>("quick");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closure deps while preventing re-fetch loops on init
  const versionIdRef = useRef(versionId);
  const selectedReportIdRef = useRef(selectedReportId);
  useEffect(() => { versionIdRef.current = versionId; }, [versionId]);
  useEffect(() => { selectedReportIdRef.current = selectedReportId; }, [selectedReportId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentVersions, evaluationReports, learning] = await Promise.all([
        listAgentVersions(),
        listEvaluationReports("gold-rl-agent", versionIdRef.current || undefined),
        fetchOnlineLearningStatus(1).catch(() => null),
      ]);
      setVersions(agentVersions);
      setReports(evaluationReports);
      setLearningStatus(learning);
      const firstVersion = agentVersions[0];
      if (!versionIdRef.current && firstVersion) {
        versionIdRef.current = firstVersion.id;
        setVersionId(firstVersion.id);
      }
      const firstReport = evaluationReports[0];
      if (!selectedReportIdRef.current && firstReport) {
        selectedReportIdRef.current = firstReport.id;
        setSelectedReportId(firstReport.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluation reports.");
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads latest values via refs

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
  const derivedWindowSize = useMemo(() => {
    if (!fullWindowSizeEstimate) return null;
    return Math.min(fullWindowSizeEstimate, MAX_DERIVED_WINDOW_SIZE);
  }, [fullWindowSizeEstimate]);
  const derivedWindowCapped = Boolean(
    fullWindowSizeEstimate &&
      derivedWindowSize &&
      fullWindowSizeEstimate > derivedWindowSize,
  );
  const selectedPeriodDays = useMemo(() => {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return Math.floor((end - start) / (24 * 60 * 60 * 1000));
  }, [periodEnd, periodStart]);

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
          if (!derivedWindowSize || derivedWindowSize <= 0) {
            throw new Error("Unable to derive full window size. Check period start/end and interval.");
          }
          payload.windowSize = derivedWindowSize;
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
        payload.fullHistory = fullHistory;
        if (!fullHistory && maxFeatureRows.trim()) {
          const parsedMaxFeatureRows = Number(maxFeatureRows);
          if (!Number.isFinite(parsedMaxFeatureRows) || parsedMaxFeatureRows <= 0) {
            throw new Error("Max feature rows must be a positive number.");
          }
          payload.maxFeatureRows = Math.round(parsedMaxFeatureRows);
        }

        const strategyIds = parseIdentifierCsv(strategyIdsCsv);
        if (strategyIds.length > 0 && !strategyIds.includes("all") && !strategyIds.includes("*")) {
          payload.strategyIds = strategyIds;
        }
        const venueIds = parseIdentifierCsv(venueIdsCsv);
        if (venueIds.length > 0 && !venueIds.includes("all") && !venueIds.includes("*")) {
          payload.venueIds = venueIds;
        }

        try {
          await runEvaluation("gold-rl-agent", payload);
        } catch (runError) {
          if (runError instanceof ApiError && runError.code === "DATA_GAP_BLOCKED") {
            const blockingReasons = asStringArray(runError.payload?.blocking_reasons);
            const warnings = asStringArray(runError.payload?.warnings);
            const blockedInterval =
              typeof runError.payload?.interval === "string" ? runError.payload.interval : payload.interval ?? interval;
            const reasonText = blockingReasons.length > 0 ? blockingReasons.join(", ") : "unknown";
            const warningText = warnings.length > 0 ? `\nWarnings: ${warnings.join(", ")}` : "";
            const confirmed = window.confirm(
              `Data gaps detected for ${targetPair} (${blockedInterval}).\nReasons: ${reasonText}${warningText}\n\nHeal now and continue this backtest?`,
            );
            if (!confirmed) {
              throw new Error(`Backtest blocked by data gaps (${reasonText}).`);
            }
            setActionNote(`Healing data gaps for ${targetPair} and continuing backtest…`);
            await runEvaluationConfirmHeal("gold-rl-agent", {
              evaluation: payload,
              heal: {
                confirm: true,
                intervals: [blockedInterval],
                runGapMonitor: true,
              },
            });
          } else {
            throw runError;
          }
        }
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

  const applyNautilusPreset = (preset: NautilusPreset) => {
    const end = new Date();
    const start =
      preset === "quick"
        ? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
        : preset === "promotion"
          ? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
          : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    setPeriodStart(toInputValue(start));
    setPeriodEnd(toInputValue(end));
    setInterval(preset === "research" ? "15m" : "5m");
    setContextIntervals(preset === "research" ? "1h,4h" : "15m,1h,4h");
    setDecisionThreshold("0.35");
    setWindowSize(preset === "quick" ? "240" : preset === "promotion" ? "720" : "1024");
    setStride(preset === "research" ? "2" : "1");
    setLeverage("");
    setTakerFeeBps("");
    setSlippageBps("");
    setFundingWeight("");
    setDrawdownPenalty("");
    setFullHistory(false);
    setMaxFeatureRows("");
    setStrategyIdsCsv("");
    setVenueIdsCsv("");
    setUseFullWindowSize(false);
    setShowAdvancedConfig(preset !== "quick");
    setNautilusPreset(preset);
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
          <p>Pick a Nautilus workflow preset first, then adjust pair/version and time window. Advanced mode is only for manual tuning.</p>
          <div className="detail-grid" style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => applyNautilusPreset("quick")}
              style={{ opacity: nautilusPreset === "quick" ? 1 : 0.72 }}
            >
              Nautilus quick run (7d)
            </button>
            <button
              type="button"
              onClick={() => applyNautilusPreset("promotion")}
              style={{ opacity: nautilusPreset === "promotion" ? 1 : 0.72 }}
            >
              Promotion gate run (30d)
            </button>
            <button
              type="button"
              onClick={() => applyNautilusPreset("research")}
              style={{ opacity: nautilusPreset === "research" ? 1 : 0.72 }}
            >
              Research run (90d)
            </button>
          </div>
          <div className="action-row" style={{ marginBottom: 10 }}>
            <button type="button" onClick={() => applyNautilusPreset("quick")}>
              Reset to quick preset
            </button>
            <button type="button" onClick={() => setShowAdvancedConfig((value) => !value)}>
              {showAdvancedConfig ? "Hide advanced" : "Show advanced"}
            </button>
          </div>
          <div className="empty" style={{ marginBottom: 12 }}>
            Nautilus-safe defaults avoid oversized windows. If you need multi-year analysis, run multiple regime windows instead of one giant run.
          </div>
          {selectedPeriodDays !== null && selectedPeriodDays > MAX_PERIOD_DAYS ? (
            <div className="empty" style={{ marginBottom: 12 }}>
              Selected period is {selectedPeriodDays} days. This is a long research span; use Research preset and keep auto window capped for stable execution.
            </div>
          ) : null}
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
              <span>Auto-size window from period (Nautilus-safe cap)</span>
              <input type="checkbox" checked={useFullWindowSize} onChange={(event) => setUseFullWindowSize(event.target.checked)} />
            </label>
            {useFullWindowSize ? (
              <label>
                Derived window size
                <input value={derivedWindowSize ?? ""} readOnly placeholder="Adjust period/interval to derive" />
              </label>
            ) : null}
            {useFullWindowSize && derivedWindowCapped ? (
              <div className="empty" style={{ marginBottom: 0 }}>
                Auto window capped at {MAX_DERIVED_WINDOW_SIZE} bars (derived {fullWindowSizeEstimate ?? 0}) to prevent oversized parameter payloads.
              </div>
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
                <label className="toggle-row">
                  <span>Use full history rows (disable downsampling)</span>
                  <input type="checkbox" checked={fullHistory} onChange={(event) => setFullHistory(event.target.checked)} />
                </label>
                {!fullHistory ? (
                  <label>
                    Max Feature Rows (optional)
                    <input
                      type="number"
                      min={1}
                      value={maxFeatureRows}
                      placeholder="20000"
                      onChange={(event) => setMaxFeatureRows(event.target.value)}
                    />
                  </label>
                ) : null}
                <label>
                  Strategy IDs (CSV, optional)
                  <input
                    type="text"
                    value={strategyIdsCsv}
                    placeholder="rl_sb3_market or all"
                    onChange={(event) => setStrategyIdsCsv(event.target.value)}
                  />
                </label>
                <label>
                  Venue IDs (CSV, optional)
                  <input
                    type="text"
                    value={venueIdsCsv}
                    placeholder="bingx_margin,bybit_margin,okx_margin or all"
                    onChange={(event) => setVenueIdsCsv(event.target.value)}
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
        <p>Step-by-step trace of dataset preparation, Nautilus backtest execution, and promotion gating.</p>
        <EvaluationExecutionTimeline report={selectedExecutionInput} />
      </section>

      {loading && reports.length === 0 ? <div className="empty">Loading evaluation reports…</div> : null}
    </Layout>
  );
}
