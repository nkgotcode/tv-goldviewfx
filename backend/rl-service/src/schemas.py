from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class TradingPair(str, Enum):
    GOLD_USDT = "Gold-USDT"
    XAUTUSDT = "XAUTUSDT"
    PAXGUSDT = "PAXGUSDT"
    ALGO_USDT = "ALGO-USDT"
    BTC_USDT = "BTC-USDT"
    ETH_USDT = "ETH-USDT"
    SOL_USDT = "SOL-USDT"
    XRP_USDT = "XRP-USDT"
    BNB_USDT = "BNB-USDT"


class MarketCandle(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketSnapshot(BaseModel):
    pair: TradingPair
    candles: list[MarketCandle]
    last_price: float | None = None
    spread: float | None = None


class AuxiliarySignal(BaseModel):
    source: str
    timestamp: datetime
    score: float
    confidence: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TradeRecord(BaseModel):
    executed_at: datetime
    side: Literal["long", "short", "close"]
    quantity: float
    price: float
    realized_pnl: float | None = None


class RiskLimits(BaseModel):
    max_position_size: float
    leverage_cap: float
    max_daily_loss: float
    max_drawdown: float
    max_open_positions: int


class InferenceRequest(BaseModel):
    run_id: str | None = None
    pair: TradingPair
    market: MarketSnapshot
    ideas: list[AuxiliarySignal] = Field(default_factory=list)
    signals: list[AuxiliarySignal] = Field(default_factory=list)
    news: list[AuxiliarySignal] = Field(default_factory=list)
    ocr: list[AuxiliarySignal] = Field(default_factory=list)
    recent_trades: list[TradeRecord] = Field(default_factory=list)
    risk_limits: RiskLimits | None = None
    learning_enabled: bool = True
    learning_window_minutes: int | None = None
    policy_version: str | None = None
    artifact_uri: str | None = None
    artifact_checksum: str | None = None
    artifact_download_url: str | None = None
    artifact_base64: str | None = None
    feature_schema_fingerprint: str | None = None


class TradeDecision(BaseModel):
    action: Literal["long", "short", "close", "hold"]
    confidence_score: float
    size: float | None = None
    reason: str | None = None
    risk_check_result: Literal["pass", "fail"] = "pass"
    policy_version: str | None = None


class InferenceResponse(BaseModel):
    decision: TradeDecision
    features: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    model_version: str | None = None


class WalkForwardConfig(BaseModel):
    folds: int = Field(default=4, ge=1, le=24)
    purge_bars: int = Field(default=0, ge=0)
    embargo_bars: int = Field(default=0, ge=0)
    min_train_bars: int | None = Field(default=None, ge=1)
    strict: bool = True


class EvaluationRequest(BaseModel):
    pair: TradingPair
    period_start: datetime
    period_end: datetime
    interval: str = "1m"
    context_intervals: list[str] = Field(default_factory=list)
    agent_version_id: str | None = None
    dataset_version_id: str | None = None
    feature_set_version_id: str | None = None
    dataset_hash: str | None = None
    artifact_uri: str | None = None
    artifact_checksum: str | None = None
    artifact_download_url: str | None = None
    artifact_base64: str | None = None
    dataset_features: list[dict] | None = None
    decision_threshold: float | None = None
    window_size: int = 30
    stride: int = 1
    leverage: float = 1.0
    taker_fee_bps: float = 4.0
    slippage_bps: float = 1.0
    funding_weight: float = 1.0
    drawdown_penalty: float = 0.0
    walk_forward: WalkForwardConfig | None = None
    feature_schema_fingerprint: str | None = None
    feature_key_extras: list[str] | None = None


class EvaluationReport(BaseModel):
    id: str
    pair: TradingPair
    win_rate: float
    net_pnl_after_fees: float
    max_drawdown: float
    trade_count: int
    exposure_by_pair: dict[str, float] = Field(default_factory=dict)
    status: Literal["pass", "fail"]
    dataset_hash: str | None = None
    artifact_uri: str | None = None
    backtest_run_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    environment: str
    ml_dependencies: dict[str, bool] = Field(default_factory=dict)
    strict_model_inference: bool = True
    strict_backtest: bool = True
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DatasetRequest(BaseModel):
    pair: TradingPair
    interval: str = "1m"
    context_intervals: list[str] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    window_size: int = 30
    stride: int = 1
    feature_set_version_id: str | None = None
    feature_schema_fingerprint: str | None = None
    features: list[dict] | None = None


class DatasetVersionPayload(BaseModel):
    id: str
    pair: TradingPair
    interval: str
    start_at: datetime
    end_at: datetime
    checksum: str
    dataset_hash: str | None = None
    window_size: int | None = None
    stride: int | None = None
    feature_set_version_id: str | None = None
    feature_schema_fingerprint: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DatasetPreviewResponse(BaseModel):
    version: DatasetVersionPayload
    window_count: int


class DriftCheckRequest(BaseModel):
    agent_id: str
    metric: str
    baseline_value: float
    current_value: float
    threshold: float


class DriftCheckResponse(BaseModel):
    drifted: bool
    metric: str
    baseline_value: float
    current_value: float
    delta: float


class TrainingRequest(BaseModel):
    pair: TradingPair
    period_start: datetime
    period_end: datetime
    interval: str = "1m"
    context_intervals: list[str] = Field(default_factory=list)
    dataset_hash: str | None = None
    dataset_features: list[dict] | None = None
    window_size: int = 30
    stride: int = 1
    leverage: float = 1.0
    taker_fee_bps: float = 4.0
    slippage_bps: float = 1.0
    funding_weight: float = 1.0
    drawdown_penalty: float = 0.0
    feedback_rounds: int = 1
    feedback_timesteps: int = 256
    feedback_hard_ratio: float = 0.3
    timesteps: int = 5_000
    seed: int | None = None
    feature_schema_fingerprint: str | None = None
    feature_key_extras: list[str] | None = None


class TrainingResponse(BaseModel):
    artifact_base64: str
    artifact_checksum: str
    artifact_size_bytes: int
    algorithm_label: str
    hyperparameter_summary: str
