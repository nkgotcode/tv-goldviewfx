from training.evaluation import _extract_backtest_metrics


class _BacktestResultStub:
    def __init__(self):
        self.total_positions = 12
        self.stats_pnls = {
            "USDT": {
                "PnL (total)": 150.5,
                "Win Rate": 62.5,
            }
        }
        self.stats_returns = {
            "USDT": {
                "Max Drawdown": 18.0,
            }
        }


def test_extract_backtest_metrics_from_nautilus_stats():
    metrics, exposure, diagnostics = _extract_backtest_metrics(_BacktestResultStub(), drawdown_penalty=0.5)

    assert metrics.trade_count == 12
    assert metrics.win_rate == 0.625
    assert metrics.max_drawdown == 0.18
    assert metrics.net_pnl_after_fees == 150.5 - (0.5 * 0.18)
    assert exposure["total_positions"] == 12.0
    assert diagnostics["total_positions"] == 12
