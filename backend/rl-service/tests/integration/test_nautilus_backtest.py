import base64
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

from training.nautilus_backtest import run_backtest
from training.sb3_trainer import TrainingConfig, train_policy


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


def _windows(start: datetime, count: int, window_size: int) -> list[list[dict]]:
    rows = _features(start, count)
    windows: list[list[dict]] = []
    for idx in range(count - window_size + 1):
        windows.append(rows[idx : idx + window_size])
    return windows


def test_nautilus_backtest_returns_result():
    pytest.importorskip("nautilus_trader")
    pytest.importorskip("stable_baselines3")

    start = datetime.now(tz=timezone.utc) - timedelta(minutes=200)
    training_windows = _windows(start, count=12, window_size=3)
    training = train_policy(training_windows, TrainingConfig(timesteps=5, seed=11))

    payload = base64.b64decode(training.artifact_base64)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        handle.write(payload)
        handle.flush()

        result = run_backtest(
            pair="Gold-USDT",
            interval="1m",
            features=_features(start, 120),
            model_path=handle.name,
            window_size=5,
            decision_threshold=999,
        )

    assert result.run_id
    assert hasattr(result, "stats_returns")
    assert hasattr(result, "stats_pnls")
