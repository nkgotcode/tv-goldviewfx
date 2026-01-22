# Feature Specification: Trading Idea Intelligence Platform

**Feature Branch**: `001-trading-idea-platform`  
**Created**: 2026-01-10  
**Status**: Draft  
**Input**: User description: "build a complete application that would scrape from https://www.tradingview.com/u/Goldviewfx/ for all of the trading ideas on the profile view and then extract full content of each post to then save to my Supabase DB that then later on gets sentiment analyzed and get vectorized that would also get saved on the DB. This then will power a trading agent on gold on exchanges that would allows futures trading on Gold. This trading system powered by the agent will also have a dashboard to display all the trading ideas and all the trades made or being made using React and shadcn and refine.dev. The system also will later on take in telegram post that I will pay for preimum subscription to enrich the trading ideas Which will also power the agent. I only initialized the project folder a little bit So it will need to be restructured to be logical."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - TradingView Idea Sync (Priority: P1)

As the operator, I want to sync all TradingView ideas from the Goldviewfx profile
and store the full content so that I have a complete, searchable dataset for
analysis and trading decisions.

**Why this priority**: Without reliable ingestion, all downstream analysis,
trading, and dashboards are blocked.

**Independent Test**: Run a sync for the profile and verify all visible ideas
and their full content are stored with source links and timestamps.

**Acceptance Scenarios**:

1. **Given** the profile has ideas not yet stored, **When** a sync runs,
   **Then** all new ideas are captured with full content and metadata.
2. **Given** an idea already exists but its content changed upstream, **When** a
   sync runs, **Then** the stored record is updated and the change is tracked.
3. **Given** a scheduled sync is configured, **When** the schedule triggers,
   **Then** the run completes and reports success or failure.
4. **Given** duplicate ideas appear in the source feed, **When** a sync runs,
   **Then** only one canonical record is stored and duplicates are linked or
   ignored based on matching rules.
5. **Given** an idea is missing required fields or has incomplete content,
   **When** the sync completes, **Then** the run includes quality scores
   (coverage %, missing fields, parse confidence) and the system schedules a
   bounded re-fetch with backoff until completeness thresholds are met.

---

### User Story 2 - Sentiment and Similarity Enrichment (Priority: P2)

As the operator, I want each idea enriched with sentiment and similarity data
so I can filter, compare, and rank ideas reliably.

**Why this priority**: Enrichment makes the dataset actionable for automation and
search.

**Independent Test**: Trigger enrichment on a batch of ideas and verify each one
has sentiment values and similarity data stored.

**Acceptance Scenarios**:

1. **Given** a batch of ideas without enrichment, **When** enrichment runs,
   **Then** each idea receives sentiment and similarity data with a timestamp.

---

### User Story 3 - Gold Futures Trading Agent (Priority: P3)

As the operator, I want a trading agent that can propose and execute gold
futures trades based on enriched ideas, with clear controls and audit history.

**Why this priority**: This is the core business outcome that turns insights
into trades.

**Independent Test**: Enable the agent in paper mode and confirm trade proposals
and executions are recorded without affecting live accounts.

**Acceptance Scenarios**:

1. **Given** the agent is disabled, **When** new ideas arrive, **Then** no trades
   are executed and only recommendations are logged.
2. **Given** the agent is enabled with configured limits, **When** a qualifying
   signal occurs, **Then** a trade is executed and fully logged.
3. **Given** a trade would exceed configured limits, **When** a signal occurs,
   **Then** the trade is rejected and the decision is logged.
4. **Given** the operator activates the kill switch, **When** any trade action
   is requested, **Then** execution is blocked and the stop reason is logged.
5. **Given** a signal originates from an unapproved source or below-confidence
   source policy, **When** the agent evaluates it, **Then** it is rejected and
   the gating reason is recorded.
6. **Given** the operator requests a switch from paper to live mode, **When**
   promotion gates (minimum win rate/trade count) are not met, **Then** the
   switch is blocked with a clear explanation.

---

### User Story 4 - Operator Dashboard (Priority: P4)

As the operator, I want a dashboard to review ideas, enrichment, and trades,
plus full analytics and control of TradingView, BingX, and Telegram ingestion,
and paper/live trading modes so I can monitor performance and run operations
without leaving the UI.

**Why this priority**: The dashboard provides visibility, trust, and oversight
for the system.

**Independent Test**: Open the dashboard and confirm ideas, enrichment, and
trades can be filtered and inspected end-to-end.

**Acceptance Scenarios**:

1. **Given** stored ideas and trades, **When** I filter by time range or
   sentiment, **Then** the dashboard shows matching records with detail views.
2. **Given** a recorded trade, **When** I open its detail view, **Then** I can
   see the linked idea, signal summary, and outcome status.
3. **Given** ingestion pipelines are configured, **When** I open the dashboard,
   **Then** I can see TradingView, BingX, and Telegram ingestion health
   (last run, lag, errors) and trigger a sync, backfill, or pause/resume.
4. **Given** the agent is running in paper mode, **When** I switch to live mode
   from the dashboard with confirmation, **Then** the mode updates, is logged,
   and the UI reflects the active trading state.
5. **Given** source analytics are available, **When** I view the dashboard,
   **Then** I can see idea → signal → trade conversion rates, win rate by
   source, and sentiment vs PnL correlations by time bucket.
6. **Given** topic clustering is enabled, **When** I open the idea analytics,
   **Then** I can see weekly/monthly keyword trend summaries for the idea
   stream.
7. **Given** ingestion schedules and backoff limits are configured, **When** I
   update them in the dashboard, **Then** the new schedule takes effect and is
   reflected in ingestion status within one run cycle.

---

### User Story 5 - Telegram Signal Ingestion (Priority: P5)

As the operator, I want to ingest premium Telegram posts as additional signals
so that trading decisions include paid intelligence sources.

**Why this priority**: Telegram sources enrich the idea stream and broaden the
signal base.

**Independent Test**: Connect a Telegram source and verify new posts are stored
and linked to the signal dataset.

**Acceptance Scenarios**:

1. **Given** a configured Telegram source, **When** new posts are published,
   **Then** they are ingested and visible alongside other signals.

---

### User Story 6 - News Ingestion (Priority: P5)

As the operator, I want macro and gold-specific news ingested with sentiment and
deduplication so I can correlate news to idea performance and trading outcomes.

**Why this priority**: News context improves interpretation of ideas and agent
decisions.

**Independent Test**: Trigger a news ingestion run and verify new items,
sentiment, and dedup status are stored and visible in the dashboard.

**Acceptance Scenarios**:

1. **Given** a configured news source, **When** new articles are published,
   **Then** they are ingested with sentiment and linked to the idea/signal
   timeline.

---

### User Story 7 - Review Workflow & Governance (Priority: P4)

As the operator, I want idea review states with notes and audit history so I can
triage signals and control which sources are trusted for trading.

**Why this priority**: Governance reduces noisy inputs and improves trading
discipline.

**Independent Test**: Change an idea review state and confirm the audit trail
and gating behavior update correctly.

**Acceptance Scenarios**:

1. **Given** an idea is newly ingested, **When** I mark it as approved or
   rejected with a note, **Then** the review state and audit history are
   stored and reflected in the dashboard.
2. **Given** an operator and analyst are logged in, **When** the analyst
   attempts to enable live trading, **Then** the action is blocked by RBAC and
   logged.

---

### User Story 8 - OCR Enrichment (Priority: P6)

As the operator, I want OCR on TradingView chart images so chart annotations can
be indexed and searched alongside idea text.

**Why this priority**: Chart annotations often carry the key insight not found
in the caption.

**Independent Test**: Run OCR on an idea with images and verify extracted text
is stored and shown in the detail view.

**Acceptance Scenarios**:

1. **Given** a TradingView idea includes chart images, **When** OCR runs, **Then**
   extracted text is stored with confidence scores and linked to the idea.

### Edge Cases

- TradingView content is unavailable or changed format.
- Duplicate ideas appear with the same URL or title.
- Full content cannot be retrieved due to access limits.
- Enrichment fails for a subset of ideas.
- Trade execution fails or is partially completed.
- Telegram posts are deleted or edited after ingestion.
- News feeds contain duplicates or missing metadata.
- OCR fails or returns low-confidence text for chart images.
- Review state changes conflict with automated updates.
- RBAC misconfiguration allows unintended live trading actions.
- Ingestion backoff causes excessive lag for high-volume feeds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST collect all ideas from the configured TradingView
  profile, including title, timestamps, URL, and full content.
- **FR-002**: System MUST update stored ideas when upstream content changes and
  maintain change history or update timestamps.
- **FR-003**: System MUST support manual and scheduled sync runs with clear
  success and failure reporting.
- **FR-004**: System MUST enrich each idea with sentiment scores and similarity
  data used to compare and group ideas, and store results with timestamps.
- **FR-004a**: System MUST deduplicate ideas and Telegram posts using stable
  identifiers (source, external id, and content hash) and ensure syncs are
  idempotent.
- **FR-005**: System MUST allow the operator to configure trading rules that map
  enriched ideas to trade actions.
- **FR-006**: System MUST support paper-trading by default and require explicit
  enablement to execute live trades.
- **FR-007**: System MUST apply risk controls, including position size limits
  and daily loss thresholds.
- **FR-008**: System MUST record all trade proposals and executions with a
  complete audit trail.
- **FR-009**: System MUST provide a dashboard to view ideas, enrichment data,
  and trades with filtering and detail views.
- **FR-010**: System MUST ingest posts from configured Telegram sources and
  store them as signals for analysis and trading.
- **FR-011**: System MUST allow the operator to pause or disable the agent at
  any time without losing data.
- **FR-012**: System MUST store all ingested and derived data in a central
  database accessible to the dashboard and agent.
- **FR-013**: System MUST provide dashboard controls and analytics for
  ingestion pipelines (TradingView, BingX, and Telegram), including status,
  last run, lag, and error visibility with trigger/pause actions.
- **FR-013a**: System MUST capture BingX market data via WebSocket for real-time
  trades, candles, order book snapshots, tickers, and mark price updates while
  retaining REST backfills for historical coverage and non-streaming feeds.
- **FR-014**: System MUST provide dashboard controls for paper/live trading
  modes and agent enablement, including current mode, confirmation prompts,
  and audit logging for mode changes.
- **FR-015**: System MUST compute ingestion quality scoring (coverage %,
  missing fields, parse confidence) per run and per source and store it with
  each ingestion run.
- **FR-016**: System MUST re-fetch incomplete ideas within bounded retry limits
  using configurable backoff rules.
- **FR-017**: System MUST support source-level scheduling and rate-limit/backoff
  configuration via the dashboard and apply those settings to ingestion jobs.
- **FR-018**: System MUST provide source efficacy analytics, including idea →
  signal → trade conversion rates and win rate by source.
- **FR-019**: System MUST provide sentiment vs PnL correlation dashboards with
  time-bucketed performance metrics.
- **FR-020**: System MUST provide topic clustering and keyword trend summaries
  for the idea stream on weekly and monthly windows.
- **FR-021**: System MUST support idea review states (new, triaged, approved,
  rejected) with notes and manual overrides.
- **FR-022**: System MUST record audit logs and diff history for idea revisions
  and enrichment runs.
- **FR-023**: System MUST enforce RBAC (operator vs analyst) with write
  protections on live trading controls and ingestion configuration changes.
- **FR-024**: System MUST provide a kill switch and global risk overrides,
  including hard stop and max loss/day enforcement.
- **FR-025**: System MUST gate paper → live promotion on minimum evaluation
  metrics (win rate, trade count, drawdown thresholds).
- **FR-026**: System MUST enforce per-source gating for trading based on
  approved sources and minimum confidence thresholds.
- **FR-027**: System MUST ingest macro and gold-specific news feeds with
  deduplication and sentiment scoring.
- **FR-028**: System MUST run OCR on TradingView chart images (when present)
  and store extracted text with confidence metadata.

### Non-Functional Requirements

- **NFR-001**: User-facing terminology and data fields MUST remain consistent
  across syncs, enrichment, and the dashboard.
- **NFR-002**: Data processing runs MUST meet agreed performance targets and
  report their completion times.
- **NFR-003**: All sensitive credentials MUST be protected and never exposed in
  logs or dashboards.
- **NFR-004**: Every acceptance scenario and edge case MUST be covered by
  automated unit, integration, and end-to-end test suites unless explicitly
  waived with rationale and a follow-up task.
- **NFR-005**: Duplicate detection rules MUST be deterministic and auditable
  via logs or stored metadata.
- **NFR-006**: Runtime and library dependencies MUST stay on the latest stable
  releases; any pinned versions are updated promptly after new stable releases.
- **NFR-007**: Audit logs and review history MUST be retained for at least 12
  months for compliance and troubleshooting.
- **NFR-008**: Ingestion quality metrics MUST be available within the same run
  cycle and visible in the dashboard within 5 minutes of completion.
- **NFR-009**: Automated re-fetch retries MUST respect configured rate limits
  and backoff ceilings to avoid source bans.

### Assumptions & Dependencies

- The operator provides authorized access to the TradingView profile and any
  premium Telegram sources.
- The operator provides access to approved news feeds and any OCR provider used
  for chart images.
- The initial scope focuses on gold futures; other instruments are out of scope.
- Live trading is opt-in and requires explicit operator enablement.
- Regulatory compliance and broker account setup are handled by the operator.
- RBAC enforcement relies on Supabase auth or an equivalent identity provider.

### Key Entities *(include if feature involves data)*

- **Idea**: A trading idea with metadata, full content, source link, and status.
- **Enrichment**: Sentiment and similarity data derived from an idea.
- **Signal**: A normalized input used by the agent, sourced from ideas or
  Telegram posts.
- **News Item**: A macro or gold-specific news article with sentiment data.
- **Trade**: A proposed or executed position with direction, size, timing, and
  outcome.
- **Agent Configuration**: Rules, thresholds, and enablement state for trading.
- **Sync Run**: A record of a data collection job and its results.
- **Ingestion Run**: Unified ingestion status for TradingView, BingX, Telegram,
  and news feeds with quality metrics.
- **Idea Review**: Governance state and notes for triaging ideas.
- **Source Policy**: Gating rules that control which sources can trigger trades.
- **Topic Cluster**: Weekly/monthly trend summaries for idea streams.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of visible TradingView ideas are captured with full
  content in a single sync run; missing items are reported.
- **SC-002**: 100% of ingested ideas receive sentiment and similarity data
  within one hour of ingestion.
- **SC-003**: An operator can locate and review a specific idea or trade in the
  dashboard within 30 seconds using filters or search.
- **SC-004**: When the agent is disabled, zero trades are executed; when enabled
  in paper mode, trade logs are created for 100% of signals.
- **SC-005**: New Telegram posts appear as signals within 10 minutes of
  publication.
- **SC-006**: Operators can view ingestion health and toggle paper/live trading
  from the dashboard with status updates reflected within 60 seconds.
- **SC-007**: Ingestion quality scoring covers 100% of runs with <5% missing
  required fields after automated re-fetch attempts.
- **SC-008**: Source efficacy and sentiment vs PnL analytics are available in
  the dashboard within 15 minutes of data arrival.
- **SC-009**: Activating the kill switch blocks trades within 60 seconds and
  logs the action with a clear reason.
- **SC-010**: News ingestion delivers new items within 15 minutes of source
  publication with deduplication accuracy above 98%.
