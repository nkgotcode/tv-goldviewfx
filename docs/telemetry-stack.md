# Telemetry stack (institutional spec 10.4)

Recommended observability for ingestion, backtests, training, and live trading:

- **Prometheus**: metrics exporters in each service (API, worker, RL service).
- **Grafana**: dashboards for ingestion lag, backtest runs, training curves, live PnL and latency.
- **Optional**: Loki for logs; Alertmanager for notifications.

## Env (optional)

- **API**: `GET /metrics` on the same port as the API (no auth). `METRICS_PREFIX` – prefix for metric names (e.g. `gvfx_`).
- **Worker**: `METRICS_PORT` – port for a dedicated metrics HTTP server (e.g. 9091). When set, worker listens on this port and serves `GET /metrics`.
- **RL service**: `GET /metrics` on the same port as the app (9101). Uses `prometheus_client`.

## Nomad

Existing jobs (`gvfx-api`, `gvfx-worker`, `gvfx-rl-service`) can expose a metrics port and be scraped by a Prometheus job when deployed. Add a `port "metrics"` and a sidecar or cluster Prometheus config to scrape `gvfx-api.service.nomad`, etc.
