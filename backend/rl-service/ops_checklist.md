# RL Service Ops Checklist

- [ ] Confirm Python 3.12+ and `uv` are installed on the host.
- [ ] Verify `RL_SERVICE_PORT` is reachable from the backend runtime.
- [ ] Ensure model artifacts are available in Convex file storage (if required).
- [ ] Validate `CONVEX_URL` for artifact and market data reads.
- [ ] Run `uv run pytest` after dependency updates.
- [ ] Confirm `/health` returns `ok` before enabling live trading.
- [ ] Run an evaluation window and verify metrics populate in the dashboard.
- [ ] Monitor decision latency logs (`rl.metrics.decision_latency`) for regressions.
- [ ] Monitor learning window logs (`rl.metrics.learning_window`) for delays.
- [ ] Confirm rollback procedures are documented and tested.
