# Security Hardening Checklist

## Secrets and Credentials

- [ ] Secrets stored in environment variables only
- [ ] API tokens not logged or committed
- [ ] Service role key used only on server-side workers
- [ ] BingX API keys restricted to required scopes and IP allowlists

## API and Input Validation

- [ ] All write endpoints require auth when API_TOKEN is set
- [ ] Request bodies validated and rejected on schema errors
- [ ] Query params sanitized for filters and search
- [ ] Rate limits configured for ingestion endpoints
- [ ] Live trading uses client order tags and never touches non-system orders

## Data and Storage

- [ ] RLS policies reviewed for Supabase tables
- [ ] PII and access logs have retention policy
- [ ] Vector data stored without raw secrets or keys
- [ ] Deduplication prevents unbounded record growth

## Dependency Hygiene

- [ ] Runtime and library dependencies kept on the latest stable releases
- [ ] Pinned versions reviewed and updated when new stable releases ship

## Observability and Recovery

- [ ] Audit logs for trades and agent decisions are enabled
- [ ] Background jobs emit error summaries on failure
- [ ] Backups scheduled for Supabase project
- [ ] Incident runbook documented for live trading
