"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import { listAgentVersions, type AgentVersion } from "../../services/rl_agent";
import {
  ApiError,
  listEvaluationReports,
  runEvaluation,
  runEvaluationConfirmHeal,
  type EvaluationReport,
  type EvaluationRequest,
} from "../../services/rl_evaluations";
import {
  fetchDataGapHealth,
  fetchOnlineLearningStatus,
  type DataGapHealth,
  type OnlineLearningStatus,
} from "../../services/rl_ops";

const AGENT_ID = "gold-rl-agent";
const DEFAULT_STRATEGIES = ["ema_trend", "bollinger_mean_rev", "funding_overlay"];
const DEFAULT_VENUES = ["bingx_margin"];
const GAP_HEALTH_POLL_MS = 15000;
const STRATEGY_OPTIONS = [
  { id: "ema_trend", label: "EMA Trend" },
  { id: "bollinger_mean_rev", label: "Bollinger Mean Reversion" },
  { id: "funding_overlay", label: "Funding Overlay" },
  { id: "rl_sb3_market", label: "RL SB3 Market" },
];
const VENUE_OPTIONS = [
  { id: "bingx_margin", label: "BingX Margin" },
  { id: "bybit_margin", label: "Bybit Margin" },
  { id: "okx_margin", label: "OKX Margin" },
];
const BACKTEST_REPORT_PAGE_SIZE = 20;

type StepStatus = "ok" | "warn";

type MatrixSummary = {
  strategies: string[];
  venues: string[];
  walkForwardEnabled: boolean;
  walkForwardFolds: number;
  foldPassCount: number;
  foldTotalCount: number;
};

type FailureSummary = {
  reason: string;
  recommendation: string;
  details: string[];
};

type CachedReportPageState = {
  reports: EvaluationReport[];
  offset: number;
  hasMore: boolean;
};

const REPORT_CACHE_KEY_ALL = "__latest__";

function buildReportCacheKey(versionId?: string) {
  return versionId && versionId.length > 0 ? versionId : REPORT_CACHE_KEY_ALL;
}

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseCsv(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function formatGapDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function reportMatrix(report: EvaluationReport): MatrixSummary {
  const metadata = asRecord(report.metadata);
  const matrix = asRecord(metadata?.strategy_matrix);
  const walkForward = asRecord(metadata?.walk_forward);
  const strategies =
    asStringArray(matrix?.resolved_strategy_ids) ||
    asStringArray(matrix?.requested_strategy_ids) ||
    [];
  const venues =
    asStringArray(matrix?.resolved_venue_ids) || asStringArray(matrix?.requested_venue_ids) || [];
  const requestedWalkForward = asRecord(walkForward?.requested);
  const foldMetrics = Array.isArray(metadata?.fold_metrics) ? metadata.fold_metrics : [];
  const foldTotalCount = foldMetrics.length;
  const foldPassCount = foldMetrics.filter((item) => asRecord(item)?.status === "pass").length;
  const ignored = Boolean(walkForward?.ignored);
  const foldsRaw = requestedWalkForward?.folds;
  const folds = typeof foldsRaw === "number" && Number.isFinite(foldsRaw) ? foldsRaw : 0;
  return {
    strategies,
    venues,
    walkForwardEnabled: !ignored && folds > 0,
    walkForwardFolds: folds,
    foldPassCount,
    foldTotalCount,
  };
}

function toSentence(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function failureSummary(report: EvaluationReport): FailureSummary {
  const metadata = asRecord(report.metadata);
  const nautilus = asRecord(metadata?.nautilus);
  const metrics = asRecord(nautilus?.metrics);
  const walkForwardMeta = asRecord(metadata?.walk_forward);
  const walkForwardEnabled = Boolean(walkForwardMeta && walkForwardMeta.ignored === false);
  const foldMetrics = Array.isArray(metadata?.fold_metrics) ? metadata.fold_metrics : [];
  const intervalMatrix = asRecord(metrics?.interval_matrix);
  const intervalResults = Array.isArray(intervalMatrix?.results) ? intervalMatrix.results : [];
  const failedIntervalResults = intervalResults
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null && entry.status === "fail");
  const failedFolds = foldMetrics
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null && entry.status === "fail");

  const reasonCode = (() => {
    const firstInterval = failedIntervalResults[0];
    if (firstInterval && Array.isArray(firstInterval.reason_codes) && typeof firstInterval.reason_codes[0] === "string") {
      return firstInterval.reason_codes[0];
    }
    const firstFold = failedFolds[0];
    if (firstFold && Array.isArray(firstFold.reason_codes) && typeof firstFold.reason_codes[0] === "string") {
      return firstFold.reason_codes[0];
    }
    if (report.trade_count <= 0) return "insufficient_trade_count";
    if (report.status === "pass") return "";
    return "promotion_gate_fail";
  })();

  const recommendation = (() => {
    if (reasonCode === "insufficient_rows") return "Expand period range or reduce folds/window size.";
    if (reasonCode === "insufficient_trade_count") return "Lower threshold or widen range to generate more trades.";
    if (reasonCode === "interval_not_multiple_of_base" || reasonCode === "interval_shorter_than_base") {
      return "Use context intervals that are multiples of the base interval.";
    }
    if (reasonCode === "backtest_failed") return "Inspect interval diagnostics and retry with fewer strategies.";
    if (reasonCode === "drawdown_too_high") return "Reduce leverage or tighten risk controls.";
    if (reasonCode === "net_pnl_non_positive") return "Retune strategy mix and cost assumptions.";
    if (reasonCode === "win_rate_below_threshold") return "Adjust threshold and verify signal quality.";
    if (report.status === "pass") return "No action required.";
    return "Review fold/interval diagnostics and rerun with a safer preset.";
  })();

  const details: string[] = [];
  for (const entry of failedIntervalResults.slice(0, 4)) {
    const interval = typeof entry.interval === "string" ? entry.interval : "interval";
    const reason = Array.isArray(entry.reason_codes) && typeof entry.reason_codes[0] === "string"
      ? String(entry.reason_codes[0])
      : "failed";
    details.push(`${interval}: ${toSentence(reason)}`);
  }
  for (const entry of failedFolds.slice(0, Math.max(0, 4 - details.length))) {
    const fold = typeof entry.fold === "number" ? `Fold ${entry.fold}` : "Fold";
    const reason = Array.isArray(entry.reason_codes) && typeof entry.reason_codes[0] === "string"
      ? String(entry.reason_codes[0])
      : "failed";
    details.push(`${fold}: ${toSentence(reason)}`);
  }
  if (details.length === 0 && walkForwardEnabled && report.status === "fail") {
    details.push("Walk-forward gate failed");
  }

  return {
    reason: reasonCode ? toSentence(reasonCode) : report.status === "pass" ? "Pass" : "Fail",
    recommendation,
    details,
  };
}

export default function NautilusOptimizationPanel() {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [learningStatus, setLearningStatus] = useState<OnlineLearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [reportOffset, setReportOffset] = useState(0);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gapHealth, setGapHealth] = useState<DataGapHealth | null>(null);
  const [gapHealthLoading, setGapHealthLoading] = useState(false);
  const [gapHealthError, setGapHealthError] = useState<string | null>(null);
  const gapHealthRequestInFlight = useRef(false);

  const [pair, setPair] = useState(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [versionId, setVersionId] = useState("");
  const [periodStart, setPeriodStart] = useState(() => toInputValue(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)));
  const [periodEnd, setPeriodEnd] = useState(() => toInputValue(new Date()));
  const [interval, setInterval] = useState("5m");
  const [contextIntervals, setContextIntervals] = useState("15m,1h,4h");
  const [windowSize, setWindowSize] = useState("240");
  const [stride, setStride] = useState("1");
  const [decisionThreshold, setDecisionThreshold] = useState("0.35");
  const [backtestMode, setBacktestMode] = useState<"l1" | "l2" | "l3">("l1");
  const [strategyIds, setStrategyIds] = useState<string[]>([...DEFAULT_STRATEGIES]);
  const [venueIds, setVenueIds] = useState<string[]>([...DEFAULT_VENUES]);
  const [walkForwardEnabled, setWalkForwardEnabled] = useState(false);
  const [folds, setFolds] = useState("4");
  const [purgeBars, setPurgeBars] = useState("0");
  const [embargoBars, setEmbargoBars] = useState("0");
  const [minTrainBars, setMinTrainBars] = useState("600");
  const [strictWalkForward, setStrictWalkForward] = useState(true);
  const [healAllPairs, setHealAllPairs] = useState(true);
  const [healAllIntervals, setHealAllIntervals] = useState(true);
  const versionIdRef = useRef<string>("");
  const reportCacheRef = useRef<Map<string, CachedReportPageState>>(new Map());
  const loadSequenceRef = useRef(0);

  const latestReport = reports[0] ?? null;
  const health = learningStatus?.rlService?.health ?? null;
  useEffect(() => {
    versionIdRef.current = versionId;
  }, [versionId]);

  const sb3Readiness = useMemo(() => {
    const checks: Array<{ label: string; status: StepStatus; detail: string }> = [];
    const health = learningStatus?.rlService?.health;
    checks.push({
      label: "Nautilus dependency",
      status: health?.mlDependencies?.nautilus_trader ? "ok" : "warn",
      detail: health?.mlDependencies?.nautilus_trader ? "installed" : "missing",
    });
    checks.push({
      label: "Strict backtest gate",
      status: health?.strictBacktest ? "ok" : "warn",
      detail: health?.strictBacktest ? "enabled" : "disabled",
    });
    checks.push({
      label: "Recent backtest run id",
      status: latestReport?.backtest_run_id ? "ok" : "warn",
      detail: latestReport?.backtest_run_id ?? "no run id recorded",
    });
    checks.push({
      label: "Recent trade count",
      status: (latestReport?.trade_count ?? 0) >= 20 ? "ok" : "warn",
      detail: latestReport ? `${latestReport.trade_count} trades` : "no report yet",
    });
    checks.push({
      label: "Promotion gate outcome",
      status: latestReport?.status === "pass" ? "ok" : "warn",
      detail: latestReport?.status ?? "unknown",
    });
    return checks;
  }, [latestReport, learningStatus]);

  const loadReports = useCallback(
    async (options: { append?: boolean; offset?: number; versionFilter?: string } = {}) => {
      const append = options.append ?? false;
      const offset = Math.max(0, Math.trunc(options.offset ?? 0));
      const effectiveVersionFilter = options.versionFilter ?? versionIdRef.current;
      const cacheKey = buildReportCacheKey(effectiveVersionFilter);
      const sequence = ++loadSequenceRef.current;
      const cached = reportCacheRef.current.get(cacheKey);
      setReportsLoading(true);
      setError(null);
      try {
        const nextReports = await listEvaluationReports(
          AGENT_ID,
          effectiveVersionFilter || undefined,
          {
            limit: BACKTEST_REPORT_PAGE_SIZE,
            offset,
          },
        );
        const previousReports = append ? cached?.reports ?? [] : [];
        const existingIds = new Set(previousReports.map((entry) => entry.id));
        const merged = append
          ? [...previousReports, ...nextReports.filter((item) => !existingIds.has(item.id))]
          : nextReports;
        const nextOffset = offset + nextReports.length;
        const nextHasMore = nextReports.length === BACKTEST_REPORT_PAGE_SIZE;
        reportCacheRef.current.set(cacheKey, {
          reports: merged,
          offset: nextOffset,
          hasMore: nextHasMore,
        });
        if (versionIdRef.current === effectiveVersionFilter) {
          setReports(append ? merged : nextReports);
          setReportOffset(nextOffset);
          setHasMoreReports(nextHasMore);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load evaluation reports.");
      } finally {
        if (sequence === loadSequenceRef.current) {
          setReportsLoading(false);
        }
      }
    },
    [],
  );

  const restoreReportsFromCache = useCallback((versionFilter?: string) => {
    const cacheKey = buildReportCacheKey(versionFilter);
    const cached = reportCacheRef.current.get(cacheKey);
    if (!cached) {
      setReports([]);
      setReportOffset(0);
      setHasMoreReports(false);
      return false;
    }
    setReports(cached.reports);
    setReportOffset(cached.offset);
    setHasMoreReports(cached.hasMore);
    return true;
  }, []);

  const refreshGapHealth = useCallback(async () => {
    if (gapHealthRequestInFlight.current) return;
    gapHealthRequestInFlight.current = true;
    setGapHealthLoading(true);
    setGapHealthError(null);
    try {
      const nextHealth = await fetchDataGapHealth({ limit: 25 });
      setGapHealth(nextHealth);
    } catch (err) {
      setGapHealthError(err instanceof Error ? err.message : "Failed to load gap health.");
    } finally {
      setGapHealthLoading(false);
      gapHealthRequestInFlight.current = false;
    }
  }, []);

  const loadMoreReports = useCallback(() => {
    if (!hasMoreReports || reportsLoading) return;
    void loadReports({ append: true, offset: reportOffset, versionFilter: versionIdRef.current || undefined });
  }, [hasMoreReports, reportsLoading, loadReports, reportOffset]);

  const changeVersion = useCallback((selectedVersionId: string) => {
    setVersionId(selectedVersionId);
    setError(null);
    const cacheRestored = restoreReportsFromCache(selectedVersionId);
    if (!cacheRestored) {
      void loadReports({
        append: false,
        offset: 0,
        versionFilter: selectedVersionId || undefined,
      });
    }
  }, [loadReports, restoreReportsFromCache]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      if (strategyIds.length === 0) {
        throw new Error("Select at least one strategy.");
      }
      if (venueIds.length === 0) {
        throw new Error("Select at least one venue.");
      }

      const payload: EvaluationRequest = {
        pair,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        interval,
        contextIntervals: parseCsv(contextIntervals),
        agentVersionId: versionId || undefined,
        decisionThreshold: Number(decisionThreshold),
        backtestMode,
        windowSize: Number(windowSize),
        stride: Number(stride),
        strategyIds,
        venueIds,
        walkForward: walkForwardEnabled
          ? {
              folds: Number(folds),
              purgeBars: Number(purgeBars),
              embargoBars: Number(embargoBars),
              minTrainBars: Number(minTrainBars),
              strict: strictWalkForward,
            }
          : null,
      };

      try {
        const report = await runEvaluation(AGENT_ID, payload);
        setReports((previous) => [report, ...previous.filter((item) => item.id !== report.id)]);
        setNote(`Nautilus evaluation queued: ${report.id.slice(0, 8)} (${report.status}).`);
        void refreshGapHealth();
      } catch (runError) {
        if (runError instanceof ApiError && runError.code === "DATA_GAP_BLOCKED") {
          const blockingReasons = asStringArray(runError.payload?.blocking_reasons);
          const warnings = asStringArray(runError.payload?.warnings);
          const blockedInterval =
            typeof runError.payload?.interval === "string" ? runError.payload.interval : payload.interval ?? interval;
          const reasonText = blockingReasons.length > 0 ? blockingReasons.join(", ") : "unknown";
          const warningText = warnings.length > 0 ? `\nWarnings: ${warnings.join(", ")}` : "";
          const confirmed = window.confirm(
            `Data gaps detected for ${pair} (${blockedInterval}).\nReasons: ${reasonText}${warningText}\n\nHeal all pairs: ${healAllPairs ? "enabled" : "disabled"}\nHeal all intervals: ${healAllIntervals ? "enabled" : "disabled"}\n\nProceed with confirm-heal and rerun now?`,
          );
          if (!confirmed) {
            throw new Error(`Backtest blocked by data gaps (${reasonText}).`);
          }
          setNote("Healing data gaps and rerunning with selected scope...");
          const healed = await runEvaluationConfirmHeal(AGENT_ID, {
            evaluation: payload,
            heal: {
              confirm: true,
              allPairs: healAllPairs,
              allIntervals: healAllIntervals,
              runGapMonitor: true,
            },
          });
          if (
            "queued" in healed &&
            healed.queued &&
            typeof healed.operation_id === "string"
          ) {
            setNote(
              `Heal-and-rerun queued: operation ${healed.operation_id}. ${healed.message ?? "Monitoring background processing."}`,
            );
            void refreshGapHealth();
            return;
          }
          if (!("report" in healed) || !healed.report) {
            throw new Error("Confirm-heal response did not include a report.");
          }
          const healedReport = healed.report;
          setReports((previous) => [healedReport, ...previous.filter((item) => item.id !== healedReport.id)]);
          setNote(`Nautilus heal-and-rerun queued: ${healedReport.id.slice(0, 8)} (${healedReport.status}).`);
          void refreshGapHealth();
          return;
        }
        throw runError;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.message} (HTTP ${err.status})`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to run Nautilus evaluation.");
      }
    } finally {
      setRunning(false);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextVersions, nextLearningStatus] = await Promise.all([
        listAgentVersions(AGENT_ID),
        fetchOnlineLearningStatus({ limit: 1, includeHealth: false }).catch(() => null),
      ]);
      const resolvedVersionId = versionIdRef.current || nextVersions[0]?.id || "";
      setVersions(nextVersions);
      setLearningStatus(nextLearningStatus);
      setVersionId((current) => current || resolvedVersionId);
      const didRestore = restoreReportsFromCache(resolvedVersionId || undefined);
      if (!didRestore) {
        await loadReports({
          append: false,
          offset: 0,
          versionFilter: resolvedVersionId || undefined,
        });
      }
      void refreshGapHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Nautilus controls.");
    } finally {
      setLoading(false);
    }
  }, [loadReports, refreshGapHealth, restoreReportsFromCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshGapHealth();
    const handle = setInterval(() => {
      void refreshGapHealth();
    }, GAP_HEALTH_POLL_MS);
    return () => {
      clearInterval(handle);
    };
  }, [refreshGapHealth]);

  const toggleStrategy = (id: string) => {
    setStrategyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const toggleVenue = (id: string) => {
    setVenueIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const applyPreset = (preset: "quick" | "full-history" | "multi-interval") => {
    const end = new Date();
    if (preset === "quick") {
      const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
      setPeriodStart(toInputValue(start));
      setPeriodEnd(toInputValue(end));
      setInterval("5m");
      setContextIntervals("15m,1h");
      setWindowSize("180");
      setStride("1");
      setDecisionThreshold("0.25");
      setBacktestMode("l1");
      setStrategyIds([...DEFAULT_STRATEGIES]);
      setVenueIds([...DEFAULT_VENUES]);
      setWalkForwardEnabled(false);
      return;
    }
    if (preset === "full-history") {
      const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
      setPeriodStart(toInputValue(start));
      setPeriodEnd(toInputValue(end));
      setInterval("15m");
      setContextIntervals("1h,4h,1d");
      setWindowSize("1024");
      setStride("2");
      setDecisionThreshold("0.2");
      setBacktestMode("l1");
      setStrategyIds([...DEFAULT_STRATEGIES]);
      setVenueIds([...DEFAULT_VENUES]);
      setWalkForwardEnabled(true);
      setFolds("6");
      setMinTrainBars("1200");
      setStrictWalkForward(false);
      return;
    }
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    setPeriodStart(toInputValue(start));
    setPeriodEnd(toInputValue(end));
    setInterval("5m");
    setContextIntervals("15m,1h,4h,1d");
    setWindowSize("720");
    setStride("1");
    setDecisionThreshold("0.15");
    setBacktestMode("l1");
    setStrategyIds(["ema_trend", "bollinger_mean_rev", "funding_overlay", "rl_sb3_market"]);
    setVenueIds([...DEFAULT_VENUES]);
    setWalkForwardEnabled(true);
    setFolds("4");
    setMinTrainBars("900");
    setStrictWalkForward(false);
  };

  if (loading) {
    return <div className="empty">Loading Nautilus optimization controls…</div>;
  }

  return (
    <section className="table-card">
      <div className="section-head">
        <div>
          <span>Nautilus Control Plane</span>
          <h3>Backtest Fidelity + Walk-Forward Matrix</h3>
          <p>
            Configure strategy/venue matrices and walk-forward folds from Command Center. This is your bridge to SB3
            policy promotion.
          </p>
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}
      {note ? <div className="inline-muted">{note}</div> : null}
      <div className="action-row" style={{ marginBottom: 12 }}>
        <button type="button" className="secondary" onClick={() => applyPreset("quick")} disabled={running}>
          Quick sanity
        </button>
        <button type="button" className="secondary" onClick={() => applyPreset("full-history")} disabled={running}>
          Full-history regime sweep
        </button>
        <button type="button" className="secondary" onClick={() => applyPreset("multi-interval")} disabled={running}>
          Multi-interval promotion check
        </button>
      </div>

      <div className="action-row" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <span className={`status-pill ${health?.status === "ok" ? "status-ok" : "status-warn"}`}>
          RL Service: {health?.status ?? "unknown"}
        </span>
        <span className={`status-pill ${health?.mlDependencies?.nautilus_trader ? "status-ok" : "status-warn"}`}>
          Nautilus: {health?.mlDependencies?.nautilus_trader ? "installed" : "missing"}
        </span>
        <span className={`status-pill ${health?.strictBacktest ? "status-ok" : "status-warn"}`}>
          Strict: {health?.strictBacktest ? "on" : "off"}
        </span>
        <span className={`status-pill ${latestReport?.backtest_run_id ? "status-ok" : "status-warn"}`}>
          Run: {latestReport?.backtest_run_id ? "recorded" : "missing"}
        </span>
      </div>

      <div className="form-grid">
        <label>
          Pair
          <select value={pair} onChange={(event) => setPair(event.target.value)}>
            {ALL_PAIRS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      <label>
          Agent Version
          <select
            value={versionId}
            onChange={(event) => {
              const selected = event.target.value;
              changeVersion(selected);
            }}
          >
            <option value="">Latest active</option>
            {versions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name || entry.id.slice(0, 8)}
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
          Base Interval
          <input value={interval} onChange={(event) => setInterval(event.target.value)} placeholder="5m" />
        </label>
        <label>
          Context Intervals (CSV)
          <input value={contextIntervals} onChange={(event) => setContextIntervals(event.target.value)} placeholder="15m,1h,4h" />
        </label>
        <label>
          Window Size
          <input type="number" value={windowSize} onChange={(event) => setWindowSize(event.target.value)} />
        </label>
        <label>
          Stride
          <input type="number" value={stride} onChange={(event) => setStride(event.target.value)} />
        </label>
        <label>
          Decision Threshold
          <input value={decisionThreshold} onChange={(event) => setDecisionThreshold(event.target.value)} />
        </label>
        <label>
          Backtest Fidelity
          <select value={backtestMode} onChange={(event) => setBacktestMode(event.target.value as "l1" | "l2" | "l3")}>
            <option value="l1">L1 (bars/trades)</option>
            <option value="l2">L2 (book depth)</option>
            <option value="l3">L3 (full book events)</option>
          </select>
        </label>
      </div>

      <div className="panel">
        <h5>Data Gap Healing Scope</h5>
        <p className="inline-muted">Choose how confirm-heal targets are selected when a gap is blocking a run.</p>
        <div className="action-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="toggle-row">
            <span>Heal all pairs</span>
            <input type="checkbox" checked={healAllPairs} onChange={(event) => setHealAllPairs(event.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>Heal all intervals</span>
            <input
              type="checkbox"
              checked={healAllIntervals}
              onChange={(event) => setHealAllIntervals(event.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h5>Strategy Matrix</h5>
          <div className="inline-muted">Run multiple strategy styles over the same dataset window.</div>
          <div className="action-row">
            {STRATEGY_OPTIONS.map((entry) => (
              <label key={entry.id} className="toggle-row">
                <span>{entry.label}</span>
                <input
                  type="checkbox"
                  checked={strategyIds.includes(entry.id)}
                  onChange={() => toggleStrategy(entry.id)}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="panel">
          <h5>Venue Matrix</h5>
          <div className="inline-muted">Stress strategy portability across venue assumptions.</div>
          <div className="action-row">
            {VENUE_OPTIONS.map((entry) => (
              <label key={entry.id} className="toggle-row">
                <span>{entry.label}</span>
                <input type="checkbox" checked={venueIds.includes(entry.id)} onChange={() => toggleVenue(entry.id)} />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h5>Walk-Forward Controls</h5>
        <label className="toggle-row">
          <span>Enable walk-forward folds</span>
          <input
            type="checkbox"
            checked={walkForwardEnabled}
            onChange={(event) => setWalkForwardEnabled(event.target.checked)}
          />
        </label>
        {walkForwardEnabled ? (
          <div className="form-grid">
            <label>
              Folds
              <input type="number" value={folds} onChange={(event) => setFolds(event.target.value)} />
            </label>
            <label>
              Purge Bars
              <input type="number" value={purgeBars} onChange={(event) => setPurgeBars(event.target.value)} />
            </label>
            <label>
              Embargo Bars
              <input type="number" value={embargoBars} onChange={(event) => setEmbargoBars(event.target.value)} />
            </label>
            <label>
              Min Train Bars
              <input type="number" value={minTrainBars} onChange={(event) => setMinTrainBars(event.target.value)} />
            </label>
            <label className="toggle-row">
              <span>Strict folds</span>
              <input
                type="checkbox"
                checked={strictWalkForward}
                onChange={(event) => setStrictWalkForward(event.target.checked)}
              />
            </label>
          </div>
        ) : (
          <div className="inline-muted">Walk-forward disabled for this run.</div>
        )}
      </div>

      <div className="panel">
        <h5>Live Data Gap Health</h5>
        <div className="action-row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" className="secondary" onClick={refreshGapHealth} disabled={gapHealthLoading}>
            {gapHealthLoading ? "Refreshing…" : "Refresh gap health"}
          </button>
          {gapHealth ? (
            <span className="inline-muted">Last updated: {formatGapDate(gapHealth.generated_at)}</span>
          ) : null}
        </div>
        {gapHealthError ? <div className="empty">Gap health unavailable: {gapHealthError}</div> : null}
        {gapHealth ? (
          <>
            <div className="detail-grid" style={{ marginBottom: 12 }}>
              <div>
                <span>Open gaps</span>
                <strong>{gapHealth.totals.open}</strong>
              </div>
              <div>
                <span>Healing gaps</span>
                <strong>{gapHealth.totals.healing}</strong>
              </div>
              <div>
                <span>Last detected</span>
                <strong>{formatGapDate(gapHealth.totals.last_detected_at ?? "—")}</strong>
              </div>
              <div>
                <span>Last seen</span>
                <strong>{formatGapDate(gapHealth.totals.last_seen_at ?? "—")}</strong>
              </div>
              <div>
                <span>Oldest open</span>
                <strong>{formatGapDate(gapHealth.totals.oldest_open_at ?? "—")}</strong>
              </div>
            </div>
            <div className="detail-grid" style={{ marginBottom: 12 }}>
              <div>
                <span>By pair (top)</span>
                <strong>
                  {gapHealth.by_pair.length === 0
                    ? "—"
                    : gapHealth.by_pair
                        .slice(0, 5)
                        .map((item) => `${item.pair}: ${item.open}`)
                        .join(" | ")}
                </strong>
              </div>
              <div>
                <span>By source (top)</span>
                <strong>
                  {gapHealth.by_source.length === 0
                    ? "—"
                    : gapHealth.by_source
                        .slice(0, 5)
                        .map((item) => `${item.source_type}: ${item.open}`)
                        .join(" | ")}
                </strong>
              </div>
            </div>
            <div className="table-scroll">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Source</th>
                    <th>Interval</th>
                    <th>Gap Start</th>
                    <th>Gap End</th>
                    <th>Status</th>
                    <th>Missing</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {gapHealth.open_events.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No open gap events.</td>
                    </tr>
                  ) : (
                    gapHealth.open_events.slice(0, 10).map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.pair}</td>
                        <td>{entry.source_type}</td>
                        <td>{entry.interval ?? "—"}</td>
                        <td>{formatGapDate(entry.gap_start)}</td>
                        <td>{formatGapDate(entry.gap_end)}</td>
                        <td>
                          <span className={`status-pill ${entry.status === "open" ? "status-bad" : "status-ok"}`}>{entry.status}</span>
                        </td>
                        <td>{entry.missing_points ?? "?"}</td>
                        <td>{entry.heal_attempts ?? 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : gapHealthLoading ? (
          <div className="inline-muted">Loading gap health…</div>
        ) : null}
      </div>

      <div className="control-actions">
        <button type="button" className="primary" onClick={runNow} disabled={running}>
          {running ? "Running…" : "Run Nautilus Matrix"}
        </button>
        <button type="button" className="secondary" onClick={refresh} disabled={running}>
          Refresh
        </button>
      </div>

      <div className="panel">
        <h5>SB3 Readiness Gate</h5>
        <p className="inline-muted">
          These checks should be green before pushing RL SB3 policy (`rl_sb3_market`) into promotion runs.
        </p>
        <ul className="bullet-list">
          {sb3Readiness.map((item) => (
            <li key={item.label}>
              <span className={`status-pill ${item.status === "ok" ? "status-ok" : "status-warn"}`}>{item.status === "ok" ? "OK" : "Attention"}</span>{" "}
              {item.label}: {item.detail}
            </li>
          ))}
        </ul>
      </div>

      <div className="table-scroll">
        {reportsLoading ? <div className="inline-muted">Loading report history…</div> : null}
        <table className="table compact">
          <thead>
            <tr>
              <th>Created</th>
              <th>Pair</th>
              <th>Status</th>
              <th>Backtest Run</th>
              <th>Strategies</th>
              <th>Venues</th>
              <th>Walk Forward</th>
              <th>Fold Result</th>
              <th>Failure Reason</th>
              <th>Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const matrix = reportMatrix(report);
              const failure = failureSummary(report);
              return (
                <tr key={report.id}>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>{report.pair}</td>
                  <td>
                    <span className={`status-pill ${report.status === "pass" ? "status-ok" : "status-bad"}`}>{report.status}</span>
                  </td>
                  <td className="mono">{report.backtest_run_id ?? "—"}</td>
                  <td>{matrix.strategies.join(", ") || "—"}</td>
                  <td>{matrix.venues.join(", ") || "—"}</td>
                  <td>{matrix.walkForwardEnabled ? `${matrix.walkForwardFolds} folds` : "disabled"}</td>
                  <td>
                    {matrix.foldTotalCount > 0
                      ? `${matrix.foldPassCount}/${matrix.foldTotalCount} pass`
                      : "—"}
                  </td>
                  <td>{failure.reason}</td>
                  <td>
                    <div>{failure.recommendation}</div>
                    {failure.details.length > 0 ? (
                      <div className="inline-muted">{failure.details.join(" | ")}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMoreReports ? (
        <div className="action-row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={loadMoreReports} disabled={reportsLoading}>
            {reportsLoading ? "Loading more…" : "Load more"}
          </button>
        </div>
      ) : null}
      <p className="inline-muted">
        Fold and interval diagnostics are read from evaluation metadata (`fold_metrics` + `nautilus.metrics.interval_matrix`).
      </p>
    </section>
  );
}
