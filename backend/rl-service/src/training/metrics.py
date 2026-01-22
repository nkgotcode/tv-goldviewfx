from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from rl_logging import get_logger


@dataclass(frozen=True)
class TrainingMetrics:
    win_rate: float
    net_pnl_after_fees: float
    max_drawdown: float
    trade_count: int
    window_start: datetime
    window_end: datetime


def emit_training_metrics(metrics: TrainingMetrics) -> None:
    logger = get_logger("rl-service.training")
    logger.info(
        "training_metrics",
        extra={
            "win_rate": metrics.win_rate,
            "net_pnl_after_fees": metrics.net_pnl_after_fees,
            "max_drawdown": metrics.max_drawdown,
            "trade_count": metrics.trade_count,
            "window_start": metrics.window_start.isoformat(),
            "window_end": metrics.window_end.isoformat(),
        },
    )
