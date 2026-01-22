import math
from datetime import datetime, timezone

from schemas import TradeRecord
from training.evaluation import compute_evaluation_metrics


def test_compute_evaluation_metrics_from_trades():
    now = datetime.now(tz=timezone.utc)
    trades = [
        TradeRecord(executed_at=now, side="long", quantity=1.0, price=100.0, realized_pnl=10.0),
        TradeRecord(executed_at=now, side="short", quantity=1.0, price=105.0, realized_pnl=-5.0),
        TradeRecord(executed_at=now, side="long", quantity=1.0, price=110.0, realized_pnl=20.0),
        TradeRecord(executed_at=now, side="short", quantity=1.0, price=95.0, realized_pnl=-2.0),
    ]

    metrics = compute_evaluation_metrics(trades)

    assert metrics.trade_count == 4
    assert math.isclose(metrics.win_rate, 0.5, rel_tol=1e-6)
    assert math.isclose(metrics.net_pnl_after_fees, 22.836, rel_tol=1e-3)

    assert math.isclose(metrics.max_drawdown, 0.506, rel_tol=1e-3)
