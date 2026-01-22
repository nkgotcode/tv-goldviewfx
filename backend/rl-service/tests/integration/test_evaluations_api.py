from datetime import datetime, timedelta, timezone


def test_evaluations_endpoint_returns_report(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": (now - timedelta(hours=30)).isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 200
    report = response.json()
    assert report["pair"] == "Gold-USDT"
    assert report["trade_count"] > 0
    assert report["status"] in ("pass", "fail")


def test_evaluations_endpoint_rejects_empty_window(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": now.isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400
