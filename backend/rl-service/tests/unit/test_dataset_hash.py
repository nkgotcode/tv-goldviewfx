from datetime import datetime, timezone

from data.dataset_builder import build_dataset


def _features():
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return [
        {
            "timestamp": (base.replace(minute=idx)).isoformat(),
            "open": 2000 + idx,
            "high": 2001 + idx,
            "low": 1999 + idx,
            "close": 2000.5 + idx,
            "volume": 100 + idx,
        }
        for idx in range(6)
    ]


def test_dataset_hash_deterministic():
    metadata = {"pair": "Gold-USDT", "interval": "1m"}
    first = build_dataset(_features(), window_size=3, stride=1, metadata=metadata)
    second = build_dataset(_features(), window_size=3, stride=1, metadata=metadata)

    assert first["dataset_version"]["dataset_hash"] == second["dataset_version"]["dataset_hash"]


def test_dataset_hash_changes_with_metadata():
    first = build_dataset(_features(), window_size=3, stride=1, metadata={"pair": "Gold-USDT", "interval": "1m"})
    second = build_dataset(_features(), window_size=3, stride=1, metadata={"pair": "XAUTUSDT", "interval": "1m"})

    assert first["dataset_version"]["dataset_hash"] != second["dataset_version"]["dataset_hash"]
