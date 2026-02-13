# Release Checklist

## Pre-release

- [ ] `bun test` and `bun run test:e2e:local` pass
- [ ] Update `activity.md` with verification notes
- [ ] Review `docs/production-ops.md` for current deployment notes

## Staging

- [ ] Deploy staging with `./scripts/deploy-staging.sh`
- [ ] Run smoke checks: `/health`, `/ops/gaps/health`, `/ops/alerts`
- [ ] Run perf scripts:
  - `bun scripts/perf/decision-load.ts`
  - `bun scripts/perf/ingestion-load.ts`
- [ ] Validate candle integrity gate with unsorted candle inputs
- [ ] Validate query perf for text filters (ideas/signals) under expected load

## Canary

- [ ] Deploy canary with `./scripts/deploy-canary.sh`
- [ ] Monitor alerts for 30-60 minutes
- [ ] Validate trade reconciliation and risk guardrails
- [ ] Verify idempotency replay resolves missing exchange order IDs
- [ ] Exercise manual close/cancel trade flow (reduce-only)

## Production

- [ ] Promote canary or deploy production
- [ ] Monitor `/ops/alerts` and `/ops/retry-queue`
- [ ] If issues detected, run `./scripts/rollback-deploy.sh`
