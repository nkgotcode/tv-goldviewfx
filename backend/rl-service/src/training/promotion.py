from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EvaluationMetrics:
    win_rate: float
    net_pnl_after_fees: float
    max_drawdown: float
    trade_count: int


@dataclass(frozen=True)
class PromotionCriteria:
    min_win_rate: float = 0.55
    min_net_pnl: float = 0.0
    max_drawdown: float = 0.25
    min_trade_count: int = 20


@dataclass(frozen=True)
class PromotionDecision:
    promote: bool
    reasons: list[str]


def evaluate_promotion(metrics: EvaluationMetrics, criteria: PromotionCriteria = PromotionCriteria()) -> PromotionDecision:
    reasons: list[str] = []

    if metrics.win_rate < criteria.min_win_rate:
        reasons.append("win_rate_below_threshold")
    if metrics.net_pnl_after_fees <= criteria.min_net_pnl:
        reasons.append("net_pnl_non_positive")
    if metrics.max_drawdown > criteria.max_drawdown:
        reasons.append("drawdown_too_high")
    if metrics.trade_count < criteria.min_trade_count:
        reasons.append("insufficient_trade_count")

    return PromotionDecision(promote=len(reasons) == 0, reasons=reasons)


def should_promote(metrics: EvaluationMetrics, criteria: PromotionCriteria = PromotionCriteria()) -> bool:
    return evaluate_promotion(metrics, criteria).promote


# Walk-forward and model registry promotion (institutional spec 8.2)
PROMOTION_NET_RETURN_IMPROVEMENT_PCT = 5.0   # Beats current champion by +5% net return
PROMOTION_MAX_DRAWDOWN_RELATIVE_WORSE = 0.10  # Max drawdown not worse by more than +10% relative
PROMOTION_MIN_TRADE_COUNT = 25
PROMOTION_MAX_SINGLE_TRADE_PNL_PCT = 0.50   # No single-trade dominance (e.g. no trade > 50% of total PnL)


@dataclass(frozen=True)
class ChampionComparison:
    challenger_net_return: float
    champion_net_return: float
    challenger_max_drawdown: float
    champion_max_drawdown: float
    challenger_trade_count: int
    challenger_trades_pnl_list: list[float]  # For single-trade dominance check


def evaluate_registry_promotion(
    comparison: ChampionComparison,
    min_improvement_pct: float = PROMOTION_NET_RETURN_IMPROVEMENT_PCT,
    max_drawdown_worse_pct: float = PROMOTION_MAX_DRAWDOWN_RELATIVE_WORSE,
    min_trade_count: int = PROMOTION_MIN_TRADE_COUNT,
    max_single_trade_pnl_pct: float = PROMOTION_MAX_SINGLE_TRADE_PNL_PCT,
) -> PromotionDecision:
    """Default promotion rules: beats champion, drawdown gate, sanity checks."""
    reasons: list[str] = []
    if comparison.challenger_net_return <= comparison.champion_net_return * (1 + min_improvement_pct / 100):
        reasons.append("net_return_improvement_below_threshold")
    drawdown_allowance = comparison.champion_max_drawdown * (1 + max_drawdown_worse_pct)
    if comparison.challenger_max_drawdown > drawdown_allowance:
        reasons.append("max_drawdown_worse_than_allowed")
    if comparison.challenger_trade_count < min_trade_count:
        reasons.append("insufficient_trade_count")
    total_pnl = sum(comparison.challenger_trades_pnl_list)
    if total_pnl and comparison.challenger_trades_pnl_list:
        max_single = max(abs(p) for p in comparison.challenger_trades_pnl_list)
        if max_single > abs(total_pnl) * max_single_trade_pnl_pct:
            reasons.append("single_trade_dominance")
    return PromotionDecision(promote=len(reasons) == 0, reasons=reasons)
