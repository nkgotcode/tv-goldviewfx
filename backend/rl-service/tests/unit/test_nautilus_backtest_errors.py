import tempfile
from datetime import datetime, timedelta, timezone

import pytest

import training.nautilus_backtest as nautilus_backtest


def _features(start: datetime, count: int) -> list[dict]:
    rows: list[dict] = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.2
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.5,
                "low": price - 0.5,
                "close": price + 0.3,
                "volume": 100 + idx,
            }
        )
    return rows


def test_backtest_raises_on_empty_results(monkeypatch):
    pytest.importorskip("nautilus_trader")

    class _EmptyNode:
        def __init__(self, _configs):
            pass

        def run(self):
            return []

    monkeypatch.setattr(nautilus_backtest, "BacktestNode", _EmptyNode)

    start = datetime.now(tz=timezone.utc) - timedelta(minutes=20)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        handle.write(b"fake-model")
        handle.flush()

        with pytest.raises(RuntimeError, match="Nautilus backtest produced no results"):
            nautilus_backtest.run_backtest(
                pair="Gold-USDT",
                interval="1m",
                features=_features(start, 12),
                model_path=handle.name,
                window_size=3,
                decision_threshold=999,
            )


def test_backtest_requires_model_when_rl_strategy_requested(monkeypatch):
    pytest.importorskip("nautilus_trader")

    class _NoopNode:
        def __init__(self, _configs):
            pass

        def run(self):
            return [object()]

    monkeypatch.setattr(nautilus_backtest, "BacktestNode", _NoopNode)

    start = datetime.now(tz=timezone.utc) - timedelta(minutes=20)
    with pytest.raises(ValueError, match="model_path is required when strategy_id includes rl_sb3_market"):
        nautilus_backtest.run_backtest(
            pair="Gold-USDT",
            interval="1m",
            features=_features(start, 12),
            model_path=None,
            window_size=3,
            decision_threshold=0.35,
            strategy_ids=["rl_sb3_market"],
        )
