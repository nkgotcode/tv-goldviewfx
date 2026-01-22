from __future__ import annotations

import logging
from typing import Any


DEFAULT_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(level: str = "info") -> None:
    logging.basicConfig(
        level=level.upper(),
        format=DEFAULT_LOG_FORMAT,
    )


def get_logger(name: str | None = None) -> logging.Logger:
    return logging.getLogger(name or "rl-service")


def log_event(logger: logging.Logger, message: str, **payload: Any) -> None:
    if payload:
        logger.info("%s | %s", message, payload)
        return
    logger.info("%s", message)
