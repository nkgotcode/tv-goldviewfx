# Security Hardening Checklist

## Secrets and Credentials

- [x] Secrets stored in environment variables only
- [ ] API tokens not logged or committed
- [ ] Service role key used only on server-side workers
- [ ] BingX API keys restricted to required scopes and IP allowlists
- [ ] Secret rotation documented and executed via Convex env management

## API and Input Validation

- [x] All write endpoints enforce operator RBAC when API_TOKEN is set
- [x] Production ignores role headers (`x-ops-role`) when API_TOKEN is configured
- [ ] Request bodies validated and rejected on schema errors
- [x] Query params sanitized for filters and search
- [ ] Rate limits configured for ingestion endpoints
- [ ] Live trading uses client order tags and never touches non-system orders

## Data and Storage

- [ ] Access rules reviewed for Convex functions and data access
- [ ] PII and access logs have retention policy
- [ ] Vector data stored without raw secrets or keys
- [ ] Deduplication prevents unbounded record growth

## Dependency Hygiene

- [ ] Runtime and library dependencies kept on the latest stable releases
- [ ] Pinned versions reviewed and updated when new stable releases ship

## Observability and Recovery

- [x] Audit logs for trades and agent decisions are enabled
- [ ] Background jobs emit error summaries on failure
- [ ] Backups scheduled for Convex deployments (export cadence defined)
- [ ] Incident runbook documented for live trading
- [x] Idempotency replay safety validated for live order failures
