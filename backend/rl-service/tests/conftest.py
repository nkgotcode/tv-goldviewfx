import pytest
from fastapi.testclient import TestClient

from server import create_app


@pytest.fixture(autouse=True)
def _rl_service_env(monkeypatch):
    monkeypatch.setenv("RL_ENV", "test")
    monkeypatch.setenv("RL_SERVICE_PORT", "9102")
    monkeypatch.setenv("RL_SERVICE_LOG_LEVEL", "warning")


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def client(app):
    return TestClient(app)
