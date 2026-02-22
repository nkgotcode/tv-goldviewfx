from datetime import datetime, timedelta, timezone

from envs.market_env import _compute_window_features
from features.extractors import FEATURE_KEYS, extract_features, vectorize_features
from schemas import MarketSnapshot


def _candles(count: int = 40):
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 1900 + idx * 0.5
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.7,
                "low": price - 0.7,
                "close": price + 0.1,
                "volume": 150 + idx,
            }
        )
    return rows


def test_train_infer_feature_vectors_align_for_same_window():
    window = _candles(50)
    snapshot = MarketSnapshot(pair="Gold-USDT", candles=window, last_price=window[-1]["close"])
    infer_features = extract_features(snapshot, [], [], [], [])
    infer_vector = vectorize_features(infer_features, FEATURE_KEYS)

    env_features = _compute_window_features(window, FEATURE_KEYS)
    env_vector = env_features.observation.tolist()

    assert len(infer_vector) == len(env_vector)
    for idx, value in enumerate(infer_vector):
        assert abs(float(value) - float(env_vector[idx])) < 1e-4
