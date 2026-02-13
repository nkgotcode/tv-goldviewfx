from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
import tempfile

import numpy as np

from data.dataset_builder import build_dataset
from envs.market_env import _compute_window_features
from features.extractors import FEATURE_KEYS
from models.artifact_loader import decode_base64, fetch_artifact
from models.registry import load_sb3_model_from_bytes
from reports.evaluation_report import build_evaluation_report
from schemas import EvaluationReport, TradeRecord, TradingPair
from training.nautilus_backtest import run_backtest
from training.promotion import EvaluationMetrics, PromotionCriteria

DEFAULT_FEE_RATE = 0.0004
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EvaluationWindow:
    pair: TradingPair
    period_start: datetime
    period_end: datetime


def _validate_window(window: EvaluationWindow) -> None:
    if window.period_end <= window.period_start:
        raise ValueError("period_end must be after period_start")


def calculate_trade_net_pnls(trades: list[TradeRecord], fee_rate: float = DEFAULT_FEE_RATE) -> list[float]:
    net_pnls: list[float] = []
    for trade in trades:
        realized = trade.realized_pnl or 0.0
        notional = abs(trade.quantity * trade.price)
        fee = notional * fee_rate
        net_pnls.append(realized - fee)
    return net_pnls


def calculate_win_rate(trades: list[TradeRecord]) -> float:
    if not trades:
        return 0.0
    wins = sum(1 for trade in trades if (trade.realized_pnl or 0) > 0)
    return wins / len(trades)


def calculate_net_pnl_after_fees(trades: list[TradeRecord], fee_rate: float = DEFAULT_FEE_RATE) -> float:
    return sum(calculate_trade_net_pnls(trades, fee_rate))


def calculate_max_drawdown(net_pnls: list[float]) -> float:
    peak = 0.0
    cumulative = 0.0
    max_drawdown = 0.0
    for pnl in net_pnls:
        cumulative += pnl
        peak = max(peak, cumulative)
        if peak <= 0:
            continue
        drawdown = (peak - cumulative) / peak
        max_drawdown = max(max_drawdown, drawdown)
    return max_drawdown


def calculate_exposure_by_pair(trades: list[TradeRecord], pair: TradingPair) -> dict[str, float]:
    notional = sum(abs(trade.quantity * trade.price) for trade in trades)
    return {pair: notional}


def compute_evaluation_metrics(trades: list[TradeRecord], fee_rate: float = DEFAULT_FEE_RATE) -> EvaluationMetrics:
    net_pnls = calculate_trade_net_pnls(trades, fee_rate)
    return EvaluationMetrics(
        win_rate=calculate_win_rate(trades),
        net_pnl_after_fees=sum(net_pnls),
        max_drawdown=calculate_max_drawdown(net_pnls),
        trade_count=len(trades),
    )


def run_evaluation(
    pair: TradingPair,
    period_start: datetime,
    period_end: datetime,
    dataset_features: list[dict] | None = None,
    artifact_base64: str | None = None,
    artifact_download_url: str | None = None,
    artifact_checksum: str | None = None,
    artifact_uri: str | None = None,
    interval: str = "1m",
    window_size: int = 30,
    stride: int = 1,
    decision_threshold: float = 0.2,
    criteria: PromotionCriteria | None = None,
) -> EvaluationReport:
    window = EvaluationWindow(pair=pair, period_start=period_start, period_end=period_end)
    _validate_window(window)
    if not dataset_features:
        raise ValueError("dataset_features are required for evaluation")
    if not artifact_base64 and not artifact_download_url:
        raise ValueError("artifact payload is required for evaluation")

    if artifact_base64:
        artifact = decode_base64(artifact_base64)
    else:
        artifact = fetch_artifact(artifact_download_url, expected_checksum=artifact_checksum)

    model = load_sb3_model_from_bytes(artifact.data)

    dataset = build_dataset(
        dataset_features,
        window_size=window_size,
        stride=stride,
        metadata={
            "pair": pair,
            "interval": interval,
            "start_at": period_start,
            "end_at": period_end,
        },
    )
    windows = dataset["windows"]
    if not windows:
        raise ValueError("No evaluation windows generated")

    trades: list[TradeRecord] = []
    for idx in range(len(windows) - 1):
        current_window = windows[idx]
        next_window = windows[idx + 1]
        features = _compute_window_features(current_window, FEATURE_KEYS)
        observation = np.array(features.observation, dtype=float)
        action, _ = model.predict(observation, deterministic=True)
        try:
            score = float(action)
        except (TypeError, ValueError):
            score = float(np.array(action).reshape(-1)[0])
        if abs(score) < decision_threshold:
            continue

        current_close = float(current_window[-1].get("close", 0.0))
        next_close = float(next_window[-1].get("close", current_close))
        pnl = (next_close - current_close) * (1 if score > 0 else -1)
        trades.append(
            TradeRecord(
                executed_at=period_start,
                side="long" if score > 0 else "short",
                quantity=1.0,
                price=current_close,
                realized_pnl=pnl,
            )
        )

    if not trades:
        raise ValueError("No trades available for evaluation window")

    metrics = compute_evaluation_metrics(trades)
    exposure = calculate_exposure_by_pair(trades, pair)

    backtest_run_id = None
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        handle.write(artifact.data)
        handle.flush()
        try:
            backtest_result = run_backtest(
                pair=pair.value if hasattr(pair, "value") else str(pair),
                interval=interval,
                features=dataset_features,
                model_path=handle.name,
                window_size=window_size,
                decision_threshold=decision_threshold,
            )
            backtest_run_id = getattr(backtest_result, "run_id", None)
        except Exception as exc:
            logger.warning("Backtest failed: %s", exc, exc_info=True)

    return build_evaluation_report(
        pair,
        metrics,
        exposure,
        criteria=criteria,
        dataset_hash=dataset["dataset_version"].get("dataset_hash") if dataset.get("dataset_version") else None,
        artifact_uri=artifact_uri,
        backtest_run_id=backtest_run_id,
    )
