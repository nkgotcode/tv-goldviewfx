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


def test_evaluations_endpoint_rejects_empty_window(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": now.isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400
