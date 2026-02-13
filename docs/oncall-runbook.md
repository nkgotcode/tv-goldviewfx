# On-Call Runbook

## Triage

- Check `/ops/alerts` for active SLO and drift alerts.
- Inspect `/ops/retry-queue` for ingestion/job retries.
- Review `/ops/gaps/health` for open data gaps.

## Immediate Actions

- Pause live runs if data integrity or risk alerts are high.
- Trigger reconciliation: `POST /ops/trading/reconcile`.
- Re-run backfills for stale sources.
- If trade executions show `missing_exchange_order_id`, monitor bounded recovery attempts (client order lookup) and review `/ops/alerts` for unresolved IDs.

## Escalation

- If alerts persist, deploy rollback via `./scripts/rollback-deploy.sh`.
- Record the incident and resolution in `activity.md`.
