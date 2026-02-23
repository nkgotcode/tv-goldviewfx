export type TradingPair = string;
export type AgentRunMode = "paper" | "live";
export type AgentRunStatus = "running" | "paused" | "stopped";
export type AgentVersionStatus = "draft" | "evaluating" | "promoted" | "retired";
export type RiskCheckResult = "pass" | "fail";
export type TradeAction = "long" | "short" | "close" | "hold";
export type TradeExecutionStatus = "submitted" | "partially_filled" | "filled" | "rejected" | "canceled";

export type TaIndicatorConfig = {
  name: string;
  params?: Record<string, number>;
  outputNames?: string[];
};

export type FeatureSetTechnicalConfig = {
  enabled: boolean;
  criticalFields?: string[];
  indicators?: TaIndicatorConfig[];
};

export type FeatureSetContract = {
  version: "v1" | "v2";
  includeNews: boolean;
  includeOcr: boolean;
  technical?: FeatureSetTechnicalConfig;
};

export type WalkForwardFoldConfig = {
  folds: number;
  purgeBars?: number;
  embargoBars?: number;
  minTrainBars?: number;
  strict?: boolean;
};

export type AgentVersion = {
  id: string;
  name: string;
  createdAt: string;
  trainingWindowStart?: string;
  trainingWindowEnd?: string;
  algorithmLabel?: string;
  hyperparameterSummary?: string;
  artifactUri?: string;
  artifactChecksum?: string;
  artifactSizeBytes?: number;
  datasetVersionId?: string | null;
  datasetHash?: string | null;
  featureSetVersionId?: string | null;
  status: AgentVersionStatus;
  promotedAt?: string | null;
};

export type AgentRun = {
  id: string;
  mode: AgentRunMode;
  pair: TradingPair;
  status: AgentRunStatus;
  startedAt: string;
  stoppedAt?: string | null;
  learningEnabled: boolean;
  learningWindowMinutes?: number | null;
  agentVersionId: string;
  riskLimitSetId: string;
  datasetVersionId?: string | null;
  featureSetVersionId?: string | null;
};

export type RiskLimitSet = {
  id: string;
  name: string;
  maxPositionSize: number;
  leverageCap: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOpenPositions: number;
  effectiveFrom?: string;
  active: boolean;
};

export type DataSourceType =
  | "bingx_candles"
  | "bingx_orderbook"
  | "bingx_trades"
  | "bingx_funding"
  | "bingx_open_interest"
  | "bingx_mark_price"
  | "bingx_index_price"
  | "bingx_ticker"
  | "ideas"
  | "signals"
  | "news"
  | "ocr_text"
  | "trades";

export type DataSourceStatus = {
  id: string;
  sourceType: DataSourceType;
  pair: TradingPair;
  lastSeenAt?: string | null;
  freshnessThresholdSeconds: number;
  status: "ok" | "stale" | "unavailable";
};

export type TradeDecision = {
  id: string;
  agentRunId: string;
  pair: TradingPair;
  decidedAt: string;
  action: TradeAction;
  confidenceScore: number;
  inputsSnapshotRef?: string | null;
  policyVersionLabel?: string | null;
  riskCheckResult: RiskCheckResult;
};

export type TradeExecution = {
  id: string;
  tradeDecisionId: string;
  orderId?: string | null;
  status: TradeExecutionStatus;
  filledQuantity: number;
  averagePrice?: number | null;
  fees?: number | null;
  realizedPnl?: number | null;
  closedAt?: string | null;
};

export type EvaluationReport = {
  id: string;
  agentVersionId: string;
  pair: TradingPair;
  periodStart: string;
  periodEnd: string;
  winRate: number;
  netPnlAfterFees: number;
  maxDrawdown: number;
  tradeCount: number;
  exposureByPair: Record<string, number>;
  status: "pass" | "fail";
  createdAt: string;
  datasetVersionId?: string | null;
  datasetHash?: string | null;
  featureSetVersionId?: string | null;
  artifactUri?: string | null;
  backtestRunId?: string | null;
  metadata?: {
    foldMetrics?: Array<{
      fold: number;
      start: string;
      end: string;
      winRate: number;
      netPnlAfterFees: number;
      maxDrawdown: number;
      tradeCount: number;
      status: "pass" | "fail";
    }>;
    aggregate?: {
      folds: number;
      passRate: number;
      winRateAvg: number;
      netPnlAfterFeesTotal: number;
      maxDrawdownWorst: number;
      tradeCountTotal: number;
    };
    featureSchemaFingerprint?: string | null;
    promotionComparison?: {
      challengerReportId?: string | null;
      championReportId?: string | null;
      promoted?: boolean;
      reasons?: string[];
      deltas?: Record<string, number>;
    };
  } | null;
};

export type LearningUpdate = {
  id: string;
  agentVersionId: string;
  windowStart: string;
  windowEnd: string;
  startedAt: string;
  completedAt?: string | null;
  status: "running" | "succeeded" | "failed";
  evaluationReportId?: string | null;
  championEvaluationReportId?: string | null;
  promoted?: boolean | null;
  decisionReasons?: string[];
  metricDeltas?: Record<string, number> | null;
};

export type FeatureSnapshot = {
  id: string;
  pair: TradingPair;
  interval: string;
  featureSetVersionId: string;
  capturedAt: string;
  schemaFingerprint: string;
  warmup: boolean;
  isComplete: boolean;
  features: Record<string, number>;
  sourceWindowStart?: string | null;
  sourceWindowEnd?: string | null;
};

export type MarketInputSnapshot = {
  id: string;
  pair: TradingPair;
  capturedAt: string;
  datasetVersionId?: string | null;
  datasetHash?: string | null;
  featureSetVersionId?: string | null;
  agentVersionId?: string | null;
  artifactUri?: string | null;
  marketFeaturesRef?: string | null;
  chartFeaturesRef?: string | null;
  ideaFeaturesRef?: string | null;
  signalFeaturesRef?: string | null;
  newsFeaturesRef?: string | null;
};

export type InferenceRequest = {
  runId?: string;
  pair: TradingPair;
  market: {
    pair?: TradingPair;
    candles: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>;
    lastPrice?: number | null;
    spread?: number | null;
  };
  ideas?: Array<{ source: string; timestamp: string; score: number; confidence?: number | null }>;
  signals?: Array<{ source: string; timestamp: string; score: number; confidence?: number | null }>;
  news?: Array<{ source: string; timestamp: string; score: number; confidence?: number | null }>;
  ocr?: Array<{
    source: string;
    timestamp: string;
    score: number;
    confidence?: number | null;
    metadata?: Record<string, unknown>;
  }>;
  recentTrades?: Array<{ executedAt: string; side: "long" | "short" | "close"; quantity: number; price: number }>;
  riskLimits?: {
    maxPositionSize: number;
    leverageCap: number;
    maxDailyLoss: number;
    maxDrawdown: number;
    maxOpenPositions: number;
  };
  learningEnabled?: boolean;
  learningWindowMinutes?: number | null;
  policyVersion?: string | null;
  artifactUri?: string | null;
  artifactChecksum?: string | null;
  artifactDownloadUrl?: string | null;
  artifactBase64?: string | null;
  featureSchemaFingerprint?: string | null;
};

export type InferenceResponse = {
  decision: {
    action: TradeAction;
    confidenceScore: number;
    size?: number | null;
    reason?: string | null;
    riskCheckResult: RiskCheckResult;
    policyVersion?: string | null;
  };
  features?: Record<string, number>;
  warnings?: string[];
  modelVersion?: string | null;
};

export type EvaluationRequest = {
  pair: TradingPair;
  periodStart: string;
  periodEnd: string;
  interval?: string | null;
  contextIntervals?: string[] | null;
  agentVersionId?: string | null;
  datasetVersionId?: string | null;
  featureSetVersionId?: string | null;
  datasetHash?: string | null;
  artifactUri?: string | null;
  artifactChecksum?: string | null;
  artifactDownloadUrl?: string | null;
  artifactBase64?: string | null;
  decisionThreshold?: number | null;
  windowSize?: number | null;
  stride?: number | null;
  leverage?: number | null;
  takerFeeBps?: number | null;
  slippageBps?: number | null;
  fundingWeight?: number | null;
  drawdownPenalty?: number | null;
  walkForward?: WalkForwardFoldConfig | null;
  featureSchemaFingerprint?: string | null;
  featureKeyExtras?: string[] | null;
  datasetFeatures?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
};

export type TrainingRequest = {
  pair: TradingPair;
  periodStart: string;
  periodEnd: string;
  interval?: string | null;
  contextIntervals?: string[] | null;
  datasetVersionId?: string | null;
  featureSetVersionId?: string | null;
  datasetHash?: string | null;
  windowSize?: number;
  stride?: number;
  leverage?: number | null;
  takerFeeBps?: number | null;
  slippageBps?: number | null;
  fundingWeight?: number | null;
  drawdownPenalty?: number | null;
  feedbackRounds?: number | null;
  feedbackTimesteps?: number | null;
  feedbackHardRatio?: number | null;
  timesteps: number;
  seed?: number | null;
  featureSchemaFingerprint?: string | null;
  featureKeyExtras?: string[] | null;
  datasetFeatures?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
};

export type TrainingResponse = {
  artifactBase64: string;
  artifactChecksum: string;
  artifactSizeBytes: number;
  algorithmLabel: string;
  hyperparameterSummary: string;
};

export type ModelArtifact = {
  id: string;
  agentVersionId: string;
  artifactUri: string;
  artifactChecksum: string;
  artifactSizeBytes: number;
  contentType?: string | null;
  trainingWindowStart?: string | null;
  trainingWindowEnd?: string | null;
  createdAt?: string | null;
};

export type HealthResponse = {
  status: "ok";
  environment: string;
  timestamp: string;
};

export type DatasetPreviewRequest = {
  pair: TradingPair;
  interval: string;
  contextIntervals?: string[] | null;
  startAt: string;
  endAt: string;
  windowSize?: number;
  stride?: number;
  featureSetVersionId?: string | null;
  featureSchemaFingerprint?: string | null;
  features?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
};

export type DatasetPreviewResponse = {
  version: {
    id: string;
    pair: TradingPair;
    interval: string;
    start_at?: string;
    end_at?: string;
    startAt?: string;
    endAt?: string;
    checksum: string;
    dataset_hash?: string;
    datasetHash?: string;
    feature_set_version_id?: string | null;
    featureSetVersionId?: string | null;
    feature_schema_fingerprint?: string | null;
    featureSchemaFingerprint?: string | null;
    window_size?: number;
    windowSize?: number;
    stride?: number;
    created_at?: string;
    createdAt?: string;
  };
  windowCount: number;
};

export type DriftCheckRequest = {
  agentId: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  threshold: number;
};

export type DriftCheckResponse = {
  drifted: boolean;
  metric: string;
  baselineValue: number;
  currentValue: number;
  delta: number;
};

export type DriftAlert = {
  id: string;
  agent_id: string;
  detected_at: string;
  metric: string;
  baseline_value?: number | null;
  current_value?: number | null;
  status: "open" | "acknowledged" | "resolved";
  action_taken?: string | null;
};
