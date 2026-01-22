from training.promotion import EvaluationMetrics, evaluate_promotion


def test_promotion_accepts_strong_metrics():
    metrics = EvaluationMetrics(win_rate=0.6, net_pnl_after_fees=120.0, max_drawdown=0.1, trade_count=40)
    decision = evaluate_promotion(metrics)

    assert decision.promote is True
    assert decision.reasons == []


def test_promotion_rejects_low_win_rate():
    metrics = EvaluationMetrics(win_rate=0.4, net_pnl_after_fees=120.0, max_drawdown=0.1, trade_count=40)
    decision = evaluate_promotion(metrics)

    assert decision.promote is False
    assert "win_rate_below_threshold" in decision.reasons
