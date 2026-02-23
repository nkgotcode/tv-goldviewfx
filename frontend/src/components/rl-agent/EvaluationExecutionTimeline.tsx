type EvaluationExecutionInput = {
  pair: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  winRate: number;
  netPnlAfterFees: number;
  maxDrawdown: number;
  tradeCount: number;
  backtestRunId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type TimelineStepStatus = "ok" | "warn" | "error";

type FoldMetric = {
  fold: number;
  start: string;
  end: string;
  winRate: number;
  netPnlAfterFees: number;
  maxDrawdown: number;
  tradeCount: number;
  status: string;
};

type TimelineStep = {
  key: string;
  label: string;
  status: TimelineStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  details: string[];
  folds?: FoldMetric[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickValue(record: Record<string, unknown> | null, keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDurationMs(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remaining}s`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMetric(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function statusClass(status: TimelineStepStatus) {
  if (status === "ok") return "status-ok";
  if (status === "error") return "status-bad";
  return "status-warn";
}

function statusLabel(status: TimelineStepStatus) {
  if (status === "ok") return "Completed";
  if (status === "error") return "Failed";
  return "Partial";
}

function parseFoldMetrics(metadata: Record<string, unknown> | null): FoldMetric[] {
  const rawFolds = asArray(pickValue(metadata, ["fold_metrics", "foldMetrics"]));
  return rawFolds
    .map((entry, index) => {
      const record = asRecord(entry);
      if (!record) return null;
      const fold = asNumber(pickValue(record, ["fold"])) ?? index + 1;
      const start = asString(pickValue(record, ["start"])) ?? "—";
      const end = asString(pickValue(record, ["end"])) ?? "—";
      const winRate = asNumber(pickValue(record, ["win_rate", "winRate"])) ?? 0;
      const netPnlAfterFees = asNumber(pickValue(record, ["net_pnl_after_fees", "netPnlAfterFees"])) ?? 0;
      const maxDrawdown = asNumber(pickValue(record, ["max_drawdown", "maxDrawdown"])) ?? 0;
      const tradeCount = asNumber(pickValue(record, ["trade_count", "tradeCount"])) ?? 0;
      const status = asString(pickValue(record, ["status"])) ?? "unknown";
      return {
        fold,
        start,
        end,
        winRate,
        netPnlAfterFees,
        maxDrawdown,
        tradeCount,
        status,
      };
    })
    .filter((value): value is FoldMetric => value !== null);
}

function stringifyDetail(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const preview = value.slice(0, 5).map((item) => stringifyDetail(item));
    const suffix = value.length > 5 ? ` (+${value.length - 5} more)` : "";
    return `[${preview.join(", ")}]${suffix}`;
  }
  const record = asRecord(value);
  if (!record) return String(value);
  const pairs = Object.entries(record)
    .slice(0, 5)
    .map(([key, item]) => `${key}:${stringifyDetail(item)}`);
  const suffix = Object.keys(record).length > 5 ? " (+more)" : "";
  return `{ ${pairs.join(", ")} }${suffix}`;
}

function parseStoredExecutionSteps(
  metadata: Record<string, unknown> | null,
  foldMetrics: FoldMetric[],
): TimelineStep[] {
  const execution = asRecord(pickValue(metadata, ["execution"])) ?? metadata;
  const rawSteps = asArray(pickValue(execution, ["steps", "execution_steps", "executionSteps"]));
  if (rawSteps.length === 0) return [];
  const parsed: TimelineStep[] = [];
  rawSteps.forEach((entry, index) => {
    const record = asRecord(entry);
    if (!record) return;
    const statusRaw = asString(pickValue(record, ["status"])) ?? "ok";
    const status: TimelineStepStatus = statusRaw === "error" ? "error" : "ok";
    const detailsRecord = asRecord(pickValue(record, ["details"]));
    const details = detailsRecord ? Object.entries(detailsRecord).map(([key, value]) => `${key}: ${stringifyDetail(value)}`) : [];
    const error = asString(pickValue(record, ["error"]));
    if (error) details.push(`error: ${error}`);
    const key = asString(pickValue(record, ["key"])) ?? `step-${index + 1}`;
    parsed.push({
      key,
      label: asString(pickValue(record, ["label"])) ?? `Step ${index + 1}`,
      status,
      startedAt: asString(pickValue(record, ["started_at", "startedAt"])) ?? undefined,
      completedAt: asString(pickValue(record, ["completed_at", "completedAt"])) ?? undefined,
      durationMs: asNumber(pickValue(record, ["duration_ms", "durationMs"])) ?? undefined,
      details,
      folds: key === "run_rl_evaluation" && foldMetrics.length > 0 ? foldMetrics : undefined,
    });
  });
  return parsed;
}

function buildFallbackSteps(input: EvaluationExecutionInput): TimelineStep[] {
  const metadata = asRecord(input.metadata);
  const parameters =
    asRecord(pickValue(metadata, ["parameters", "params", "request", "config"])) ?? ({} as Record<string, unknown>);
  const provenance =
    asRecord(pickValue(metadata, ["dataset_provenance", "datasetProvenance"])) ?? ({} as Record<string, unknown>);
  const walkForward =
    asRecord(pickValue(metadata, ["walk_forward", "walkForward"])) ??
    asRecord(pickValue(parameters, ["walkForward", "walk_forward"]));
  const rewardConfig = asRecord(pickValue(metadata, ["reward_config", "rewardConfig"]));
  const nautilus = asRecord(pickValue(metadata, ["nautilus"]));
  const foldMetrics = parseFoldMetrics(metadata);
  const dataFields = asArray(pickValue(metadata, ["data_fields", "dataFields"]));
  const rawSources = asArray(pickValue(provenance, ["data_sources", "dataSources"]));
  const dataSourceSummary = rawSources
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const source = asString(pickValue(record, ["source"])) ?? "unknown_source";
      const rows = asNumber(pickValue(record, ["rows"])) ?? 0;
      return `${source}: ${rows} rows`;
    })
    .filter((value): value is string => Boolean(value));
  const failedFolds = foldMetrics.filter((fold) => fold.status.toLowerCase() === "fail");
  const strictWalkForward = pickValue(walkForward, ["strict"]) === true;

  return [
    {
      key: "resolve_inputs",
      label: "Resolve evaluation inputs",
      status: "ok",
      details: [
        `pair: ${input.pair}`,
        `period_start: ${input.periodStart}`,
        `period_end: ${input.periodEnd}`,
        `interval: ${asString(pickValue(parameters, ["interval"])) ?? "1m"}`,
        `context_intervals: ${stringifyDetail(pickValue(parameters, ["contextIntervals", "context_intervals"]) ?? [])}`,
      ],
    },
    {
      key: "resolve_dataset",
      label: "Resolve dataset + provenance",
      status: dataSourceSummary.length > 0 ? "ok" : "warn",
      details: [
        `dataset_version_id: ${asString(pickValue(parameters, ["datasetVersionId", "dataset_version_id"])) ?? "—"}`,
        `feature_set_version_id: ${asString(pickValue(parameters, ["featureSetVersionId", "feature_set_version_id"])) ?? "—"}`,
        `resolved_pair: ${asString(pickValue(parameters, ["resolvedPair", "resolved_pair"])) ?? input.pair}`,
        `resolved_bingx_symbol: ${asString(pickValue(parameters, ["resolvedBingxSymbol", "resolved_bingx_symbol"])) ?? "—"}`,
        dataSourceSummary.length > 0 ? `data_sources: ${dataSourceSummary.join(" | ")}` : "data_sources: none recorded",
      ],
    },
    {
      key: "build_features",
      label: "Build feature matrix",
      status: dataFields.length > 0 ? "ok" : "warn",
      details: [
        `window_size: ${asNumber(pickValue(parameters, ["windowSize", "window_size"])) ?? "—"}`,
        `stride: ${asNumber(pickValue(parameters, ["stride"])) ?? "—"}`,
        `feature_fields: ${dataFields.length}`,
        `feature_schema_fingerprint: ${asString(pickValue(parameters, ["featureSchemaFingerprint", "feature_schema_fingerprint"])) ?? "—"}`,
      ],
    },
    {
      key: "walk_forward",
      label: "Walk-forward split + fold scoring",
      status: failedFolds.length > 0 ? "error" : foldMetrics.length > 0 ? "ok" : "warn",
      details: [
        `walk_forward: ${walkForward ? stringifyDetail(walkForward) : "default"}`,
        `fold_count: ${foldMetrics.length}`,
        `failed_folds: ${failedFolds.length}`,
      ],
      folds: foldMetrics.length > 0 ? foldMetrics : undefined,
    },
    {
      key: "nautilus_backtest",
      label: "Run Nautilus backtest",
      status: input.backtestRunId ? "ok" : strictWalkForward ? "error" : "warn",
      details: [
        `engine: ${asString(pickValue(nautilus, ["engine"])) ?? "nautilus_trader"}`,
        `backtest_run_id: ${input.backtestRunId ?? "not recorded"}`,
        `decision_threshold: ${asNumber(pickValue(nautilus, ["decision_threshold", "decisionThreshold"])) ?? "—"}`,
      ],
    },
    {
      key: "promotion_gate",
      label: "Apply promotion gates",
      status: input.status === "pass" ? "ok" : "error",
      details: [
        `status: ${input.status}`,
        `win_rate: ${formatPercent(input.winRate)}`,
        `net_pnl_after_fees: ${formatMetric(input.netPnlAfterFees, 2)}`,
        `max_drawdown: ${formatMetric(input.maxDrawdown, 4)}`,
        `trade_count: ${input.tradeCount}`,
        `reward_config: ${rewardConfig ? stringifyDetail(rewardConfig) : "—"}`,
      ],
    },
  ];
}

export default function EvaluationExecutionTimeline({
  report,
  compact = false,
}: {
  report: EvaluationExecutionInput | null;
  compact?: boolean;
}) {
  if (!report) {
    return <div className="empty">Select an evaluation run to inspect execution steps.</div>;
  }

  const metadata = asRecord(report.metadata);
  const foldMetrics = parseFoldMetrics(metadata);
  const storedSteps = parseStoredExecutionSteps(metadata, foldMetrics);
  const steps = storedSteps.length > 0 ? storedSteps : buildFallbackSteps(report);

  return (
    <div className={`execution-timeline${compact ? " compact" : ""}`}>
      <ol className="execution-steps">
        {steps.map((step, index) => (
          <li key={`${step.key}-${index}`} className="execution-step">
            <div className="execution-step-head">
              <div className="execution-step-title">
                <span>Step {index + 1}</span>
                <strong>{step.label}</strong>
              </div>
              <span className={`status-pill ${statusClass(step.status)}`}>{statusLabel(step.status)}</span>
            </div>
            {step.startedAt || step.completedAt || step.durationMs !== undefined ? (
              <div className="execution-step-meta">
                Started {formatDate(step.startedAt)} · Finished {formatDate(step.completedAt)} · Duration{" "}
                {formatDurationMs(step.durationMs)}
              </div>
            ) : null}
            {step.details.length > 0 ? (
              <ul className="execution-details">
                {(compact ? step.details.slice(0, 5) : step.details).map((detail, detailIndex) => (
                  <li key={`${step.key}-detail-${detailIndex}`}>{detail}</li>
                ))}
              </ul>
            ) : null}
            {step.folds && step.folds.length > 0 ? (
              <div className="table-scroll">
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Fold</th>
                      <th>Range</th>
                      <th>Status</th>
                      <th>Win</th>
                      <th>Net PnL</th>
                      <th>Drawdown</th>
                      <th>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.folds.map((fold) => (
                      <tr key={`${step.key}-fold-${fold.fold}`}>
                        <td>{fold.fold}</td>
                        <td>
                          {formatDate(fold.start)} → {formatDate(fold.end)}
                        </td>
                        <td>{fold.status}</td>
                        <td>{formatPercent(fold.winRate)}</td>
                        <td>{formatMetric(fold.netPnlAfterFees, 2)}</td>
                        <td>{formatMetric(fold.maxDrawdown, 4)}</td>
                        <td>{fold.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export type { EvaluationExecutionInput };
