# Disaster Recovery Runbook

## Backup cadence

- Run `npx convex export --path data/backups/$(date +%Y%m%d-%H%M%S)` at least daily for production.
- Store exports in offsite storage (encrypted object storage or vault).

## Restore procedure

1. Identify the target backup folder.
2. Disable external ingestion jobs and trading runs.
3. Import tables with replace semantics:

```bash
npx convex import --replace --table ideas data/backups/<timestamp>/ideas.jsonl
npx convex import --replace --table trades data/backups/<timestamp>/trades.jsonl
```

4. Re-enable jobs and verify:
   - `GET /health`
   - `GET /ops/gaps/health`
   - `GET /ops/trading/risk`

## Validation checklist

- Confirm critical tables restored (trades, trade_executions, agent_runs, risk limits).
- Re-run ingestion backfills for the last 24h to fill any gaps.
- Record the incident and recovery steps in `activity.md`.
