from datetime import datetime, timedelta, timezone


def _training_features(start: datetime, count: int) -> list[dict]:
    rows: list[dict] = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.4
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.5,
                "low": price - 0.5,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )
    return rows


def _market_candles(start: datetime, count: int) -> list[dict]:
    rows: list[dict] = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2050 + idx * 0.3
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.4,
                "low": price - 0.4,
                "close": price + 0.1,
                "volume": 120 + idx,
            }
        )
    return rows


def test_inference_endpoint_requires_model_artifact_in_strict_mode(client, monkeypatch):
    monkeypatch.setenv("RL_STRICT_MODEL_INFERENCE", "true")
    start = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    payload = {
        "pair": "Gold-USDT",
        "market": {
            "pair": "Gold-USDT",
            "candles": _market_candles(start, 10),
            "last_price": 2055.0,
            "spread": 0.1,
        },
    }

    response = client.post("/inference", json=payload)

    assert response.status_code == 400
    assert "Strict inference requires policy_version and artifact payload" in response.text


def test_inference_endpoint_uses_sb3_model_with_artifact(client, monkeypatch):
    monkeypatch.setenv("RL_STRICT_MODEL_INFERENCE", "true")
    start = datetime.now(tz=timezone.utc) - timedelta(minutes=20)

    training_response = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": datetime.now(tz=timezone.utc).isoformat(),
            "window_size": 3,
            "stride": 1,
            "timesteps": 25,
            "dataset_features": _training_features(start, 20),
        },
    )
    assert training_response.status_code == 200
    artifact_base64 = training_response.json()["artifact_base64"]
    artifact_checksum = training_response.json()["artifact_checksum"]

    response = client.post(
        "/inference",
        json={
            "pair": "Gold-USDT",
            "policy_version": "test-model-v1",
            "artifact_base64": artifact_base64,
            "artifact_checksum": artifact_checksum,
            "market": {
                "pair": "Gold-USDT",
                "candles": _market_candles(start, 15),
                "last_price": 2060.0,
                "spread": 0.1,
            },
            "ideas": [],
            "signals": [],
            "news": [],
            "ocr": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["decision"]["action"] in {"long", "short", "hold", "close"}
    assert "model_unavailable" not in body["warnings"]
    assert body["model_version"] == "test-model-v1"
