# Full Nomad Deployment Plan (Including Convex) with Worker-Only Exit-Node Egress

## Summary
Deploy the **entire stack on Nomad** (API, Frontend, RL service, Worker, Convex backend, Postgres, object storage) while enforcing:
- Worker-only outbound routing through Tailscale exit nodes.
- API/frontend/RL/Convex on tailnet-local routing.
- Single-active worker (`count = 1`) to avoid duplicate scheduler/ingestion runs.
- Fail-closed worker startup if exit-node egress is not validated.

## Target Architecture
- Nomad servers: 3 (including Vultr witness).
- Nomad clients: app-capable nodes only (witness excluded).
- Consul service discovery for all internal dependencies.
- Jobs:
  - `gvfx-api`
  - `gvfx-frontend`
  - `gvfx-rl-service`
  - `gvfx-worker` (with tailscale sidecar + egress guard)
  - `gvfx-convex`
  - `gvfx-postgres`
  - `gvfx-objectstore` (MinIO or equivalent S3-compatible)

## Deployment Artifacts to Add
Create `/Users/itsnk/Desktop/Coding/tv-goldviewfx/deploy/nomad/` with:

1. `gvfx-api.nomad.hcl`
2. `gvfx-frontend.nomad.hcl`
3. `gvfx-rl-service.nomad.hcl`
4. `gvfx-worker.nomad.hcl`
5. `gvfx-convex.nomad.hcl`
6. `gvfx-postgres.nomad.hcl`
7. `gvfx-objectstore.nomad.hcl`
8. `gvfx-worker-egress-check.nomad.hcl` (batch preflight)
9. `variables.example.hcl` (Nomad vars schema)
10. `README.md` (deploy order, commands, rollback)

Add runtime script:
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/scripts/tailscale/worker-egress-guard.sh`

## Service Design (Decision Complete)

### `gvfx-worker`
- `count = 1`
- Constraint: non-witness, node class `egress-worker`.
- Task group members:
  - `tailscale` sidecar (`tailscaled`, persisted state volume, tun/net_admin).
  - `egress-guard` prestart task:
    - Try `TS_EXIT_NODE_PRIMARY`, then `TS_EXIT_NODE_FALLBACKS` (ordered).
    - Verify selected exit node is active.
    - Verify egress IP in `TS_EGRESS_EXPECTED_IPS`.
    - If all fail -> non-zero exit (worker blocked).
  - `worker` task runs existing worker command.
- Restart/reschedule enabled; still never scales above 1.

### `gvfx-api`, `gvfx-frontend`, `gvfx-rl-service`
- No tailscale sidecar.
- Tailnet-local networking.
- Consul registration + HTTP checks:
  - API `/health`
  - Frontend `/`
  - RL `/health`
- Replicas:
  - API `count = 2`
  - Frontend `count = 2`
  - RL `count = 2`

### `gvfx-convex`
- `count = 1`
- Connects to `gvfx-postgres` and object store endpoint.
- Tailnet-local only, no public ingress.
- Health checks + restart policy.

### `gvfx-postgres`
- `count = 1`
- Persistent volume with explicit capacity class.
- Regular logical backup task/job defined in docs (daily snapshot).

### `gvfx-objectstore`
- `count = 1`
- Persistent volume.
- Bucket/bootstrap script for Convex artifacts path.

## Secrets and Config Contract

### Nomad vars/templates (phase 1 secrets backend)
Sensitive:
- `BINGX_API_KEY`, `BINGX_SECRET_KEY`, `API_TOKEN`
- Telegram credentials/session
- OpenAI/OpenRouter keys
- Convex secrets
- Postgres credentials
- Object store credentials
- `TS_AUTHKEY`

Non-sensitive runtime vars:
- `MARKET_GOLD_PAIRS`
- `MARKET_CRYPTO_PAIRS`
- `BINGX_MARKET_DATA_PAIRS`
- WS/scheduler intervals and toggles
- `TS_EXIT_NODE_PRIMARY`, `TS_EXIT_NODE_FALLBACKS`, `TS_EGRESS_EXPECTED_IPS`

Frontend vars:
- `NEXT_PUBLIC_API_BASE_URL=http://gvfx-api.service.consul:8787`
- `NEXT_PUBLIC_MARKET_GOLD_PAIRS=Gold-USDT,XAUTUSDT,PAXGUSDT`
- `NEXT_PUBLIC_MARKET_CRYPTO_PAIRS=ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`

Backend vars:
- `RL_SERVICE_URL=http://gvfx-rl-service.service.consul:9101`
- Pair envs above.

## Build and Release Flow
- Build immutable OCI images tagged by git SHA:
  - backend (api/worker entrypoints)
  - frontend
  - rl-service
  - convex backend
- Push to registry reachable by all Nomad clients.
- Nomad jobs reference immutable tags only (no `latest`).

## Rollout Sequence

### Phase 0: Control plane readiness
1. Verify Nomad TLS/ACL, gossip encryption, Consul integration.
2. Verify Tailnet ACL tags for Nomad servers/clients/app/db.
3. Verify storage classes/host volumes for Postgres/objectstore.

### Phase 1: Data plane first (Convex stack)
1. Deploy `gvfx-postgres`.
2. Deploy `gvfx-objectstore`.
3. Deploy `gvfx-convex`.
4. Import Convex data snapshot.
5. Validate Convex read/write + artifact store/retrieve.

### Phase 2: Stateless app services
1. Deploy `gvfx-rl-service`.
2. Deploy `gvfx-api`.
3. Deploy `gvfx-frontend`.
4. Smoke test all internal service discovery paths.

### Phase 3: Worker cutover
1. Run `gvfx-worker-egress-check` batch job.
2. Stop legacy worker process.
3. Deploy `gvfx-worker`.
4. Confirm single worker allocation + active WS ingest.

### Phase 4: Traffic switch
1. Switch users to Nomad frontend tailnet endpoint.
2. Observe for 48h with rollback readiness preserved.

## Validation / Acceptance Tests

1. Health endpoints:
- `/health`, `/ops/gaps/health`, `/ops/alerts`.
2. Worker singleton:
- exactly one running worker alloc.
3. Egress enforcement:
- worker blocked when exit-node route/IP invalid.
4. Exit-node failover:
- primary down -> fallback selected -> worker continues.
5. Convex durability:
- restart convex/postgres/objectstore; reads/writes still pass.
6. Market coverage:
- gold + crypto pairs fresh in status/gap/alerts endpoints.
7. Node drain drills:
- drain active app node, then worker node; reschedule behavior correct.
8. No duplicate ingestion windows during failover/restart.

## Rollback Plan
Trigger rollback on:
- repeated duplicate ingestion,
- unresolved Convex write failures,
- sustained API/RL instability,
- worker egress guard persistent failure.

Rollback steps:
1. Stop Nomad worker first.
2. Restore legacy worker process.
3. Route traffic back to legacy API/frontend if needed.
4. Restore latest Convex snapshot if data-plane corruption suspected.

## Public Interfaces / Contract Changes
No user-facing HTTP schema changes required.

Operational additions:
- Nomad HCL job specs under `deploy/nomad/`.
- Worker egress env contract (`TS_*` vars listed above).
- Internal service contracts via Consul DNS names.
- Convex now runs as internal Nomad-managed service.

## Assumptions and Defaults
- Existing Consul is available for Nomad integration.
- Tailnet-only access remains permanent.
- Two worker-capable nodes + one witness server are available.
- Exit node public IP list is known and stable for validation.
- Worker remains single-active until distributed locking is added in code.
