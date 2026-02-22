from datetime import datetime, timedelta, timezone


def test_evaluations_endpoint_requires_features(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": (now - timedelta(hours=30)).isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400


def test_evaluations_endpoint_fails_when_backtest_fails_in_strict_mode(client, monkeypatch):
    import training.evaluation as evaluation_module

    monkeypatch.setenv("RL_STRICT_BACKTEST", "true")

    def _raise_backtest(*args, **kwargs):
        raise RuntimeError("forced backtest failure")

    monkeypatch.setattr(evaluation_module, "run_backtest", _raise_backtest)

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=25)
    features = []
    for idx in range(25):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.3
        features.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.4,
                "low": price - 0.4,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )

    training_response = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 3,
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
            "window_size": 3,
            "stride": 1,
            "artifact_base64": artifact_base64,
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert response.status_code == 500
    assert "Nautilus backtest failed" in response.text


def test_evaluations_endpoint_rejects_empty_window(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": now.isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400
