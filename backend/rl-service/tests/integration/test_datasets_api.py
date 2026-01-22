from datetime import datetime, timedelta, timezone


def test_dataset_preview_returns_version(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "interval": "1m",
        "start_at": (now - timedelta(hours=2)).isoformat(),
        "end_at": now.isoformat(),
        "window_size": 5,
        "stride": 1,
    }

    response = client.post("/datasets/preview", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["version"]["checksum"]
    assert body["window_count"] > 0
