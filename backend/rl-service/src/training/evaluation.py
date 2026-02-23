from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import logging
import tempfile

import numpy as np

from config import load_config
from data.dataset_builder import build_dataset
from envs.market_env import _compute_window_features
from features.extractors import resolve_feature_keys
from models.artifact_loader import decode_base64, fetch_artifact
from models.registry import load_sb3_model_from_bytes
from reports.evaluation_report import build_evaluation_report
from schemas import EvaluationReport, TradeRecord, TradingPair
from training.nautilus_backtest import run_backtest
from training.promotion import EvaluationMetrics, PromotionCriteria
from training.walk_forward import build_walk_forward_folds
from schemas import WalkForwardConfig

DEFAULT_FEE_RATE = 0.0004
logger = logging.getLogger(__name__)


def _fee_rate_from_bps(taker_fee_bps: float, slippage_bps: float) -> float:
    taker = max(0.0, float(taker_fee_bps)) / 10_000.0
    slippage = max(0.0, float(slippage_bps)) / 10_000.0
    return taker + slippage


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


def compute_evaluation_metrics(
    trades: list[TradeRecord],
    fee_rate: float = DEFAULT_FEE_RATE,
    drawdown_penalty: float = 0.0,
) -> EvaluationMetrics:
    net_pnls = calculate_trade_net_pnls(trades, fee_rate)
    max_drawdown = calculate_max_drawdown(net_pnls)
    net_pnl_after_fees = sum(net_pnls) - max(0.0, float(drawdown_penalty)) * max_drawdown
    return EvaluationMetrics(
        win_rate=calculate_win_rate(trades),
        net_pnl_after_fees=net_pnl_after_fees,
        max_drawdown=max_drawdown,
        trade_count=len(trades),
    )


def _build_trade_records(
    windows: list[list[dict]],
    model,
    decision_threshold: float,
    period_start: datetime,
    start_idx: int,
    end_idx: int,
    leverage: float,
    funding_weight: float,
    feature_keys: list[str],
) -> list[TradeRecord]:
    if end_idx - start_idx < 2:
        return []
    trades: list[TradeRecord] = []
    for idx in range(start_idx, end_idx - 1):
        current_window = windows[idx]
        next_window = windows[idx + 1]
        features = _compute_window_features(current_window, feature_keys)
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
        if current_close <= 0:
            continue
        position = float(np.clip(score, -1.0, 1.0))
        price_return = (next_close - current_close) / current_close
        funding_rate = float(current_window[-1].get("funding_rate", 0.0) or 0.0)
        pnl = position * price_return * leverage - position * funding_rate * funding_weight * leverage
        executed_at = current_window[-1].get("timestamp") or period_start
        trades.append(
            TradeRecord(
                executed_at=executed_at,
                side="long" if position > 0 else "short",
                quantity=max(abs(position), 1e-6),
                price=current_close,
                realized_pnl=pnl,
            )
        )
    return trades


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
    leverage: float = 1.0,
    taker_fee_bps: float = 4.0,
    slippage_bps: float = 1.0,
    funding_weight: float = 1.0,
    drawdown_penalty: float = 0.0,
    feature_key_extras: list[str] | None = None,
    criteria: PromotionCriteria | None = None,
    walk_forward: WalkForwardConfig | None = None,
    feature_schema_fingerprint: str | None = None,
) -> EvaluationReport:
    config = load_config()
    window = EvaluationWindow(pair=pair, period_start=period_start, period_end=period_end)
    _validate_window(window)
    if not dataset_features:
        raise ValueError("dataset_features are required for evaluation")
    if not artifact_base64 and not artifact_download_url:
        raise ValueError("artifact payload is required for evaluation")
    fee_rate = _fee_rate_from_bps(taker_fee_bps=taker_fee_bps, slippage_bps=slippage_bps)
    leverage = max(0.0, float(leverage))
    funding_weight = max(0.0, float(funding_weight))

    if artifact_base64:
        artifact = decode_base64(artifact_base64)
    else:
        artifact = fetch_artifact(artifact_download_url, expected_checksum=artifact_checksum)

    model = load_sb3_model_from_bytes(artifact.data)
    feature_keys = resolve_feature_keys(feature_key_extras)

    dataset = build_dataset(
        dataset_features,
        window_size=window_size,
        stride=stride,
        metadata={
            "pair": pair,
            "interval": interval,
            "start_at": period_start,
            "end_at": period_end,
            "feature_schema_fingerprint": feature_schema_fingerprint,
        },
    )
    windows = dataset["windows"]
    if not windows:
        raise ValueError("No evaluation windows generated")
    folds = walk_forward or WalkForwardConfig()
    fold_ranges = build_walk_forward_folds(
        total_windows=len(windows),
        folds=folds.folds,
        purge_bars=folds.purge_bars,
        embargo_bars=folds.embargo_bars,
        min_train_bars=folds.min_train_bars,
        strict=folds.strict,
    )
    if not fold_ranges:
        raise ValueError("No walk-forward folds available for evaluation")

    fold_metrics: list[dict] = []
    all_trades: list[TradeRecord] = []
    for fold in fold_ranges:
        fold_trades = _build_trade_records(
            windows=windows,
            model=model,
            decision_threshold=decision_threshold,
            period_start=period_start,
            start_idx=fold.test_start,
            end_idx=fold.test_end,
            leverage=leverage,
            funding_weight=funding_weight,
            feature_keys=feature_keys,
        )
        if not fold_trades and folds.strict:
            raise ValueError(f"No trades available for fold {fold.fold}")
        metrics = compute_evaluation_metrics(fold_trades, fee_rate=fee_rate, drawdown_penalty=drawdown_penalty)
        fold_status = "pass"
        if criteria:
            from training.promotion import evaluate_promotion

            fold_status = "pass" if evaluate_promotion(metrics, criteria).promote else "fail"
        fold_metrics.append(
            {
                "fold": fold.fold,
                "start": windows[fold.test_start][0].get("timestamp"),
                "end": windows[max(fold.test_start, fold.test_end - 1)][-1].get("timestamp"),
                "win_rate": metrics.win_rate,
                "net_pnl_after_fees": metrics.net_pnl_after_fees,
                "max_drawdown": metrics.max_drawdown,
                "trade_count": metrics.trade_count,
                "status": fold_status,
            }
        )
        all_trades.extend(fold_trades)

    if not all_trades:
        raise ValueError("No trades available for evaluation window")

    metrics = compute_evaluation_metrics(all_trades, fee_rate=fee_rate, drawdown_penalty=drawdown_penalty)
    exposure = calculate_exposure_by_pair(all_trades, pair)
    fold_count = len(fold_metrics)
    aggregate = {
        "folds": fold_count,
        "pass_rate": (sum(1 for fold in fold_metrics if fold["status"] == "pass") / fold_count) if fold_count else 0.0,
        "win_rate_avg": float(sum(fold["win_rate"] for fold in fold_metrics) / fold_count) if fold_count else 0.0,
        "net_pnl_after_fees_total": float(sum(fold["net_pnl_after_fees"] for fold in fold_metrics)),
        "max_drawdown_worst": float(max((fold["max_drawdown"] for fold in fold_metrics), default=0.0)),
        "trade_count_total": int(sum(fold["trade_count"] for fold in fold_metrics)),
    }

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
            if config.strict_backtest:
                raise RuntimeError(f"Nautilus backtest failed: {exc}") from exc
            logger.warning("Backtest failed: %s", exc, exc_info=True)

    return build_evaluation_report(
        pair,
        metrics,
        exposure,
        criteria=criteria,
        dataset_hash=dataset["dataset_version"].get("dataset_hash") if dataset.get("dataset_version") else None,
        artifact_uri=artifact_uri,
        backtest_run_id=backtest_run_id,
        metadata={
            "fold_metrics": fold_metrics,
            "aggregate": aggregate,
            "feature_schema_fingerprint": feature_schema_fingerprint,
            "walk_forward": {
                "folds": folds.folds,
                "purge_bars": folds.purge_bars,
                "embargo_bars": folds.embargo_bars,
                "min_train_bars": folds.min_train_bars,
                "strict": folds.strict,
            },
            "reward_config": {
                "leverage": leverage,
                "taker_fee_bps": taker_fee_bps,
                "slippage_bps": slippage_bps,
                "funding_weight": funding_weight,
                "drawdown_penalty": drawdown_penalty,
            },
            "feature_key_extras": feature_key_extras or [],
        },
    )
