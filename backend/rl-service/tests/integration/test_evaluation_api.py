from datetime import datetime, timedelta, timezone


def _features(start: datetime, count: int) -> list[dict]:
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.4
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


def test_evaluation_endpoint_returns_report(client):
    start = datetime.now(tz=timezone.utc) - timedelta(minutes=20)
    features = _features(start, 20)

    training_response = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": datetime.now(tz=timezone.utc).isoformat(),
            "window_size": 3,
            "stride": 1,
            "timesteps": 25,
            "dataset_features": features,
        },
    )
    assert training_response.status_code == 200
    artifact_base64 = training_response.json()["artifact_base64"]

    evaluation_response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": datetime.now(tz=timezone.utc).isoformat(),
            "window_size": 3,
            "stride": 1,
            "artifact_base64": artifact_base64,
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert evaluation_response.status_code == 200
    report = evaluation_response.json()
    assert report["win_rate"] >= 0
    assert report["trade_count"] > 0
    assert report["dataset_hash"]
    assert "backtest_run_id" in report
