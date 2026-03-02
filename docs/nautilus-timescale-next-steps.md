# Nautilus + Timescale Next Steps (Post-Deploy)

## Current observed state

- Nomad jobs `gvfx-api`, `gvfx-rl-service`, and `gvfx-worker` are updated and healthy.
- Local `TIMESCALE_URL` points to a Postgres instance that does **not** contain RL ops tables (`evaluation_reports`, `agent_versions`, `feature_set_versions`, `dataset_versions`).
- E2E reset against current `CONVEX_URL` is blocked by large Convex fixture volume (`Too many documents read in a single function execution`).

## Why backtests still show frequent FAIL

- Promotion gate failures (`insufficient_trade_count`, `promotion_gate_fail`) dominate recent runs.
- Environment drift remains: RL/evaluation persistence is split and current Timescale target appears not to be the RL ops database.
- Without stable RL ops persistence + diagnostics visibility, operators rerun with unsafe presets and repeat the same fail pattern.

## Immediate remediation checklist

1. Pin RL ops to the correct Timescale database:
   - Ensure Nomad secret `TIMESCALE_URL` points to the DB intended for `tv-goldviewfx` RL ops.
   - Keep `TIMESCALE_RL_OPS_ENABLED=true` and `TIMESCALE_MARKET_DATA_ENABLED=true`.
2. Verify RL ops schema exists in target DB:
   - Confirm tables: `agent_versions`, `evaluation_reports`, `feature_set_versions`, `dataset_versions`, `learning_updates`.
3. Backfill/seed minimal RL control data:
   - Ensure at least one `feature_set_versions` row (or create via app path).
   - Ensure at least one `agent_versions` row for evaluation linkage.
4. Run Command Center presets in order:
   - `Quick sanity` -> `Full-history regime sweep` -> `Multi-interval promotion check`.
5. Promote only from runs with:
   - `walk_forward` enabled and non-zero fold pass count.
   - `interval_matrix.failed_count = 0` for required intervals.
   - `sb3_readiness.checks.* = true` when using `rl_sb3_market`.

## E2E hardening tasks

1. Add a dedicated RL E2E bootstrap path that does not require full Convex reset for Timescale-first runs.
2. Keep Convex reset path for legacy suites, but page/limit `convex/e2e.ts` reset reads to avoid `32000` document read cap.
3. Mark Convex-heavy suites separately from Nautilus core flow so CI can always run:
   - RL service integration tests
   - Command Center component/unit tests
   - `rl-training-flow` style API E2E on Timescale-only path

## Operator runbook update

- In Command Center Backtests tab:
  - Use inline health badges (RL status, Nautilus dependency, recent run id) as first signal.
  - Use failure reason/recommended action columns plus fold/interval details for triage.
- Avoid manual threshold relaxation until interval/fold diagnostics are reviewed.
