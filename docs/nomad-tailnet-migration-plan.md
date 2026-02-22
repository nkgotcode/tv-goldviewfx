# Nomad + Tailnet Migration Plan for tv-goldviewfx (Tailnet-only, Single-Active Worker, Self-Hosted Convex)

## Summary

Migrate this stack to Nomad across your Tailnet with:

1. 3-server Nomad quorum (including your Vultr witness server), Consul-based discovery, OCI images.
2. Stateless services (`frontend`, `api`, `rl-service`) replicated across worker nodes.
3. Scheduler/trading/ingestion worker kept single-active (count = 1) to avoid duplicate jobs.
4. Self-hosted Convex on Nomad, backed by persistent Postgres + object storage.
5. Expanded BingX market ingestion for Gold + Crypto futures pairs.
6. Dashboard split into separate Gold and Crypto sections.
7. Phased cutover with explicit failover drills and rollback gates.

## Market Scope for This Migration

- Gold section pairs:
  - `Gold-USDT`
  - `XAUTUSDT`
  - `PAXGUSDT`
- Crypto section pairs:
  - `ALGO-USDT`
  - `BTC-USDT`
  - `ETH-USDT`
  - `SOL-USDT`
  - `XRP-USDT`
  - `BNB-USDT`

All BingX feed pulls (candles, orderbook, trades, funding, open interest, mark/index, ticker) should run for both sections.

## Ground Truth From Current Repo

- Worker scheduling is in-process `setInterval` with only per-process in-flight locking, so multiple workers will double-run jobs: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/scheduler.ts`.
- Worker starts scheduler + BingX WebSocket capture: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/jobs/worker.ts`.
- API is stateless and exposes `GET /health`: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/server.ts`, `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/health.ts`.
- Frontend API endpoint is runtime env-driven (`NEXT_PUBLIC_API_BASE_URL`): `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/api.ts`.
- RL backend target is env-driven (`RL_SERVICE_URL`): `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/rl_service.ts`.
- Existing ops model already separates API + worker + RL into separate processes: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/scripts/daemonize-backend.sh`.

## Locked Decisions

- Convex: self-host on tailnet.
- Worker HA mode: single-active.
- Access mode: tailnet-only.
- Nomad control plane: include Vultr witness as third server.
- Discovery/routing: existing Consul.
- Artifact delivery: OCI registry images.
- Crypto expansion in-scope: `ALGO-USDT`, `BTC-USDT`, `ETH-USDT`, `SOL-USDT`, `XRP-USDT`, `BNB-USDT`.

## Implementation Plan

## Phase 0: Cluster Foundation

1. Configure Nomad servers on 3 nodes:
   - `server-1`: existing primary node.
   - `server-2`: second always-on node.
   - `server-3`: Vultr witness (server-only, no app workloads).
2. Keep app workloads off witness using node class constraints (`node.class != witness`).
3. Enforce Nomad production hardening now:
   - TLS/mTLS between agents.
   - Gossip encryption.
   - ACLs enabled.
4. Confirm Consul integration with Nomad service registration and health checks.
5. Configure Tailnet ACL/tags for:
   - `tag:nomad-server`, `tag:nomad-client`, `tag:gvfx-app`, `tag:gvfx-db`.
   - Restrict app ingress to Tailnet users/groups only.

## Phase 1: Containerize Runtime (No App Logic Changes)

1. Create OCI images:
   - `tv-goldviewfx-backend` (single image, separate commands for `api` and `worker`).
   - `tv-goldviewfx-frontend` (Next.js production build + `next start`).
   - `tv-goldviewfx-rl-service` (Python 3.12 + uv + uvicorn).
   - `convex-backend` (official self-hosted image).
2. Publish immutable tags (`git-sha`) to your registry.
3. Define a single environment contract file per service from existing env schemas:
   - Backend env keys from `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/env.ts`.
   - RL env keys from `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/src/config.py`.
   - Frontend keys from `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/services/api.ts`.
4. Add market catalog envs for section-aware pair pulls:
   - `MARKET_GOLD_PAIRS=Gold-USDT,XAUTUSDT,PAXGUSDT`
   - `MARKET_CRYPTO_PAIRS=ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`
   - `BINGX_MARKET_DATA_PAIRS` (optional override for ingestion jobs)

## Phase 2: Nomad Job Specs

1. Add job specs under `deploy/nomad/`:
   - `gvfx-api.nomad.hcl`:
     - `count = 2`, spread across clients.
     - Health check `GET /health`.
     - Rolling update with canary and auto-revert.
   - `gvfx-frontend.nomad.hcl`:
     - `count = 2`, spread across clients.
     - Health check `GET /`.
     - `NEXT_PUBLIC_API_BASE_URL=http://gvfx-api.service.consul:8787`.
   - `gvfx-rl-service.nomad.hcl`:
     - `count = 2`, spread across clients.
     - Health check `GET /health`.
   - `gvfx-worker.nomad.hcl`:
     - `count = 1`.
     - Strict constraint to non-witness nodes.
     - Restart/reschedule enabled for failover, but never scale >1.
     - `BINGX_WS_ENABLED=true` and scheduler envs set here only.
2. Set backend API env:
   - `RL_SERVICE_URL=http://gvfx-rl-service.service.consul:9101`.
   - `MARKET_GOLD_PAIRS=Gold-USDT,XAUTUSDT,PAXGUSDT`.
   - `MARKET_CRYPTO_PAIRS=ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`.
   - `BINGX_MARKET_DATA_PAIRS=Gold-USDT,XAUTUSDT,PAXGUSDT,ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`.
3. Set failure handling in each job:
   - `restart` policy for process crashes.
   - `reschedule` for node loss.
   - `update` with canary for zero-bad-deploy rollback.
4. Add section-aware frontend env:
   - `NEXT_PUBLIC_MARKET_GOLD_PAIRS=Gold-USDT,XAUTUSDT,PAXGUSDT`.
   - `NEXT_PUBLIC_MARKET_CRYPTO_PAIRS=ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`.
   - Keep `NEXT_PUBLIC_API_BASE_URL=http://gvfx-api.service.consul:8787`.

## Phase 3: Self-Hosted Convex Data Plane

1. Deploy Postgres as a dedicated Nomad stateful job (`count = 1`) with persistent host volume.
2. Deploy object storage for Convex file artifacts (preferred S3-compatible target). If self-hosted object storage is used, deploy as separate stateful job with persistent volume.
3. Deploy Convex backend as Nomad job (`count = 1`) configured to use that Postgres/object storage.
4. Migrate existing Convex data:
   - Export from current deployment.
   - Import to self-hosted Convex.
   - Validate critical tables and model artifact paths.
5. Point app services to the new `CONVEX_URL` after import validation.
6. Run initial crypto backfills after cutover of Convex URL:
   - Trigger BingX backfill for `ALGO-USDT`, `BTC-USDT`, `ETH-USDT`, `SOL-USDT`, `XRP-USDT`, `BNB-USDT`.
   - Validate all feed tables (`candles`, `trades`, `funding`, `open_interest`, `mark_index`, `ticker`, `orderbook`) contain new pair data.

## Phase 4: Secrets and Config Management

1. Move all sensitive env vars to Nomad/Vault (no plaintext env files on nodes):
   - `BINGX_API_KEY`, `BINGX_SECRET_KEY`, `API_TOKEN`, Telegram credentials/session, OpenAI/OpenRouter keys, Convex admin secrets.
2. Inject secrets via Nomad templates/env at runtime.
3. Keep non-secret operational tuning as Nomad variables:
   - intervals, thresholds, feature toggles.

## Phase 5: Cutover Sequence (No Duplicate Workers)

1. Deploy `frontend`, `api`, `rl-service`, Convex stack first.
2. Keep old worker running until new stack passes smoke checks.
3. Stop old worker.
4. Start Nomad `gvfx-worker` (single allocation).
5. Verify exactly one scheduler/worker allocation and one BingX WS ingest writer.
6. Switch user traffic to Nomad frontend endpoint on tailnet.
7. Enable UI section split:
   - Gold routes use gold pair defaults only.
   - Crypto routes use crypto pair defaults only.

## Phase 6: Validation and Acceptance

1. Functional smoke:
   - `GET /health`
   - `GET /ops/gaps/health`
   - `GET /ops/alerts`
2. Worker singleton checks:
   - Only one `gvfx-worker` alloc running.
   - No duplicate ingestion runs with overlapping `running` windows.
3. Failover drills:
   - Drain active app node; ensure API/frontend/RL reschedule to remaining node.
   - Drain active worker node; confirm worker restarts on the other node.
4. Data-plane checks:
   - Convex reads/writes succeed after restarts.
   - Model artifact store/retrieve path works.
   - Gold and crypto pair pulls are both fresh in `/ops/gaps/health` and `/ops/alerts`.
5. Performance checks:
   - Re-run existing perf scripts and compare baseline.
6. Section checks:
   - Dashboard has clear Gold and Crypto sections.
   - Crypto section can load and chart `ALGO-USDT`, `BTC-USDT`, `ETH-USDT`, `SOL-USDT`, `XRP-USDT`, `BNB-USDT`.

## Phase 7: Rollback Plan

1. Keep legacy process-based deployment intact until Nomad passes 48-hour stability window.
2. Maintain latest pre-cutover Convex export snapshot.
3. Rollback trigger conditions:
   - repeated ingestion duplication,
   - unresolved Convex write failures,
   - sustained API/RL health instability.
4. Rollback action:
   - stop Nomad worker first,
   - restore legacy worker/API/frontend,
   - restore Convex data snapshot if required.

## Public Interfaces and Contract Changes

1. No HTTP endpoint shape changes required.
2. Runtime interface changes:
   - `NEXT_PUBLIC_API_BASE_URL` becomes Consul-resolved API service endpoint.
   - `RL_SERVICE_URL` becomes Consul-resolved RL service endpoint.
   - `CONVEX_URL` points to self-hosted Convex.
3. Operational interface additions:
   - Nomad job specs and deployment pipeline for OCI images.
   - Consul service names become stable internal service contracts.
   - Market section env contracts for Gold and Crypto pair lists.

## Test Cases and Scenarios

1. Single-active worker invariant: never >1 running allocation.
2. Node failure during active ingestion loop.
3. Node failure during RL inference and during training call.
4. Convex backend restart while API load is active.
5. Full cutover rehearsal in staging-like tailnet segment.
6. Backup/restore rehearsal for Postgres + Convex artifacts.
7. Crypto ingest coverage for `ALGO-USDT`, `BTC-USDT`, `ETH-USDT`, `SOL-USDT`, `XRP-USDT`, `BNB-USDT` across all BingX feed types.
8. Gold/Crypto dashboard route separation and section-specific pair selectors.

## Assumptions and Defaults

1. You have two worker-capable Tailnet nodes plus the Vultr witness node for 3-server Nomad quorum.
2. Existing Consul is available and integrated with Nomad.
3. OCI registry is reachable from all clients.
4. Tailnet-only access remains the permanent exposure model.
5. Convex self-hosted feature limitations are acceptable for your use case.
6. Worker remains single-active until/unless distributed lease locking is added in code.
7. Gold + crypto pair catalogs are managed via env variables and consumed by backend/frontend pair selectors.

## Sources

- [Nomad cluster deployment](https://developer.hashicorp.com/nomad/docs/deploy/clusters)
- [Nomad production requirements (TLS/ACL hardening)](https://developer.hashicorp.com/nomad/docs/deploy/production/requirements)
- [Nomad restart policy](https://developer.hashicorp.com/nomad/docs/job-declare/failure/restart)
- [Nomad reschedule policy](https://developer.hashicorp.com/nomad/docs/job-declare/failure/reschedule)
- [Nomad spread stanza](https://developer.hashicorp.com/nomad/docs/job-scheduling/spread)
- [Tailscale tailnet policy](https://docs.tailscale.com/tailnet-policy)
- [Convex self-hosting docs](https://docs.convex.dev/self-hosting)
- [Convex backend self-hosted README](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)
