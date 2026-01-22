from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from reports.evaluation_report import build_evaluation_report
from schemas import EvaluationReport, TradeRecord, TradingPair
from training.promotion import EvaluationMetrics, PromotionCriteria

DEFAULT_FEE_RATE = 0.0004


@dataclass(frozen=True)
class EvaluationWindow:
    pair: TradingPair
    period_start: datetime
    period_end: datetime


def _validate_window(window: EvaluationWindow) -> None:
    if window.period_end <= window.period_start:
        raise ValueError("period_end must be after period_start")


def generate_synthetic_trades(window: EvaluationWindow) -> list[TradeRecord]:
    _validate_window(window)
    duration_hours = int((window.period_end - window.period_start).total_seconds() // 3600)
    if duration_hours <= 0:
        return []

    base_price = 2300.0 if window.pair == "Gold-USDT" else 2100.0
    quantity = 1.0 if window.pair == "Gold-USDT" else 0.6
    trades: list[TradeRecord] = []
    for index in range(duration_hours):
        executed_at = window.period_start + timedelta(hours=index + 1)
        side = "long" if index % 2 == 0 else "short"
        price = base_price + (index % 5) * 1.4
        pnl_direction = 1 if index % 4 != 0 else -1
        if pnl_direction > 0:
            realized_pnl = 6.0 + (index % 3)
        else:
            realized_pnl = -(1.5 + (index % 2) * 0.5)
        trades.append(
            TradeRecord(
                executed_at=executed_at,
                side=side,
                quantity=quantity,
                price=price,
                realized_pnl=realized_pnl,
            )
        )
    return trades


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
    criteria: PromotionCriteria | None = None,
) -> EvaluationReport:
    window = EvaluationWindow(pair=pair, period_start=period_start, period_end=period_end)
    trades = generate_synthetic_trades(window)
    if not trades:
        raise ValueError("No trades available for evaluation window")
    metrics = compute_evaluation_metrics(trades)
    exposure = calculate_exposure_by_pair(trades, pair)
    return build_evaluation_report(pair, metrics, exposure, criteria=criteria)
