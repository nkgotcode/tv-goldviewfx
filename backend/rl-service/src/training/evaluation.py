from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
import logging
import tempfile

from config import load_config
from data.dataset_builder import build_dataset
from models.artifact_loader import decode_base64, fetch_artifact
from reports.evaluation_report import build_evaluation_report
from schemas import EvaluationReport, TradingPair, WalkForwardConfig
from training.nautilus_backtest import MatrixBacktestResult, run_backtest
from training.promotion import EvaluationMetrics, PromotionCriteria

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EvaluationWindow:
    pair: TradingPair
    period_start: datetime
    period_end: datetime


def _validate_window(window: EvaluationWindow) -> None:
    if window.period_end <= window.period_start:
        raise ValueError("period_end must be after period_start")


def _to_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed == parsed else None
    if isinstance(value, str) and value.strip():
        normalized = value.strip().replace("%", "")
        try:
            parsed = float(normalized)
            return parsed if parsed == parsed else None
        except ValueError:
            return None
    return None


def _to_json_value(value: object):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _to_json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_json_value(item) for item in value]
    return str(value)


def _canonical_stat_key(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return "".join(character for character in value.lower() if character.isalnum())


def _select_stats_block(raw: object) -> dict[str, object]:
    if not isinstance(raw, Mapping):
        return {}
    flattened = {str(key): value for key, value in raw.items()}
    nested_candidates = [value for value in flattened.values() if isinstance(value, Mapping)]
    if not nested_candidates:
        return flattened
    first_nested = nested_candidates[0]
    return {str(key): value for key, value in first_nested.items()} if isinstance(first_nested, Mapping) else {}


def _extract_stat(stats: dict[str, object], candidates: list[str]) -> float | None:
    if not stats:
        return None
    normalized_lookup = {_canonical_stat_key(key): value for key, value in stats.items()}
    for candidate in candidates:
        parsed = _to_float(normalized_lookup.get(_canonical_stat_key(candidate)))
        if parsed is not None:
            return parsed
    return None


def _normalize_win_rate(value: float | None) -> float:
    if value is None:
        return 0.0
    normalized = value / 100.0 if value > 1 else value
    return max(0.0, min(1.0, normalized))


def _normalize_drawdown(value: float | None) -> float:
    if value is None:
        return 0.0
    normalized = abs(value)
    if normalized > 1:
        normalized = normalized / 100.0
    return max(0.0, min(1.0, normalized))


def _extract_trade_count(backtest_result: object, stats_pnls: dict[str, object]) -> int:
    total_positions = _to_float(getattr(backtest_result, "total_positions", None))
    if total_positions is not None and total_positions >= 0:
        return int(total_positions)
    stats_trade_count = _extract_stat(stats_pnls, ["Total Positions", "Total Trades", "Trade Count", "Trades"])
    if stats_trade_count is None:
        return 0
    return int(max(0.0, stats_trade_count))


def _extract_single_backtest_metrics(backtest_result: object, drawdown_penalty: float = 0.0) -> tuple[EvaluationMetrics, dict[str, float], dict]:
    stats_pnls_raw = getattr(backtest_result, "stats_pnls", {})
    stats_returns_raw = getattr(backtest_result, "stats_returns", {})
    stats_pnls = _select_stats_block(stats_pnls_raw)
    stats_returns = _select_stats_block(stats_returns_raw)

    net_pnl_after_fees = _extract_stat(
        stats_pnls,
        ["PnL (total)", "Net PnL", "Net PnL (total)", "Total PnL", "PnL Total"],
    )
    if net_pnl_after_fees is None:
        raise RuntimeError("Nautilus backtest did not return a usable PnL metric")

    win_rate = _normalize_win_rate(_extract_stat(stats_pnls, ["Win Rate", "Win Rate %", "Winning %"]))
    max_drawdown = _normalize_drawdown(_extract_stat(stats_returns, ["Max Drawdown", "Max DD", "Drawdown Max"]))
    trade_count = _extract_trade_count(backtest_result, stats_pnls)
    adjusted_net_pnl = float(net_pnl_after_fees) - max(0.0, float(drawdown_penalty)) * max_drawdown

    metrics = EvaluationMetrics(
        win_rate=win_rate,
        net_pnl_after_fees=adjusted_net_pnl,
        max_drawdown=max_drawdown,
        trade_count=trade_count,
    )
    exposure = {"total_positions": float(trade_count)}
    diagnostics = {
        "total_positions": trade_count,
        "stats_pnls": _to_json_value(stats_pnls),
        "stats_returns": _to_json_value(stats_returns),
    }
    return metrics, exposure, diagnostics


def _extract_backtest_metrics(
    backtest_result: object | list[MatrixBacktestResult],
    drawdown_penalty: float = 0.0,
) -> tuple[EvaluationMetrics, dict[str, float], dict]:
    if not isinstance(backtest_result, list):
        return _extract_single_backtest_metrics(backtest_result, drawdown_penalty=drawdown_penalty)

    if not backtest_result:
        raise RuntimeError("Nautilus backtest produced no results")

    run_rows: list[tuple[MatrixBacktestResult, EvaluationMetrics, dict[str, float], dict]] = []
    for run in backtest_result:
        metrics, exposure, diagnostics = _extract_single_backtest_metrics(
            run.result,
            drawdown_penalty=drawdown_penalty,
        )
        run_rows.append((run, metrics, exposure, diagnostics))

    total_trade_count = int(sum(row[1].trade_count for row in run_rows))
    weighted_win_sum = float(sum(row[1].win_rate * row[1].trade_count for row in run_rows))
    mean_win_rate = float(sum(row[1].win_rate for row in run_rows)) / float(len(run_rows))
    aggregate_win_rate = weighted_win_sum / total_trade_count if total_trade_count > 0 else mean_win_rate
    aggregate_net_pnl = float(sum(row[1].net_pnl_after_fees for row in run_rows))
    aggregate_max_drawdown = float(max(row[1].max_drawdown for row in run_rows))
    aggregate_positions = float(sum(row[2].get("total_positions", 0.0) for row in run_rows))

    aggregate_metrics = EvaluationMetrics(
        win_rate=aggregate_win_rate,
        net_pnl_after_fees=aggregate_net_pnl,
        max_drawdown=aggregate_max_drawdown,
        trade_count=total_trade_count,
    )
    exposure = {"total_positions": aggregate_positions}
    diagnostics = {
        "total_positions": total_trade_count,
        "aggregate": {
            "run_count": len(run_rows),
            "win_rate": aggregate_win_rate,
            "net_pnl_after_fees": aggregate_net_pnl,
            "max_drawdown": aggregate_max_drawdown,
            "trade_count": total_trade_count,
        },
        "matrix": [
            {
                "strategy_id": row[0].strategy_id,
                "venue_id": row[0].venue_id,
                "venue_name": row[0].venue_name,
                "run_id": getattr(row[0].result, "run_id", None),
                "metrics": {
                    "win_rate": row[1].win_rate,
                    "net_pnl_after_fees": row[1].net_pnl_after_fees,
                    "max_drawdown": row[1].max_drawdown,
                    "trade_count": row[1].trade_count,
                },
                "diagnostics": row[3],
            }
            for row in run_rows
        ],
    }
    return aggregate_metrics, exposure, diagnostics


def run_evaluation(
    pair: TradingPair,
    period_start: datetime,
    period_end: datetime,
    dataset_features: list[dict] | None = None,
    artifact_base64: str | None = None,
    artifact_download_url: str | None = None,
    artifact_checksum: str | None = None,
    artifact_uri: str | None = None,
    interval: str = "5m",
    window_size: int = 30,
    stride: int = 1,
    decision_threshold: float = 0.35,
    leverage: float = 1.0,
    taker_fee_bps: float = 4.0,
    slippage_bps: float = 1.0,
    funding_weight: float = 1.0,
    drawdown_penalty: float = 0.0,
    instrument_meta: dict | None = None,
    strategy_ids: list[str] | None = None,
    venue_ids: list[str] | None = None,
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

    if artifact_base64:
        artifact = decode_base64(artifact_base64)
    else:
        artifact = fetch_artifact(artifact_download_url, expected_checksum=artifact_checksum)

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
    if not dataset["windows"]:
        raise ValueError("No evaluation windows generated")

    requested_walk_forward = walk_forward or WalkForwardConfig()
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        handle.write(artifact.data)
        handle.flush()
        try:
            backtest_results = run_backtest(
                pair=pair.value if hasattr(pair, "value") else str(pair),
                interval=interval,
                features=dataset_features,
                model_path=handle.name,
                window_size=window_size,
                decision_threshold=decision_threshold,
                instrument_meta=instrument_meta,
                strategy_ids=strategy_ids,
                venue_ids=venue_ids,
            )
        except Exception as exc:
            if not config.strict_backtest:
                logger.warning("Backtest failed with strict_backtest disabled: %s", exc, exc_info=True)
            raise RuntimeError(f"Nautilus backtest failed: {exc}") from exc

    if not backtest_results:
        raise RuntimeError("Nautilus backtest produced no results")
    backtest_run_id = getattr(backtest_results[0].result, "run_id", None)
    run_ids = [getattr(item.result, "run_id", None) for item in backtest_results if getattr(item.result, "run_id", None)]
    resolved_strategy_ids = sorted({item.strategy_id for item in backtest_results})
    resolved_venue_ids = sorted({item.venue_id for item in backtest_results})
    metrics, exposure, backtest_diagnostics = _extract_backtest_metrics(backtest_results, drawdown_penalty=drawdown_penalty)

    return build_evaluation_report(
        pair,
        metrics,
        exposure,
        criteria=criteria,
        dataset_hash=dataset["dataset_version"].get("dataset_hash") if dataset.get("dataset_version") else None,
        artifact_uri=artifact_uri,
        backtest_run_id=backtest_run_id,
        metadata={
            "evaluation_mode": "nautilus_backtest_only",
            "aggregate": {
                "source": "nautilus_backtest",
                "win_rate": metrics.win_rate,
                "net_pnl_after_fees": metrics.net_pnl_after_fees,
                "max_drawdown": metrics.max_drawdown,
                "trade_count": metrics.trade_count,
            },
            "feature_schema_fingerprint": feature_schema_fingerprint,
            "strategy_matrix": {
                "requested_strategy_ids": strategy_ids or ["all"],
                "requested_venue_ids": venue_ids or ["all"],
                "resolved_strategy_ids": resolved_strategy_ids,
                "resolved_venue_ids": resolved_venue_ids,
            },
            "walk_forward": {
                "ignored": True,
                "reason": "nautilus_backtest_only",
                "requested": {
                    "folds": requested_walk_forward.folds,
                    "purge_bars": requested_walk_forward.purge_bars,
                    "embargo_bars": requested_walk_forward.embargo_bars,
                    "min_train_bars": requested_walk_forward.min_train_bars,
                    "strict": requested_walk_forward.strict,
                },
            },
            "reward_config": {
                "leverage": leverage,
                "taker_fee_bps": taker_fee_bps,
                "slippage_bps": slippage_bps,
                "funding_weight": funding_weight,
                "drawdown_penalty": drawdown_penalty,
            },
            "instrument_meta": instrument_meta or {},
            "feature_key_extras": feature_key_extras or [],
            "nautilus": {
                "engine": "nautilus_trader",
                "run_id": backtest_run_id,
                "run_ids": run_ids,
                "run_count": len(backtest_results),
                "metrics_source": "backtest_result.stats_pnls/stats_returns",
                "metrics": backtest_diagnostics,
            },
        },
    )
