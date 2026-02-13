# Research Notes: Trading Idea Intelligence Platform

**Feature**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/spec.md
**Date**: 2026-01-11

## Decision: Backend API framework

- **Decision**: Use Hono as the HTTP routing layer for Bun services.
- **Rationale**: Lightweight, fetch-native, TypeScript-first, and a clean match
  for Bun without extra runtime overhead.
- **Alternatives considered**: Fastify (richer plugin ecosystem, heavier setup),
  Express (ubiquitous but not fetch-native and less ergonomic in Bun).

## Decision: Job scheduling and orchestration

- **Decision**: Use a dedicated worker process with cron-style scheduling for
  sync and enrichment jobs, with job state persisted in the database.
- **Rationale**: Keeps ingestion resilient and observable without introducing
  external queues early; database-backed job state supports retries and audits.
- **Alternatives considered**: Redis-based queues (BullMQ) requiring additional
  infrastructure; ad-hoc timers without persistence.

## Decision: Vector storage

- **Decision**: Store similarity vectors in Convex documents (embedding arrays) and
  maintain a separate enrichment table for model metadata.
- **Rationale**: Keeps all derived data in a single store with similarity search
  support and minimal operational overhead.
- **Alternatives considered**: External vector databases (adds complexity and
  separate ops surface).

## Decision: Exchange integration

- **Decision**: Use BingX REST APIs directly for GOLD-USDT perpetuals and keep
  the paper-trading adapter as the default mode.
- **Rationale**: Aligns with the live venue, avoids CCXT indirection, and
  supports BingX-specific TP/SL payloads.
- **Alternatives considered**: CCXT (extra abstraction, slower to adapt to
  venue-specific futures features), exchange SDKs (tighter coupling per
  exchange).

## Decision: Dashboard architecture

- **Decision**: Build a Next.js (latest stable) dashboard using the App Router with
  refine.dev for data-heavy views and shadcn/ui for consistent components.
- **Rationale**: Next.js provides routing, server rendering, and deployment
  flexibility while refine.dev accelerates admin-style data interfaces and
  shadcn/ui provides a consistent design system.
- **Alternatives considered**: Custom admin framework (higher build time).

## Decision: Deduplication strategy

- **Decision**: Deduplicate by (source, external id) as primary key and fall back
  to content_hash matching within a source; track duplicates via duplicate_of_id.
- **Rationale**: Provides deterministic, idempotent ingestion while preserving
  auditability of near-duplicate content.
- **Alternatives considered**: Fuzzy matching only (risk of false positives),
  global content_hash dedup across sources (loses source-specific context).

## Decision: Ingestion quality scoring

- **Decision**: Compute per-run quality metrics (coverage %, missing fields,
  parse confidence) and store them alongside ingestion runs.
- **Rationale**: Gives operators objective quality signals and triggers
  automated re-fetch workflows for incomplete content.
- **Alternatives considered**: Manual QA only (slow), aggregate-only metrics
  (insufficient for feed-level diagnostics).

## Decision: Review workflow + RBAC

- **Decision**: Store idea review states and notes in first-class tables and
  enforce operator vs analyst roles at the API boundary.
- **Rationale**: Separates analysis from live trading authority while keeping
  governance actions auditable.
- **Alternatives considered**: UI-only restrictions (unsafe) or external review
  tools (higher operational overhead).

## Decision: Analytics + topic trends

- **Decision**: Provide source efficacy, sentiment vs PnL, and topic trend
  analytics via dedicated services and API endpoints, with optional scheduled
  clustering jobs.
- **Rationale**: Keeps dashboards responsive while enabling deeper insights on
  which sources and topics drive performance.
- **Alternatives considered**: On-demand heavy queries only (slow for ops),
  external BI tooling (extra infrastructure).

## Decision: News ingestion

- **Decision**: Ingest macro and gold-specific news feeds with deduplication and
  sentiment scoring, linking items to the idea timeline.
- **Rationale**: Provides context for market moves and improves correlation
  analysis.
- **Alternatives considered**: Manual news tagging only (inconsistent),
  third-party dashboards (no integration with trading data).

## Decision: OCR enrichment for chart images

- **Decision**: Run optional OCR on TradingView chart images and store extracted
  text with confidence metadata.
- **Rationale**: Captures critical insights often embedded in chart annotations.
- **Alternatives considered**: Ignore images (lost context), manual annotation
  (high effort).
