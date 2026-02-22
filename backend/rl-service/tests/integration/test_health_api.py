def test_health_endpoint_reports_ml_readiness(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "ml_dependencies" in body
    assert isinstance(body["ml_dependencies"], dict)
    assert "stable_baselines3" in body["ml_dependencies"]
    assert "nautilus_trader" in body["ml_dependencies"]
    assert body["strict_model_inference"] is True
    assert body["strict_backtest"] is True
