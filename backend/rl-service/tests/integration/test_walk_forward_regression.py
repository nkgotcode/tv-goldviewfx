from datetime import datetime, timedelta, timezone


def _features(start: datetime, count: int = 240):
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2100 + idx * 0.12
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


def test_walk_forward_regression_is_deterministic_for_fixed_inputs(client):
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=260)
    features = _features(start, 260)

    training = client.post(
        "/training/run",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 20,
            "stride": 1,
            "timesteps": 35,
            "seed": 17,
            "dataset_features": features,
        },
    )
    assert training.status_code == 200
    artifact_base64 = training.json()["artifact_base64"]

    payload = {
        "pair": "Gold-USDT",
        "period_start": start.isoformat(),
        "period_end": now.isoformat(),
        "window_size": 20,
        "stride": 1,
        "decision_threshold": 0.01,
        "artifact_base64": artifact_base64,
        "dataset_features": features,
        "walk_forward": {
            "folds": 4,
            "purge_bars": 1,
            "embargo_bars": 1,
            "min_train_bars": 80,
            "strict": True,
        },
    }

    first = client.post("/evaluations", json=payload)
    second = client.post("/evaluations", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200

    first_payload = first.json()
    second_payload = second.json()

    assert first_payload["win_rate"] == second_payload["win_rate"]
    assert first_payload["net_pnl_after_fees"] == second_payload["net_pnl_after_fees"]
    assert first_payload["max_drawdown"] == second_payload["max_drawdown"]
    assert first_payload["trade_count"] == second_payload["trade_count"]

    first_folds = (first_payload.get("metadata") or {}).get("fold_metrics") or []
    second_folds = (second_payload.get("metadata") or {}).get("fold_metrics") or []
    assert len(first_folds) == len(second_folds)
    assert len(first_folds) >= 1
