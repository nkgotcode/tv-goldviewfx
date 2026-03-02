from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import math
import os
import tempfile

from config import load_config
from data.dataset_builder import build_dataset
from models.artifact_loader import decode_base64, fetch_artifact
from reports.evaluation_report import build_evaluation_report
from schemas import EvaluationReport, TradingPair, WalkForwardConfig
from training.nautilus_backtest import DEFAULT_STRATEGY_IDS, MatrixBacktestResult, run_backtest
from training.promotion import EvaluationMetrics, PromotionCriteria, evaluate_promotion
from training.walk_forward import build_walk_forward_folds

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


def _count_windows(total_rows: int, window_size: int, stride: int) -> int:
    if total_rows <= 0 or window_size <= 0 or stride <= 0 or total_rows < window_size:
        return 0
    return ((total_rows - window_size) // stride) + 1


def _resolve_window_stride(total_rows: int, window_size: int, stride: int) -> dict[str, int | bool | str]:
    max_window = max(1, int(os.getenv("RL_EVAL_MAX_WINDOW_SIZE", "4096")))
    max_windows = max(1, int(os.getenv("RL_EVAL_MAX_WINDOWS", "12000")))

    requested_window = max(1, int(window_size or 1))
    requested_stride = max(1, int(stride or 1))

    effective_window = min(requested_window, max_window)
    effective_window = min(effective_window, max(1, total_rows))
    effective_stride = requested_stride

    requested_windows = _count_windows(total_rows, requested_window, requested_stride)
    effective_windows = _count_windows(total_rows, effective_window, effective_stride)

    autoscaled = False
    reason_codes: list[str] = []

    if requested_window != effective_window:
        autoscaled = True
        reason_codes.append("window_capped")

    if effective_windows > max_windows:
        effective_stride = max(effective_stride, math.ceil((total_rows - effective_window + 1) / max_windows))
        autoscaled = True
        reason_codes.append("stride_scaled_for_window_count")
        effective_windows = _count_windows(total_rows, effective_window, effective_stride)

    if effective_windows == 0 and total_rows > 0:
        effective_window = min(max(1, total_rows), effective_window)
        effective_stride = 1
        autoscaled = True
        reason_codes.append("window_relaxed_for_available_rows")
        effective_windows = _count_windows(total_rows, effective_window, effective_stride)

    return {
        "requested_window_size": requested_window,
        "requested_stride": requested_stride,
        "window_size": effective_window,
        "stride": effective_stride,
        "requested_window_count": requested_windows,
        "effective_window_count": effective_windows,
        "autoscaled": autoscaled,
        "reason_codes": reason_codes,
    }


def _parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid_timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _interval_to_seconds(interval: str) -> int | None:
    interval = interval.strip()
    if len(interval) < 2 or not interval[:-1].isdigit():
        return None
    amount = int(interval[:-1])
    unit = interval[-1]
    if amount <= 0:
        return None
    if unit == "m":
        return amount * 60
    if unit == "h":
        return amount * 3600
    if unit == "d":
        return amount * 86400
    return None


def _interval_reason(reason_code: str, interval: str, base_interval: str, rows: int) -> tuple[str, list[str]]:
    if reason_code == "unsupported_interval":
        return (
            f"Unsupported interval '{interval}' for matrix evaluation",
            ["Use minute/hour/day intervals (e.g. 5m, 1h, 1d)."],
        )
    if reason_code == "interval_not_multiple_of_base":
        return (
            f"Interval '{interval}' is not a clean multiple of base interval '{base_interval}'",
            ["Pick context intervals that are multiples of the base interval."],
        )
    if reason_code == "interval_shorter_than_base":
        return (
            f"Interval '{interval}' is shorter than base interval '{base_interval}'",
            ["Use a smaller base interval or remove shorter context intervals."],
        )
    if reason_code == "insufficient_rows":
        return (
            f"Not enough rows for interval '{interval}' ({rows} rows)",
            ["Expand period range or reduce window size/folds for this interval."],
        )
    if reason_code == "backtest_failed":
        return (
            f"Nautilus run failed for interval '{interval}'",
            ["Inspect interval diagnostics and strategy compatibility for this interval."],
        )
    return (
        f"Interval '{interval}' evaluation failed",
        ["Review interval diagnostics and rerun with a wider period."],
    )


def _resample_interval_features(features: list[dict], base_interval: str, target_interval: str) -> tuple[list[dict], str | None]:
    if target_interval == base_interval:
        return features, None

    base_seconds = _interval_to_seconds(base_interval)
    target_seconds = _interval_to_seconds(target_interval)
    if base_seconds is None or target_seconds is None:
        return [], "unsupported_interval"
    if target_seconds < base_seconds:
        return [], "interval_shorter_than_base"
    if target_seconds % base_seconds != 0:
        return [], "interval_not_multiple_of_base"

    rows = sorted(features, key=lambda item: _parse_timestamp(item.get("timestamp")).timestamp())
    if not rows:
        return [], None

    aggregated: list[dict] = []
    bucket_rows: list[dict] = []
    bucket_key: int | None = None

    def flush_bucket() -> None:
        if not bucket_rows:
            return
        opens = float(bucket_rows[0].get("open", 0.0))
        closes = float(bucket_rows[-1].get("close", 0.0))
        highs = max(float(row.get("high", 0.0)) for row in bucket_rows)
        lows = min(float(row.get("low", 0.0)) for row in bucket_rows)
        volume = sum(float(row.get("volume", 0.0)) for row in bucket_rows)
        ts = _parse_timestamp(bucket_rows[0].get("timestamp")).isoformat()
        aggregated.append(
            {
                "timestamp": ts,
                "open": opens,
                "high": highs,
                "low": lows,
                "close": closes,
                "volume": volume,
            }
        )

    for row in rows:
        ts = _parse_timestamp(row.get("timestamp"))
        key = int(ts.timestamp()) // target_seconds
        if bucket_key is None:
            bucket_key = key
        if key != bucket_key:
            flush_bucket()
            bucket_rows = []
            bucket_key = key
        bucket_rows.append(row)

    flush_bucket()
    return aggregated, None


def _build_interval_list(base_interval: str, context_intervals: list[str] | None) -> list[str]:
    requested = [base_interval, *(context_intervals or [])]
    seen: set[str] = set()
    resolved: list[str] = []
    for interval in requested:
        normalized = str(interval).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        resolved.append(normalized)
    return resolved


def _recommend_for_promotion_reasons(reason_codes: list[str]) -> list[str]:
    actions: list[str] = []
    for reason in reason_codes:
        if reason == "insufficient_trade_count":
            actions.append("Expand period range or lower decision threshold to increase trade count.")
        elif reason == "win_rate_below_threshold":
            actions.append("Tune strategy mix or decision threshold to improve win rate.")
        elif reason == "net_pnl_non_positive":
            actions.append("Recalibrate costs and validate strategy signal quality.")
        elif reason == "drawdown_too_high":
            actions.append("Reduce leverage/exposure and tighten risk controls.")
    return actions


def _aggregate_metrics(items: list[EvaluationMetrics]) -> EvaluationMetrics:
    if not items:
        raise RuntimeError("No successful interval runs to aggregate")
    total_trade_count = int(sum(item.trade_count for item in items))
    weighted_win_sum = float(sum(item.win_rate * item.trade_count for item in items))
    mean_win_rate = float(sum(item.win_rate for item in items)) / float(len(items))
    aggregate_win_rate = weighted_win_sum / total_trade_count if total_trade_count > 0 else mean_win_rate
    aggregate_net_pnl = float(sum(item.net_pnl_after_fees for item in items))
    aggregate_max_drawdown = float(max(item.max_drawdown for item in items))
    return EvaluationMetrics(
        win_rate=aggregate_win_rate,
        net_pnl_after_fees=aggregate_net_pnl,
        max_drawdown=aggregate_max_drawdown,
        trade_count=total_trade_count,
    )


def _aggregate_exposure(items: list[dict[str, float]]) -> dict[str, float]:
    return {"total_positions": float(sum(item.get("total_positions", 0.0) for item in items))}


def _run_interval_matrix(
    *,
    pair: TradingPair,
    base_interval: str,
    intervals: list[str],
    features: list[dict],
    model_path: str | None,
    window_size: int,
    decision_threshold: float,
    instrument_meta: dict | None,
    strategy_ids: list[str],
    venue_ids: list[str] | None,
    backtest_mode: str,
    drawdown_penalty: float,
    promotion_criteria: PromotionCriteria,
) -> tuple[EvaluationMetrics, dict[str, float], list[MatrixBacktestResult], dict]:
    successful_metrics: list[EvaluationMetrics] = []
    successful_exposure: list[dict[str, float]] = []
    successful_runs: list[MatrixBacktestResult] = []
    interval_entries: list[dict] = []

    for interval in intervals:
        interval_features, interval_error = _resample_interval_features(features, base_interval, interval)
        if interval_error is not None:
            message, actions = _interval_reason(interval_error, interval, base_interval, len(interval_features))
            interval_entries.append(
                {
                    "interval": interval,
                    "status": "fail",
                    "reason_codes": [interval_error],
                    "recommended_actions": actions,
                    "source_rows": len(features),
                    "interval_rows": len(interval_features),
                    "message": message,
                }
            )
            continue

        minimum_rows = max(window_size, 10)
        if len(interval_features) < minimum_rows:
            message, actions = _interval_reason("insufficient_rows", interval, base_interval, len(interval_features))
            interval_entries.append(
                {
                    "interval": interval,
                    "status": "fail",
                    "reason_codes": ["insufficient_rows"],
                    "recommended_actions": actions,
                    "source_rows": len(features),
                    "interval_rows": len(interval_features),
                    "minimum_rows": minimum_rows,
                    "message": message,
                }
            )
            continue

        try:
            results = run_backtest(
                pair=pair.value if hasattr(pair, "value") else str(pair),
                interval=interval,
                features=interval_features,
                model_path=model_path,
                window_size=window_size,
                decision_threshold=decision_threshold,
                instrument_meta=instrument_meta,
                strategy_ids=strategy_ids,
                venue_ids=venue_ids,
                backtest_mode=backtest_mode,
            )
            if not results:
                raise RuntimeError("Nautilus backtest produced no results")
            metrics, exposure, diagnostics = _extract_backtest_metrics(results, drawdown_penalty=drawdown_penalty)
            decision = evaluate_promotion(metrics, promotion_criteria)
            interval_entries.append(
                {
                    "interval": interval,
                    "status": "pass" if decision.promote else "fail",
                    "reason_codes": decision.reasons,
                    "recommended_actions": _recommend_for_promotion_reasons(decision.reasons),
                    "source_rows": len(features),
                    "interval_rows": len(interval_features),
                    "metrics": {
                        "win_rate": metrics.win_rate,
                        "net_pnl_after_fees": metrics.net_pnl_after_fees,
                        "max_drawdown": metrics.max_drawdown,
                        "trade_count": metrics.trade_count,
                    },
                    "run_ids": [
                        getattr(item.result, "run_id", None)
                        for item in results
                        if getattr(item.result, "run_id", None)
                    ],
                    "diagnostics": diagnostics,
                }
            )
            successful_metrics.append(metrics)
            successful_exposure.append(exposure)
            successful_runs.extend(results)
        except Exception as exc:
            message, actions = _interval_reason("backtest_failed", interval, base_interval, len(interval_features))
            interval_entries.append(
                {
                    "interval": interval,
                    "status": "fail",
                    "reason_codes": ["backtest_failed"],
                    "recommended_actions": actions,
                    "source_rows": len(features),
                    "interval_rows": len(interval_features),
                    "message": f"{message}: {exc}",
                }
            )

    if not successful_metrics:
        failures = [entry for entry in interval_entries if entry.get("status") == "fail"]
        diagnostics = {
            "requested_intervals": intervals,
            "resolved_intervals": [entry["interval"] for entry in interval_entries],
            "results": interval_entries,
            "successful_count": 0,
            "failed_count": len(failures),
            "reason_codes": ["all_intervals_failed"],
            "recommended_actions": [
                "Inspect interval diagnostics for unsupported intervals, sparse windows, or strategy/venue failures.",
                "Reduce context intervals or widen the evaluation period before retrying.",
            ],
            "aggregate": {
                "win_rate": 0.0,
                "net_pnl_after_fees": 0.0,
                "max_drawdown": 1.0,
                "trade_count": 0,
            },
        }
        metrics = EvaluationMetrics(
            win_rate=0.0,
            net_pnl_after_fees=0.0,
            max_drawdown=1.0,
            trade_count=0,
        )
        return metrics, {}, [], diagnostics

    aggregate_metrics = _aggregate_metrics(successful_metrics)
    aggregate_exposure = _aggregate_exposure(successful_exposure)
    diagnostics = {
        "requested_intervals": intervals,
        "resolved_intervals": [entry["interval"] for entry in interval_entries],
        "results": interval_entries,
        "successful_count": len(successful_metrics),
        "failed_count": len(interval_entries) - len(successful_metrics),
        "aggregate": {
            "win_rate": aggregate_metrics.win_rate,
            "net_pnl_after_fees": aggregate_metrics.net_pnl_after_fees,
            "max_drawdown": aggregate_metrics.max_drawdown,
            "trade_count": aggregate_metrics.trade_count,
        },
    }
    return aggregate_metrics, aggregate_exposure, successful_runs, diagnostics


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
    context_intervals: list[str] | None = None,
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
    backtest_mode: str = "l1",
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

    requested_strategy_ids = strategy_ids or list(DEFAULT_STRATEGY_IDS)
    requires_sb3_artifact = "rl_sb3_market" in requested_strategy_ids
    if requires_sb3_artifact and not artifact_base64 and not artifact_download_url:
        raise ValueError("artifact payload is required when strategy_ids include rl_sb3_market")
    if requires_sb3_artifact and not feature_schema_fingerprint:
        raise ValueError("feature_schema_fingerprint is required when strategy_ids include rl_sb3_market")

    artifact = None
    if artifact_base64:
        artifact = decode_base64(artifact_base64)
    elif artifact_download_url:
        artifact = fetch_artifact(artifact_download_url, expected_checksum=artifact_checksum)

    window_stride = _resolve_window_stride(len(dataset_features), window_size, stride)
    effective_window_size = int(window_stride["window_size"])
    effective_stride = int(window_stride["stride"])

    dataset = build_dataset(
        dataset_features,
        window_size=effective_window_size,
        stride=effective_stride,
        metadata={
            "pair": pair,
            "interval": interval,
            "start_at": period_start,
            "end_at": period_end,
            "feature_schema_fingerprint": feature_schema_fingerprint,
        },
    )
    if not dataset["windows"]:
        raise ValueError(
            "No evaluation windows generated after autoscale "
            f"(rows={len(dataset_features)}, requested_window={window_size}, requested_stride={stride}, "
            f"resolved_window={effective_window_size}, resolved_stride={effective_stride})"
        )

    requested_walk_forward = walk_forward or WalkForwardConfig()
    promotion_criteria = criteria or PromotionCriteria()
    walk_forward_enabled = walk_forward is not None and requested_walk_forward.folds > 1
    interval_set = _build_interval_list(interval, context_intervals)

    fold_specs: list[dict[str, int]] = []
    if walk_forward_enabled:
        min_train_default = max(effective_window_size * 2, 100)
        min_train_bars = requested_walk_forward.min_train_bars or min_train_default
        folds = build_walk_forward_folds(
            total_windows=len(dataset_features),
            folds=requested_walk_forward.folds,
            purge_bars=requested_walk_forward.purge_bars,
            embargo_bars=requested_walk_forward.embargo_bars,
            min_train_bars=min_train_bars,
            strict=requested_walk_forward.strict,
        )
        fold_specs = [
            {
                "fold": item.fold,
                "train_start": item.train_start,
                "train_end": item.train_end,
                "test_start": item.test_start,
                "test_end": item.test_end,
            }
            for item in folds
        ]
        if not fold_specs:
            raise RuntimeError("Walk-forward requested but no valid fold ranges could be generated")

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        model_path = None
        if artifact is not None:
            handle.write(artifact.data)
            handle.flush()
            model_path = handle.name

        run_count = 0
        run_ids: list[str] = []
        resolved_strategy_ids: list[str] = []
        resolved_venue_ids: list[str] = []

        if walk_forward_enabled:
            successful_fold_metrics: list[EvaluationMetrics] = []
            successful_fold_exposure: list[dict[str, float]] = []
            successful_fold_runs: list[MatrixBacktestResult] = []
            fold_entries: list[dict] = []

            for spec in fold_specs:
                fold_number = int(spec["fold"])
                start_idx = int(spec["test_start"])
                end_idx = int(spec["test_end"])
                fold_features = dataset_features[start_idx:end_idx]
                minimum_rows = max(effective_window_size, 10)
                if len(fold_features) < minimum_rows:
                    reason_codes = ["insufficient_rows"]
                    entry = {
                        "fold": fold_number,
                        "train_start_index": spec["train_start"],
                        "train_end_index": spec["train_end"],
                        "start_index": start_idx,
                        "end_index": end_idx,
                        "status": "fail",
                        "reason_codes": reason_codes,
                        "recommended_actions": [
                            "Increase period range, reduce folds, or lower min_train_bars for walk-forward."
                        ],
                        "interval_results": [],
                    }
                    if requested_walk_forward.strict:
                        raise RuntimeError(
                            f"Fold {fold_number} has insufficient rows: {len(fold_features)} (requires >= {minimum_rows})"
                        )
                    fold_entries.append(entry)
                    continue

                try:
                    fold_metric, fold_exposure, fold_runs, fold_interval_diagnostics = _run_interval_matrix(
                        pair=pair,
                        base_interval=interval,
                        intervals=interval_set,
                        features=fold_features,
                        model_path=model_path,
                        window_size=effective_window_size,
                        decision_threshold=decision_threshold,
                        instrument_meta=instrument_meta,
                        strategy_ids=requested_strategy_ids,
                        venue_ids=venue_ids,
                        backtest_mode=backtest_mode,
                        drawdown_penalty=drawdown_penalty,
                        promotion_criteria=promotion_criteria,
                    )
                    fold_decision = evaluate_promotion(fold_metric, promotion_criteria)
                    fold_entry = {
                        "fold": fold_number,
                        "train_start_index": spec["train_start"],
                        "train_end_index": spec["train_end"],
                        "start_index": start_idx,
                        "end_index": end_idx,
                        "period_start": str(fold_features[0].get("timestamp")) if fold_features else None,
                        "period_end": str(fold_features[-1].get("timestamp")) if fold_features else None,
                        "status": "pass" if fold_decision.promote else "fail",
                        "reason_codes": fold_decision.reasons,
                        "recommended_actions": _recommend_for_promotion_reasons(fold_decision.reasons),
                        "metrics": {
                            "win_rate": fold_metric.win_rate,
                            "net_pnl_after_fees": fold_metric.net_pnl_after_fees,
                            "max_drawdown": fold_metric.max_drawdown,
                            "trade_count": fold_metric.trade_count,
                        },
                        "run_ids": [
                            getattr(item.result, "run_id", None)
                            for item in fold_runs
                            if getattr(item.result, "run_id", None)
                        ],
                        "interval_results": fold_interval_diagnostics.get("results", []),
                        "diagnostics": fold_interval_diagnostics,
                    }
                    fold_entries.append(fold_entry)
                    successful_fold_metrics.append(fold_metric)
                    successful_fold_exposure.append(fold_exposure)
                    successful_fold_runs.extend(fold_runs)
                except Exception as exc:
                    if requested_walk_forward.strict:
                        raise RuntimeError(f"Walk-forward fold {fold_number} failed: {exc}") from exc
                    fold_entries.append(
                        {
                            "fold": fold_number,
                            "train_start_index": spec["train_start"],
                            "train_end_index": spec["train_end"],
                            "start_index": start_idx,
                            "end_index": end_idx,
                            "status": "fail",
                            "reason_codes": ["fold_execution_failed"],
                            "recommended_actions": [
                                "Inspect fold diagnostics and reduce strictness or fold count for small datasets."
                            ],
                            "message": str(exc),
                            "interval_results": [],
                        }
                    )

            if not successful_fold_metrics:
                logger.warning(
                    "Walk-forward produced zero successful folds; returning fail report with fold diagnostics"
                )
                metrics = EvaluationMetrics(
                    win_rate=0.0,
                    net_pnl_after_fees=0.0,
                    max_drawdown=1.0,
                    trade_count=0,
                )
                exposure = {}
                backtest_run_id = None
                run_ids = []
                resolved_strategy_ids = sorted(set(requested_strategy_ids))
                resolved_venue_ids = sorted(set(venue_ids or []))
                run_count = 0
                backtest_diagnostics = {
                    "mode": "walk_forward",
                    "fold_count_requested": requested_walk_forward.folds,
                    "fold_count_generated": len(fold_specs),
                    "fold_count_successful": 0,
                    "fold_count_failed": len(fold_entries),
                    "reason_codes": ["walk_forward_zero_successful_folds"],
                    "recommended_actions": [
                        "Increase evaluation period or reduce fold count to produce non-empty test windows.",
                        "Reduce min_train_bars or disable strict walk-forward for sparse ranges.",
                    ],
                    "interval_matrix": {
                        "requested_intervals": interval_set,
                    },
                    "folds": fold_entries,
                }
            else:
                metrics = _aggregate_metrics(successful_fold_metrics)
                exposure = _aggregate_exposure(successful_fold_exposure)
                backtest_run_id = next(
                    (
                        getattr(item.result, "run_id", None)
                        for item in successful_fold_runs
                        if getattr(item.result, "run_id", None)
                    ),
                    None,
                )
                run_ids = [
                    getattr(item.result, "run_id", None)
                    for item in successful_fold_runs
                    if getattr(item.result, "run_id", None)
                ]
                resolved_strategy_ids = sorted({item.strategy_id for item in successful_fold_runs})
                resolved_venue_ids = sorted({item.venue_id for item in successful_fold_runs})
                run_count = len(successful_fold_runs)
                backtest_diagnostics = {
                    "mode": "walk_forward",
                    "fold_count_requested": requested_walk_forward.folds,
                    "fold_count_generated": len(fold_specs),
                    "fold_count_successful": len(successful_fold_metrics),
                    "fold_count_failed": len(fold_entries) - len(successful_fold_metrics),
                    "interval_matrix": {
                        "requested_intervals": interval_set,
                    },
                    "folds": fold_entries,
                }
        else:
            try:
                metrics, exposure, successful_runs, interval_diagnostics = _run_interval_matrix(
                    pair=pair,
                    base_interval=interval,
                    intervals=interval_set,
                    features=dataset_features,
                    model_path=model_path,
                    window_size=effective_window_size,
                    decision_threshold=decision_threshold,
                    instrument_meta=instrument_meta,
                    strategy_ids=requested_strategy_ids,
                    venue_ids=venue_ids,
                    backtest_mode=backtest_mode,
                    drawdown_penalty=drawdown_penalty,
                    promotion_criteria=promotion_criteria,
                )
            except Exception as exc:
                if not config.strict_backtest:
                    logger.warning("Backtest failed with strict_backtest disabled: %s", exc, exc_info=True)
                raise RuntimeError(f"Nautilus backtest failed: {exc}") from exc

            backtest_run_id = next(
                (
                    getattr(item.result, "run_id", None)
                    for item in successful_runs
                    if getattr(item.result, "run_id", None)
                ),
                None,
            )
            run_ids = [
                getattr(item.result, "run_id", None)
                for item in successful_runs
                if getattr(item.result, "run_id", None)
            ]
            resolved_strategy_ids = sorted({item.strategy_id for item in successful_runs})
            resolved_venue_ids = sorted({item.venue_id for item in successful_runs})
            run_count = len(successful_runs)
            backtest_diagnostics = {
                "mode": "standard",
                "interval_matrix": interval_diagnostics,
            }

    sb3_min_trade_count = max(1, int(os.getenv("RL_SB3_MIN_TRADE_COUNT", str(promotion_criteria.min_trade_count))))
    sb3_readiness = {
        "enabled": requires_sb3_artifact,
        "checks": {
            "artifact_present": bool(artifact_base64 or artifact_download_url),
            "feature_schema_fingerprint_present": bool(feature_schema_fingerprint),
            "feature_schema_fingerprint_consistent": (
                bool(feature_schema_fingerprint)
                and feature_schema_fingerprint
                == (dataset.get("dataset_version") or {}).get("feature_schema_fingerprint")
            ),
            "trade_count_meets_threshold": metrics.trade_count >= sb3_min_trade_count,
        },
        "thresholds": {
            "min_trade_count": sb3_min_trade_count,
        },
    }

    return build_evaluation_report(
        pair,
        metrics,
        exposure,
        criteria=promotion_criteria,
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
                "requested_strategy_ids": requested_strategy_ids,
                "requested_venue_ids": venue_ids or ["all"],
                "resolved_strategy_ids": resolved_strategy_ids,
                "resolved_venue_ids": resolved_venue_ids,
            },
            "interval_matrix": {
                "requested_intervals": interval_set,
                "mode": backtest_diagnostics.get("mode"),
            },
            "walk_forward": {
                "ignored": not walk_forward_enabled,
                "reason": None if walk_forward_enabled else "nautilus_backtest_only",
                "resolved": {
                    "enabled": walk_forward_enabled,
                    "fold_ranges": [
                        {
                            "fold": spec["fold"],
                            "train_start_index": spec["train_start"],
                            "train_end_index": spec["train_end"],
                            "start_index": spec["test_start"],
                            "end_index": spec["test_end"],
                        }
                        for spec in fold_specs
                    ],
                },
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
            "window_autoscale": window_stride,
            "nautilus": {
                "engine": "nautilus_trader",
                "backtest_mode": backtest_mode,
                "run_id": backtest_run_id,
                "run_ids": run_ids,
                "run_count": run_count,
                "metrics_source": "backtest_result.stats_pnls/stats_returns",
                "metrics": backtest_diagnostics,
            },
            "sb3_readiness": sb3_readiness,
            "fold_metrics": backtest_diagnostics.get("folds", []) if isinstance(backtest_diagnostics, Mapping) else [],
        },
    )
