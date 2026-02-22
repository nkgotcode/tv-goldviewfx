# Crypto Expansion Plan: BingX Futures + Gold/Crypto Dashboard Separation

## Goal

Expand the current Gold-focused system so it can ingest and operate on additional BingX crypto perpetual pairs, while presenting two clearly separated product lanes in the UI:

1. Gold section (existing `Gold-USDT`, `XAUTUSDT`, `PAXGUSDT`)
2. Crypto section (new futures pairs, default initial set below)

This plan is implementation-oriented and scoped to current repo architecture.

## Default Pair Scope (Phase 1)

- Gold section:
  - `Gold-USDT`
  - `XAUTUSDT`
  - `PAXGUSDT`
- Crypto section:
  - `ALGO-USDT`
  - `BTC-USDT`
  - `ETH-USDT`
  - `SOL-USDT`
  - `XRP-USDT`
  - `BNB-USDT`

These defaults are intentionally small for safe rollout. We can extend to more symbols after stability validation.

## Current Constraints in Codebase

Hard-coded pair enums/constants currently restrict the platform to three gold-related pairs:

- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/types/rl.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/schemas.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/env.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/bingx_market_data_ingest.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/bingx_market_data_ws.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_source_status_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/ingestion_status.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_agent_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/MarketKlinePanel.tsx`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-data-sources/page.tsx`

## Architecture Changes

### 1) Introduce a central market catalog

Create a single source of truth for supported instruments and section membership.

- New file: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/market_catalog.ts`
- Add:
  - `MarketSection = "gold" | "crypto"`
  - `MarketInstrument` shape: `{ id, bingxSymbol, section, enabled }`
  - helpers:
    - `listSupportedPairs()`
    - `listPairsBySection(section)`
    - `isSupportedPair(pair)`
    - `toBingxSymbol(pair)`
    - `fromBingxSymbol(symbol)`

Mirror this catalog on frontend:

- New file: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/config/marketCatalog.ts`

### 2) Replace hard-coded pair enums with validated strings

Refactor pair typing from narrow union to string + runtime validation:

- `TradingPair` becomes `string` in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/types/rl.ts`
- `tradingPairSchema` in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/rl/schemas.ts` becomes:
  - `z.string().min(1).refine(isSupportedPair, "Unsupported pair")`

Reason: avoids touching dozens of files for every newly added symbol while preserving guardrails.

### 3) Make env configuration pair-dynamic

In `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/config/env.ts`:

- Add env vars:
  - `MARKET_GOLD_PAIRS` (csv, default current gold set)
  - `MARKET_CRYPTO_PAIRS` (csv, default `ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT`)
  - `BINGX_MARKET_DATA_PAIRS` (optional explicit override; defaults to union of gold+crypto)
- Change `RL_ONLINE_LEARNING_PAIR` from static enum to validated string using `isSupportedPair`.

### 4) Ingestion and WS generalization

Refactor ingestion services to read supported pairs from catalog/env instead of constants:

- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/bingx_market_data_ingest.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/bingx_market_data_ws.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/ingestion_status.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_source_status_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_quality_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/data_gap_service.ts`

Keep existing feed coverage unchanged per pair:

- candles
- orderbook
- trades
- funding
- open_interest
- mark/index
- ticker

### 5) RL/trading path support for crypto pairs

Remove pair hard-coding in run/start/eval/training paths:

- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/rl_agent_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/api/routes/agent.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/dataset_service.ts`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/src/services/trade_execution.ts`

`trade_execution.normalizePair` should use catalog symbol reverse mapping so crypto trades record source status correctly.

### 6) API additions for UI sectioning

Add market metadata endpoints:

- `GET /bingx/market-data/pairs`
  - returns list of pairs with section and enabled status
- `GET /bingx/market-data/pairs?section=gold|crypto`
  - filtered set for UI selectors

These endpoints prevent hard-coding pair lists in frontend.

### 7) Dashboard IA split: Gold vs Crypto

Add dedicated routes:

- `/gold` for gold-oriented operations and charts
- `/crypto` for crypto-oriented operations and charts

Keep existing routes but align content:

- `/insights` becomes neutral overview with quick links to `/gold` and `/crypto`

Frontend changes:

- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/Layout.tsx`
  - nav links for `Gold` and `Crypto`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/components/MarketKlinePanel.tsx`
  - accept `pairs` prop from catalog endpoint; remove hard-coded `PAIRS`
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/gold/page.tsx` (new)
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/crypto/page.tsx` (new)
- `/Users/itsnk/Desktop/Coding/tv-goldviewfx/frontend/src/app/rl-data-sources/page.tsx`
  - group tables by section (Gold block + Crypto block)

## Data/Storage Impact

- Convex schema already uses `pair: string` for market tables; no schema migration required.
- Existing data remains valid.
- Backfill must run for newly added crypto pairs to seed candles/funding/OI/etc.

## Rollout Plan

### Phase A: Catalog + backend validation refactor

1. Add catalog module.
2. Convert hard-coded schemas/constants to catalog-driven validation.
3. Keep default pair set equal to current behavior until feature flag is enabled.

### Phase B: Enable crypto ingestion

1. Set `MARKET_CRYPTO_PAIRS` and/or `BINGX_MARKET_DATA_PAIRS`.
2. Run manual backfill for crypto pairs.
3. Verify `/ops/gaps/health`, `/ops/alerts`, and ingestion status by pair.

### Phase C: UI section split

1. Add `Gold` and `Crypto` pages/routes.
2. Wire market pair selectors from backend metadata endpoint.
3. Keep old overview pages for compatibility.

### Phase D: RL/trading enablement for crypto

1. Allow crypto symbols in agent start/eval/training request validation.
2. Update allowed instruments config for desired symbols.
3. Start paper runs on crypto pairs, then live only after evaluation gates pass.

## Acceptance Criteria

1. Ingestion can run/backfill for `ALGO-USDT`, `BTC-USDT`, `ETH-USDT`, `SOL-USDT`, `XRP-USDT`, and `BNB-USDT` with all BingX feeds.
2. `GET /bingx/market-data/status` and `GET /data-sources/status` return crypto pairs with freshness states.
3. RL run start endpoint accepts crypto pairs and enforces existing risk/data gates.
4. Trade execution + reconciliation works for crypto instruments (paper and live).
5. Dashboard has distinct Gold and Crypto sections with independent pair selectors.
6. Existing gold workflows remain unchanged and passing.

## Test Plan

### Backend tests

- Extend unit/integration coverage for:
  - pair validation against catalog
  - symbol mapping round-trip (`pair -> bingxSymbol -> pair`)
  - ingestion status aggregation with mixed gold/crypto sets
  - RL start validation for new pairs
  - trade execution status recording for crypto instruments

### Frontend tests

- Add tests for:
  - nav links and routing (`/gold`, `/crypto`)
  - section-scoped pair selector behavior
  - `MarketKlinePanel` rendering with dynamic pair list

### E2E

- Add scenarios:
  - crypto backfill action succeeds
  - crypto pair appears in data source guardrails and RL Ops pages
  - crypto paper run start/pause/resume/stop flow

## Risks and Mitigations

- Risk: widespread `SUPPORTED_PAIRS` copies cause drift.
  - Mitigation: enforce catalog-only usage; remove local constants.
- Risk: BingX symbol naming inconsistencies.
  - Mitigation: central symbol mapper and contract validation endpoint.
- Risk: UI confusion between sections.
  - Mitigation: explicit route split and section badges/titles.

## Out of Scope (This Plan)

- Multi-exchange support beyond BingX.
- Strategy redesign specific to crypto microstructure.
- Separate crypto-specific risk model tuning (can follow after data baseline).
