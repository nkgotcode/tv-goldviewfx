from datetime import datetime, timedelta, timezone


def _features(start: datetime, count: int = 180):
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.15
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.4,
                "low": price - 0.4,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )
    return rows


def test_walk_forward_evaluation_records_nautilus_metadata(client):
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=220)
    features = _features(start, 220)

    training_response = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 20,
            "stride": 1,
            "timesteps": 25,
            "dataset_features": features,
        },
    )
    assert training_response.status_code == 200
    artifact_base64 = training_response.json()["artifact_base64"]

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 20,
            "stride": 1,
            "decision_threshold": 0.01,
            "artifact_base64": artifact_base64,
            "dataset_features": features,
            "walk_forward": {
                "folds": 3,
                "purge_bars": 1,
                "embargo_bars": 1,
                "min_train_bars": 60,
                "strict": True,
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    metadata = payload.get("metadata") or {}
    assert metadata.get("evaluation_mode") == "nautilus_backtest_only"
    assert metadata.get("walk_forward", {}).get("ignored") is True
    assert metadata.get("nautilus", {}).get("engine") == "nautilus_trader"
    assert "aggregate" in metadata
