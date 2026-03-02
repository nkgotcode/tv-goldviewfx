from datetime import datetime, timedelta, timezone


class _FakeBacktestResult:
    run_id = "run-nautilus-fake"
    total_positions = 4
    stats_pnls = {"PnL (total)": 140.0, "Win Rate": 62.5, "Total Positions": 4}
    stats_returns = {"Max Drawdown": 0.08}


def _features(start: datetime, count: int) -> list[dict]:
    rows = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.25
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


def test_full_history_window_autoscale_emits_metadata(client, monkeypatch):
    import training.evaluation as evaluation_module
    from training.nautilus_backtest import MatrixBacktestResult

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
    start = now - timedelta(minutes=120)
    features = _features(start, 120)

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "window_size": 500,
            "stride": 1,
            "strategy_ids": ["ema_trend"],
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    metadata = payload.get("metadata") or {}
    autoscale = metadata.get("window_autoscale") or {}
    assert autoscale.get("autoscaled") is True
    assert autoscale.get("window_size", 0) <= len(features)
    assert autoscale.get("effective_window_count", 0) > 0


def test_interval_matrix_includes_base_and_context_intervals(client, monkeypatch):
    import training.evaluation as evaluation_module
    from training.nautilus_backtest import MatrixBacktestResult

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
    start = now - timedelta(minutes=360)
    features = _features(start, 360)

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "interval": "5m",
            "context_intervals": ["15m", "1h"],
            "window_size": 20,
            "stride": 1,
            "strategy_ids": ["ema_trend"],
            "dataset_features": features,
            "decision_threshold": 0.01,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    metadata = payload.get("metadata") or {}
    interval_matrix = ((metadata.get("nautilus") or {}).get("metrics") or {}).get("interval_matrix") or {}
    results = interval_matrix.get("results") or []
    intervals = [entry.get("interval") for entry in results]
    assert "5m" in intervals
    assert "15m" in intervals
    assert "1h" in intervals
    assert all("status" in entry for entry in results)


def test_walk_forward_contains_fold_and_interval_diagnostics(client, monkeypatch):
    import training.evaluation as evaluation_module
    from training.nautilus_backtest import MatrixBacktestResult

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
    start = now - timedelta(minutes=480)
    features = _features(start, 480)

    response = client.post(
        "/evaluations",
        json={
            "pair": "Gold-USDT",
            "period_start": start.isoformat(),
            "period_end": now.isoformat(),
            "interval": "5m",
            "context_intervals": ["15m", "7m"],
            "window_size": 20,
            "stride": 1,
            "strategy_ids": ["ema_trend"],
            "dataset_features": features,
            "decision_threshold": 0.01,
            "walk_forward": {
                "folds": 3,
                "purge_bars": 1,
                "embargo_bars": 1,
                "min_train_bars": 120,
                "strict": False,
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    metadata = payload.get("metadata") or {}
    fold_metrics = metadata.get("fold_metrics") or []
    assert len(fold_metrics) > 0
    first_fold = fold_metrics[0]
    assert isinstance(first_fold.get("interval_results"), list)
    # 7m is not a multiple of 5m and should emit a per-interval failure diagnostic
    assert any(
        (entry.get("interval") == "7m" and "reason_codes" in entry)
        for entry in first_fold.get("interval_results", [])
    )
