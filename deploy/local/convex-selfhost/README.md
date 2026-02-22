# Local Self-Hosted Convex Stack

This stack runs Convex locally with:
- Postgres (metadata/state)
- MinIO (S3-compatible bucket storage)
- Convex backend
- Convex dashboard

## Files

- `docker-compose.yml`
- `.env.example`
- helper script: `scripts/convex-selfhost-local.sh`

## Quick start

```bash
./scripts/convex-selfhost-local.sh up
./scripts/convex-selfhost-local.sh setup-cli
./scripts/convex-selfhost-local.sh push
```

After setup:
- Backend: `http://127.0.0.1:3210`
- Site proxy: `http://127.0.0.1:3211`
- Dashboard: `http://127.0.0.1:6791`

Important: set `INSTANCE_SECRET` in `deploy/local/convex-selfhost/.env` to a valid hex string.

The `setup-cli` command writes:
- `.env.convex-selfhosted`

Then `push` runs Convex code sync against that local self-hosted backend.

## For E2E

Ensure `.env.local` points `CONVEX_URL` to `http://127.0.0.1:3210`.
Then run:

```bash
./scripts/e2e-local.sh
```

## Stop stack

```bash
./scripts/convex-selfhost-local.sh down
```
