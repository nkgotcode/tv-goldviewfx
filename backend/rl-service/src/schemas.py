from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class TradingPair(str, Enum):
    GOLD_USDT = "Gold-USDT"
    XAUTUSDT = "XAUTUSDT"
    PAXGUSDT = "PAXGUSDT"


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


class EvaluationRequest(BaseModel):
    pair: TradingPair
    period_start: datetime
    period_end: datetime
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
    created_at: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    environment: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class DatasetRequest(BaseModel):
    pair: TradingPair
    interval: str = "1m"
    start_at: datetime
    end_at: datetime
    window_size: int = 30
    stride: int = 1
    feature_set_version_id: str | None = None
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
    dataset_hash: str | None = None
    dataset_features: list[dict] | None = None
    window_size: int = 30
    stride: int = 1
    timesteps: int = 5_000
    seed: int | None = None


class TrainingResponse(BaseModel):
    artifact_base64: str
    artifact_checksum: str
    artifact_size_bytes: int
    algorithm_label: str
    hyperparameter_summary: str
