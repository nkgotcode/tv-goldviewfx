from datetime import datetime, timedelta, timezone


def _features(start: datetime, count: int) -> list[dict]:
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.3
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


def test_evaluations_endpoint_requires_features(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": (now - timedelta(hours=30)).isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400


def test_evaluations_endpoint_requires_artifact_for_sb3_strategy(client):
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=25)
    features = _features(start, 25)

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 3,
            "stride": 1,
            "strategy_ids": ["rl_sb3_market"],
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert response.status_code == 400
    assert "artifact payload is required when strategy_ids include rl_sb3_market" in response.text


def test_evaluations_endpoint_allows_non_rl_strategies_without_artifact(client, monkeypatch):
    import training.evaluation as evaluation_module
    from training.nautilus_backtest import MatrixBacktestResult

    class _FakeBacktestResult:
        run_id = "run-nautilus-1"
        total_positions = 3
        stats_pnls = {"PnL (total)": 120.0, "Win Rate": 66.0, "Total Positions": 3}
        stats_returns = {"Max Drawdown": 0.08}

    monkeypatch.setattr(
        evaluation_module,
        "run_backtest",
        lambda **_kwargs: [
            MatrixBacktestResult(
                strategy_id="ema_trend",
                venue_id="bingx_margin",
                venue_name="BINGX",
                result=_FakeBacktestResult(),
            )
        ],
    )

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=25)
    features = _features(start, 25)

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 3,
            "stride": 1,
            "strategy_ids": ["ema_trend"],
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["backtest_run_id"] == "run-nautilus-1"


def test_evaluations_endpoint_returns_fail_report_when_backtest_fails(client, monkeypatch):
    import training.evaluation as evaluation_module

    monkeypatch.setenv("RL_STRICT_BACKTEST", "true")

    def _raise_backtest(*args, **kwargs):
        raise RuntimeError("forced backtest failure")

    monkeypatch.setattr(evaluation_module, "run_backtest", _raise_backtest)

    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(minutes=25)
    features = _features(start, 25)

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

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "fail"
    assert payload["trade_count"] == 0
    assert payload["metadata"]["nautilus"]["metrics"]["interval_matrix"]["successful_count"] == 0
    assert payload["metadata"]["nautilus"]["metrics"]["interval_matrix"]["reason_codes"] == ["all_intervals_failed"]


def test_evaluations_endpoint_rejects_empty_window(client):
    now = datetime.now(tz=timezone.utc)
    payload = {
        "pair": "Gold-USDT",
        "period_start": now.isoformat(),
        "period_end": now.isoformat(),
    }

    response = client.post("/evaluations", json=payload)

    assert response.status_code == 400
