from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from models.registry import ModelRegistry
from training.metrics import TrainingMetrics, emit_training_metrics
from training.promotion import EvaluationMetrics, PromotionCriteria, evaluate_promotion


@dataclass(frozen=True)
class LearningUpdateResult:
    status: str
    promoted: bool
    reasons: list[str]
    completed_at: datetime


class ContinuousTrainer:
    def __init__(self, registry: ModelRegistry, criteria: PromotionCriteria | None = None) -> None:
        self._registry = registry
        self._criteria = criteria or PromotionCriteria()

    def run_update(
        self,
        version_id: str,
        metrics: EvaluationMetrics,
        window_start: datetime,
        window_end: datetime,
    ) -> LearningUpdateResult:
        emit_training_metrics(
            TrainingMetrics(
                win_rate=metrics.win_rate,
                net_pnl_after_fees=metrics.net_pnl_after_fees,
                max_drawdown=metrics.max_drawdown,
                trade_count=metrics.trade_count,
                window_start=window_start,
                window_end=window_end,
            )
        )

        decision = evaluate_promotion(metrics, self._criteria)
        if decision.promote:
            self._registry.register(version_id, {"status": "promoted"})
            status = "succeeded"
        else:
            status = "failed"

        return LearningUpdateResult(
            status=status,
            promoted=decision.promote,
            reasons=decision.reasons,
            completed_at=datetime.utcnow(),
        )
