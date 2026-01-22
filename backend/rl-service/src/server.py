from __future__ import annotations

from fastapi import FastAPI
import uvicorn

from config import load_config
from rl_logging import configure_logging, get_logger
from api.health import router as health_router
from api.inference import router as inference_router
from api.evaluations import router as evaluations_router
from api.datasets import router as datasets_router
from api.monitoring import router as monitoring_router


def create_app() -> FastAPI:
    config = load_config()
    configure_logging(config.log_level)

    app = FastAPI(title="RL Trading Agent Service", version="0.1.0")
    app.state.config = config

    logger = get_logger("rl-service.startup")
    logger.info("RL service starting", extra={"environment": config.environment})

    app.include_router(health_router)
    app.include_router(inference_router)
    app.include_router(evaluations_router)
    app.include_router(datasets_router)
    app.include_router(monitoring_router)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"status": "ready"}

    return app


app = create_app()


if __name__ == "__main__":
    runtime_config = load_config()
    uvicorn.run(
        "server:app",
        host=runtime_config.host,
        port=runtime_config.port,
        log_level=runtime_config.log_level,
        reload=False,
    )
