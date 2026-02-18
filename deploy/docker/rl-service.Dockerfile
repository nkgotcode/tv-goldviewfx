FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app/backend/rl-service

COPY backend/rl-service/pyproject.toml backend/rl-service/uv.lock ./
RUN uv sync --frozen --no-dev --extra ml

COPY backend/rl-service ./

ENV PYTHONPATH=/app/backend/rl-service/src
WORKDIR /app/backend/rl-service/src

CMD ["/app/backend/rl-service/.venv/bin/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9101"]
