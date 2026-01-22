def test_drift_endpoint_detects_drift(client):
    payload = {
        "agent_id": "gold-rl-agent",
        "metric": "win_rate",
        "baseline_value": 0.5,
        "current_value": 0.7,
        "threshold": 0.1,
    }

    response = client.post("/monitoring/drift", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["drifted"] is True
    assert data["metric"] == "win_rate"


def test_drift_endpoint_rejects_negative_threshold(client):
    payload = {
        "agent_id": "gold-rl-agent",
        "metric": "win_rate",
        "baseline_value": 0.5,
        "current_value": 0.6,
        "threshold": -0.1,
    }

    response = client.post("/monitoring/drift", json=payload)

    assert response.status_code == 400
