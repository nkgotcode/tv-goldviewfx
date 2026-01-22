# Supabase Seed Data (RL Trading Agent)

Seed SQL files in this folder provide deterministic data for unit, integration, and E2E tests.

## Files

- `rl_agent_seed.sql`: baseline data for agent runs, versions, risk limits, and decisions
- `rl_agent_edge_seed.sql`: edge cases (risk breaches, stale data sources, partial fills)

## Usage

Run the helper script to reset and seed the local Supabase stack:

```sh
./scripts/supabase-test.sh
```

Make sure the local Supabase Docker stack is running before executing tests.
