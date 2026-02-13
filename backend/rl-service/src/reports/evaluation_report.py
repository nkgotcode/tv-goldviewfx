from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from schemas import EvaluationReport, TradingPair
from training.promotion import EvaluationMetrics, PromotionCriteria, evaluate_promotion


def build_evaluation_report(
    pair: TradingPair,
    metrics: EvaluationMetrics,
    exposure_by_pair: dict[str, float],
    criteria: PromotionCriteria | None = None,
    dataset_hash: str | None = None,
    artifact_uri: str | None = None,
    backtest_run_id: str | None = None,
) -> EvaluationReport:
    decision = evaluate_promotion(metrics, criteria or PromotionCriteria())
    status = "pass" if decision.promote else "fail"
    return EvaluationReport(
        id=str(uuid4()),
        pair=pair,
        win_rate=metrics.win_rate,
        net_pnl_after_fees=metrics.net_pnl_after_fees,
        max_drawdown=metrics.max_drawdown,
        trade_count=metrics.trade_count,
        exposure_by_pair=exposure_by_pair,
        status=status,
        dataset_hash=dataset_hash,
        artifact_uri=artifact_uri,
        backtest_run_id=backtest_run_id,
        created_at=datetime.now(timezone.utc),
    )
