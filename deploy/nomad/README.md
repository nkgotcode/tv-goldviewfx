# Nomad Deployment Runbook (tv-goldviewfx)

This directory contains a full Nomad deployment for:
- `gvfx-api`
- `gvfx-frontend` (optional; you can host frontend outside Nomad)
- `gvfx-rl-service`
- `gvfx-worker` (tailscale sidecar + fail-closed egress guard)
- `gvfx-worker-egress-check` (batch preflight)
- `gvfx-bingx-full-backfill` (periodic batch full backfill with gap/staleness gating)
- `gvfx-postgres`
- `gvfx-objectstore`
- `gvfx-convex`

RL placement policy:
- `gvfx-rl-service` is constrained to Nomad client metadata `meta.gpu=true`.
- EPYC is preferred when it is marked `meta.rl_tier=primary`; Mac mini is failover when marked `meta.rl_tier=secondary`.

Stateful placement policy:
- `gvfx-postgres`, `gvfx-objectstore`, and `gvfx-convex` are constrained to `meta.stateful=true`.
- With your current target layout, set this on OptiPlex and EPYC so stateful Convex data-plane jobs can fail over between those two nodes.

Market data storage split:
- Convex remains the app/workflow state layer.
- High-volume BingX market data (`candles`, `trades`, `funding`, `open interest`, `orderbook`, `mark/index`, `ticker`) should be stored in Timescale/Postgres by enabling:
  - `TIMESCALE_MARKET_DATA_ENABLED=true`
  - `TIMESCALE_URL` (in Nomad secrets)

Worker placement policy:
- `gvfx-worker` and `gvfx-worker-egress-check` are constrained to `meta.egress_worker=true`.

## External Frontend Hosting (Recommended)

You can host the Next.js frontend on Vercel/Cloudflare/Netlify and keep Nomad for backend services only.

Cloudflare Workers (OpenNext) flow in this repo:

1. Authenticate Wrangler:
   - `cd frontend && npx wrangler login`
2. Deploy frontend worker:
   - `./scripts/deploy-frontend-cloudflare.sh`
3. Optional cutover helper (deploy + stop Nomad frontend):
   - `CLOUDFLARE_FRONTEND_URL=https://<frontend-host> ./scripts/cutover-frontend-to-cloudflare.sh`
4. Keep Nomad deploys for `gvfx-api`, `gvfx-rl-service`, and `gvfx-worker`.

Notes:
- Cloudflare frontend uses server-side `/api/backend` proxy; set Worker secrets `API_BASE_URL` and `API_TOKEN`.
- `API_BASE_URL` must be a public HTTPS upstream reachable from Cloudflare Workers (not a private Nomad/LAN IP). Tailscale Funnel URL is supported.
- Set `CORS_ORIGIN` only if clients call API cross-origin directly (not needed for proxy mode).

## Required Nomad Client Metadata

Set Nomad client metadata on each machine:
- OptiPlex (Node A): `meta.stateful=true`, `meta.egress_worker=true`
- EPYC: `meta.gpu=true`, `meta.rl_tier=primary`, `meta.egress_worker=true`, `meta.stateful=true`
- Mac mini: `meta.gpu=true`, `meta.rl_tier=secondary`, `meta.egress_worker=true`
- Witness marker for exclusion from app jobs: `meta.role=witness`

Example live updates:

```bash
nomad node meta apply -address=http://100.83.150.39:4646 stateful=true egress_worker=true role=primary
nomad node meta apply -address=http://100.103.201.10:4646 gpu=true rl_tier=primary egress_worker=true stateful=true role=standby
nomad node meta apply -address=http://100.100.5.40:4646 gpu=true rl_tier=secondary egress_worker=true role=standby
```

## Prerequisites

1. Nomad + Consul cluster is healthy (TLS/ACL enabled).
2. Host directories exist on the target nodes:
   - Postgres: `/var/lib/nomad/gvfx/postgres`
   - Object store: `/var/lib/nomad/gvfx/objectstore`
   - Convex: `/var/lib/nomad/gvfx/convex`
3. OCI images are built and pushed with immutable git-sha tags.
4. Worker image includes `/app/scripts/tailscale/worker-egress-guard.sh` and runtime deps (`tailscale`, `jq`, and either `curl` or `wget`).

## GHCR Push Reliability Notes

We have repeatedly seen transient GHCR transport failures on large layers (`tls: bad record MAC`, `broken pipe`).

Use this playbook to avoid long retries:

1. Build + push backend and RL-service first (smallest/most stable push path).
2. For frontend, prefer small delta/overlay builds when only app code changed.
3. Use immutable image tags per deploy (`nomad-<date>-<sha>-<suffix>`), never reuse mutable tags for rollout jobs.
4. If a push fails, retry `docker push` for the same tag first before rebuilding.
5. Verify remote manifest exists before Nomad rollout:

```bash
docker build -t ghcr.io/<owner>/tv-goldviewfx-backend:<tag> -f deploy/docker/backend.Dockerfile .
docker push ghcr.io/<owner>/tv-goldviewfx-backend:<tag>
docker manifest inspect ghcr.io/<owner>/tv-goldviewfx-backend:<tag> >/dev/null
```

6. Only after all manifests exist, run Nomad deploy order.
7. On Apple Silicon/macOS, force `linux/amd64` for Nomad-targeted images to avoid platform mismatch from GHCR manifests:

```bash
docker buildx build --platform linux/amd64 -t ghcr.io/<owner>/tv-goldviewfx-backend:<tag> -f deploy/docker/backend-overlay.Dockerfile --push .
docker buildx build --platform linux/amd64 -t ghcr.io/<owner>/tv-goldviewfx-rl-service:<tag> -f deploy/docker/rl-service-overlay.Dockerfile --push .
docker buildx build --platform linux/amd64 -t ghcr.io/<owner>/tv-goldviewfx-frontend:<tag> -f deploy/docker/frontend-delta.Dockerfile --push .
```

8. Frontend `*-overlay-lite` images are runtime-only and do not include `next` for rebuilds. Use a full runtime base (for example `*-proxy-fix-overlay4`) for delta/overlay builds that run `npm run build`.
9. If you need to pin a different base tag for overlays, pass `--build-arg BASE_IMAGE=<image:tag>` (backend/RL) or `--build-arg RUNNER_BASE_IMAGE=<image:tag>` (frontend delta).

## macOS Nomad Client (mbp-m3max)

Homebrew's default Nomad service runs `nomad agent -dev` and must not be used for cluster clients.

Use:
- `/opt/homebrew/etc/nomad.d/client.hcl` for the client config.
- `deploy/nomad/launchd/com.itsnk.nomad-client.plist` as the launchd unit.

Then load with:

```bash
brew services stop nomad
cp deploy/nomad/launchd/com.itsnk.nomad-client.plist ~/Library/LaunchAgents/com.itsnk.nomad-client.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.itsnk.nomad-client.plist
launchctl kickstart -k gui/$(id -u)/com.itsnk.nomad-client
```

## Variable Paths

- Config/secrets expected by templates:
  - `nomad/jobs/gvfx/config`
  - `nomad/jobs/gvfx/secrets`

Use `deploy/nomad/variables.example.hcl` as a reference only. Split into secure files before writing variables.
The example defaults `TS_EXIT_NODE_PRIMARY` to your Vultr Tailnet node: `100.110.26.124`.
For Timescale market-data storage, set:
- config: `TIMESCALE_MARKET_DATA_ENABLED=true`
- secrets: `TIMESCALE_URL=postgres://...`
- secrets: `CORS_ORIGIN=https://<your-frontend-host>` when frontend is hosted outside Nomad

For periodic full BingX backfills with gap/staleness gating, set:
- `BINGX_FULL_BACKFILL_ENABLED=true`
- `BINGX_FULL_BACKFILL_MAX_BATCHES` to a high ceiling (for example `10000`)
- `BINGX_FULL_BACKFILL_OPEN_GAP_THRESHOLD` and `BINGX_FULL_BACKFILL_NON_OK_SOURCE_THRESHOLD`

## Deploy Order

### Phase 1: data plane

```bash
nomad job run deploy/nomad/gvfx-postgres.nomad.hcl
nomad job run deploy/nomad/gvfx-objectstore.nomad.hcl
nomad job run deploy/nomad/gvfx-convex.nomad.hcl
```

### Phase 2: stateless app services

```bash
nomad job run deploy/nomad/gvfx-rl-service.nomad.hcl
nomad job run deploy/nomad/gvfx-api.nomad.hcl
# Optional only if frontend is hosted on Nomad:
# nomad job run deploy/nomad/gvfx-frontend.nomad.hcl
```

### Phase 3: worker egress preflight + worker cutover

```bash
nomad job run deploy/nomad/gvfx-worker-egress-check.nomad.hcl
# stop legacy worker once preflight passes
nomad job run deploy/nomad/gvfx-worker.nomad.hcl
nomad job run deploy/nomad/gvfx-bingx-full-backfill.nomad.hcl
# Optional custom cadence
# nomad job run -var 'backfill_cron=*/30 * * * *' deploy/nomad/gvfx-bingx-full-backfill.nomad.hcl
```

## Validation Checklist

1. `nomad job status gvfx-api`, `gvfx-rl-service`, `gvfx-worker`, `gvfx-convex` all healthy.
   - If frontend is on Nomad, `nomad job status gvfx-frontend` must also be healthy.
2. `gvfx-worker` has exactly one running allocation.
3. `gvfx-worker-egress-check` exits successfully.
4. `gvfx-bingx-full-backfill` shows successful periodic runs (`nomad job status gvfx-bingx-full-backfill`).
5. API health:
   - `GET /health`
   - `GET /ops/gaps/health`
   - `GET /ops/alerts`
6. Convex persistence remains intact after restarting `gvfx-postgres`, `gvfx-objectstore`, and `gvfx-convex` allocations.

## Rollback

1. Stop Nomad worker first:

```bash
nomad job stop -purge gvfx-worker
```

2. Restore legacy worker process.
3. If needed, stop Nomad API/frontend and route traffic back to legacy services.
4. Restore latest Convex snapshot if data plane corruption is suspected.
