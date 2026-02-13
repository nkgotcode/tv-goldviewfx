from datetime import datetime, timedelta, timezone
from hashlib import sha256
import base64


def _features(start: datetime, count: int) -> list[dict]:
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.5
        rows.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.6,
                "low": price - 0.6,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )
    return rows


def test_training_endpoint_returns_artifact(client):
    start = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    payload = {
        "pair": "Gold-USDT",
        "period_start": start.isoformat(),
        "period_end": datetime.now(tz=timezone.utc).isoformat(),
        "window_size": 3,
        "stride": 1,
        "timesteps": 25,
        "dataset_features": _features(start, 12),
    }

    response = client.post("/training/run", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["artifact_base64"]
    assert body["artifact_checksum"]
    assert body["artifact_size_bytes"] > 0

    decoded = base64.b64decode(body["artifact_base64"])
    checksum = sha256(decoded).hexdigest()
    assert checksum == body["artifact_checksum"]


def test_training_endpoint_requires_features(client):
    response = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": datetime.now(tz=timezone.utc).isoformat(),
            "period_end": datetime.now(tz=timezone.utc).isoformat(),
        },
    )

    assert response.status_code == 400
