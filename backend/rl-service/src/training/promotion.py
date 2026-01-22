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
