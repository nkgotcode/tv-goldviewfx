# System Data Pull Report

- Generated at: 2026-02-20T07:46:20.065Z
- Database: postgres
- User: postgres
- Tables scanned: 126
- Total rows (all tables): 4757
- Tables with ticker dimension: 15
- Unique tickers: ALGO-USDT, BNB-USDT, BTC-USDT, ETH-USDT, GOLD-USDT, Gold-USDT, PAXGUSDT, SOL-USDT, XAUTUSDT, XRP-USDT

## account_risk_policies
- Rows: 6
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:19.075Z -> 2026-02-20T06:51:33.896Z
- Freshness delta: 0d 0h 54m 46s
- 24h velocity: last=6, prev=0, delta=6 (100.00%)

## account_risk_state
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-20T06:51:33.912Z -> 2026-02-20T06:51:33.912Z
- Freshness delta: 0d 0h 54m 46s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)
- Status breakdown: cooldown:1

## admin_audit_events
- Rows: 21
- Primary time column: created_at
- Time range: 2026-02-19T20:49:29.747Z -> 2026-02-19T21:02:37.212Z
- Freshness delta: 0d 10h 43m 42s
- 24h velocity: last=21, prev=0, delta=21 (100.00%)

## admin_invitations
- Rows: 8
- Primary time column: created_at
- Time range: 2026-02-19T20:49:44.023Z -> 2026-02-19T21:02:37.192Z
- Freshness delta: 0d 10h 43m 42s
- 24h velocity: last=8, prev=0, delta=8 (100.00%)
- Status breakdown: sent:3, revoked:3, expired:1, accepted:1

## admin_marketing_inquiry_alert_states
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## admin_notification_cursors
- Rows: 4
- Primary time column: updated_at
- Time range: 2026-02-19T20:45:30.926Z -> 2026-02-19T20:58:47.716Z
- Freshness delta: 0d 10h 47m 32s
- 24h velocity: last=4, prev=0, delta=4 (100.00%)

## admin_notification_item_states
- Rows: 5
- Primary time column: updated_at
- Time range: 2026-02-19T22:23:40.708Z -> 2026-02-19T22:24:11.242Z
- Freshness delta: 0d 9h 22m 8s
- 24h velocity: last=5, prev=0, delta=5 (100.00%)

## admin_notification_preferences
- Rows: 4
- Primary time column: updated_at
- Time range: 2026-02-19T20:48:19.758Z -> 2026-02-19T20:58:47.691Z
- Freshness delta: 0d 10h 47m 32s
- 24h velocity: last=4, prev=0, delta=4 (100.00%)

## admin_role_scopes
- Rows: 99

## admin_roles
- Rows: 12
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:33.427Z -> 2026-02-19T21:03:01.711Z
- Freshness delta: 0d 10h 43m 18s
- 24h velocity: last=12, prev=0, delta=12 (100.00%)

## admin_scopes
- Rows: 30
- Primary time column: created_at
- Time range: 2026-02-19T20:44:33.427Z -> 2026-02-19T20:44:35.182Z
- Freshness delta: 0d 11h 1m 44s
- 24h velocity: last=30, prev=0, delta=30 (100.00%)

## admin_team_members
- Rows: 5

## admin_team_roles
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## admin_teams
- Rows: 14
- Primary time column: updated_at
- Time range: 2026-02-19T21:01:28.592Z -> 2026-02-19T21:01:28.598Z
- Freshness delta: 0d 10h 44m 51s
- 24h velocity: last=14, prev=0, delta=14 (100.00%)

## admin_user_roles
- Rows: 14

## admin_user_scopes
- Rows: 2

## admin_users
- Rows: 17
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:55.693Z -> 2026-02-19T21:03:41.213Z
- Freshness delta: 0d 10h 42m 38s
- 24h velocity: last=17, prev=0, delta=17 (100.00%)
- Status breakdown: active:16, disabled:1

## agent_configurations
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-20T06:51:48.348Z -> 2026-02-20T06:51:48.348Z
- Freshness delta: 0d 0h 54m 31s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)

## agent_runs
- Rows: 14
- Primary time column: started_at
- Time range: 2026-02-20T06:47:21.713Z -> 2026-02-20T06:51:48.369Z
- Freshness delta: 0d 0h 54m 31s
- 24h velocity: last=14, prev=0, delta=14 (100.00%)
- Status breakdown: stopped:8, paused:6
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=8, range=2026-02-20T06:47:21.713Z -> 2026-02-20T06:51:48.369Z, freshness=0d 0h 54m 31s, velocity=8/0 (+8, 100.00%)
  - PAXGUSDT: rows=4, range=2026-02-20T06:47:32.226Z -> 2026-02-20T06:51:47.904Z, freshness=0d 0h 54m 32s, velocity=4/0 (+4, 100.00%)
  - XAUTUSDT: rows=2, range=2026-02-20T06:50:33.462Z -> 2026-02-20T06:51:35.846Z, freshness=0d 0h 54m 44s, velocity=2/0 (+2, 100.00%)

## agent_versions
- Rows: 24
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:24.734Z -> 2026-02-20T06:51:47.480Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=24, prev=0, delta=24 (100.00%)
- Status breakdown: retired:18, evaluating:3, promoted:3

## bingx_candles
- Rows: 60
- Primary time column: open_time
- Time range: 2026-02-20T06:32:24.547Z -> 2026-02-20T06:55:40.459Z
- Freshness delta: 0d 0h 50m 39s
- 24h velocity: last=60, prev=0, delta=60 (100.00%)
- Interval breakdown: 1m:60
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=60, range=2026-02-20T06:32:24.547Z -> 2026-02-20T06:55:40.459Z, freshness=0d 0h 50m 39s, velocity=60/0 (+60, 100.00%)
- Candle gap summary:
  - Gold-USDT 1m: gaps=0, max_step_seconds=60

## bingx_funding_rates
- Rows: 0
- Primary time column: funding_time
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## bingx_mark_index_prices
- Rows: 0
- Primary time column: captured_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## bingx_open_interest
- Rows: 0
- Primary time column: captured_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## bingx_orderbook_snapshots
- Rows: 0
- Primary time column: captured_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## bingx_tickers
- Rows: 0
- Primary time column: captured_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## bingx_trades
- Rows: 0
- Primary time column: executed_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
- Ticker column: pair
- Per-ticker:

## consent_events
- Rows: 180
- Primary time column: created_at
- Time range: 2026-01-20T23:38:47.808Z -> 2026-02-19T20:59:51.688Z
- Freshness delta: 0d 10h 46m 28s
- 24h velocity: last=44, prev=4, delta=40 (1000.00%)

## contact_identities
- Rows: 1709
- Primary time column: created_at
- Time range: 2026-02-19T20:44:56.462Z -> 2026-02-19T21:00:46.447Z
- Freshness delta: 0d 10h 45m 33s
- 24h velocity: last=1709, prev=0, delta=1709 (100.00%)

## contact_merge_log
- Rows: 0

## contact_touchpoints
- Rows: 32

## contacts
- Rows: 1631
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:56.462Z -> 2026-02-19T21:00:46.447Z
- Freshness delta: 0d 10h 45m 33s
- 24h velocity: last=1631, prev=0, delta=1631 (100.00%)

## content_audit_logs
- Rows: 4
- Primary time column: created_at
- Time range: 2026-02-19T20:51:49.951Z -> 2026-02-19T20:53:41.007Z
- Freshness delta: 0d 10h 52m 39s
- 24h velocity: last=4, prev=0, delta=4 (100.00%)

## content_entries
- Rows: 8
- Primary time column: updated_at
- Time range: 2026-02-19T20:51:49.940Z -> 2026-02-19T20:59:14.825Z
- Freshness delta: 0d 10h 47m 5s
- 24h velocity: last=8, prev=0, delta=8 (100.00%)
- Status breakdown: draft:4, published:3, archived:1

## content_media_links
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## content_sites
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:53:40.462Z -> 2026-02-19T20:59:14.801Z
- Freshness delta: 0d 10h 47m 5s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: active:2

## data_source_configs
- Rows: 9
- Primary time column: updated_at
- Time range: 2026-02-20T06:51:44.287Z -> 2026-02-20T06:51:44.302Z
- Freshness delta: 0d 0h 54m 35s
- 24h velocity: last=9, prev=0, delta=9 (100.00%)
- Ticker column: pair
- Per-ticker:
  - ALGO-USDT: rows=1, range=2026-02-20T06:51:44.295Z -> 2026-02-20T06:51:44.295Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - BNB-USDT: rows=1, range=2026-02-20T06:51:44.302Z -> 2026-02-20T06:51:44.302Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - BTC-USDT: rows=1, range=2026-02-20T06:51:44.296Z -> 2026-02-20T06:51:44.296Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - ETH-USDT: rows=1, range=2026-02-20T06:51:44.297Z -> 2026-02-20T06:51:44.297Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - Gold-USDT: rows=1, range=2026-02-20T06:51:44.287Z -> 2026-02-20T06:51:44.287Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - PAXGUSDT: rows=1, range=2026-02-20T06:51:44.292Z -> 2026-02-20T06:51:44.292Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - SOL-USDT: rows=1, range=2026-02-20T06:51:44.298Z -> 2026-02-20T06:51:44.298Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - XAUTUSDT: rows=1, range=2026-02-20T06:51:44.290Z -> 2026-02-20T06:51:44.290Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)
  - XRP-USDT: rows=1, range=2026-02-20T06:51:44.300Z -> 2026-02-20T06:51:44.300Z, freshness=0d 0h 54m 35s, velocity=1/0 (+1, 100.00%)

## data_source_status
- Rows: 117
- Primary time column: updated_at
- Time range: 2026-02-20T06:51:48.374Z -> 2026-02-20T06:52:00.450Z
- Freshness delta: 0d 0h 54m 19s
- 24h velocity: last=117, prev=0, delta=117 (100.00%)
- Status breakdown: unavailable:65, ok:52
- Ticker column: pair
- Per-ticker:
  - ALGO-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - BNB-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - BTC-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - ETH-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - Gold-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:52:00.450Z, freshness=0d 0h 54m 19s, velocity=13/0 (+13, 100.00%)
  - PAXGUSDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - SOL-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - XAUTUSDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
  - XRP-USDT: rows=13, range=2026-02-20T06:51:48.374Z -> 2026-02-20T06:51:48.374Z, freshness=0d 0h 54m 31s, velocity=13/0 (+13, 100.00%)
- Source status rows: 117
  - ALGO-USDT: ok=3, stale=0, unavailable=10, total=13
  - BNB-USDT: ok=3, stale=0, unavailable=10, total=13
  - BTC-USDT: ok=3, stale=0, unavailable=10, total=13
  - ETH-USDT: ok=3, stale=0, unavailable=10, total=13
  - Gold-USDT: ok=12, stale=0, unavailable=1, total=13
  - PAXGUSDT: ok=11, stale=0, unavailable=2, total=13
  - SOL-USDT: ok=3, stale=0, unavailable=10, total=13
  - XAUTUSDT: ok=11, stale=0, unavailable=2, total=13
  - XRP-USDT: ok=3, stale=0, unavailable=10, total=13

## dataset_lineage
- Rows: 9
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:20.629Z -> 2026-02-20T06:51:40.509Z
- Freshness delta: 0d 0h 54m 39s
- 24h velocity: last=9, prev=0, delta=9 (100.00%)

## dataset_versions
- Rows: 14
- Primary time column: created_at
- Time range: 2026-02-20T06:47:17.245Z -> 2026-02-20T06:51:45.230Z
- Freshness delta: 0d 0h 54m 34s
- 24h velocity: last=14, prev=0, delta=14 (100.00%)
- Interval breakdown: 1m:14
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=14, range=2026-02-20T06:47:17.245Z -> 2026-02-20T06:51:45.230Z, freshness=0d 0h 54m 34s, velocity=14/0 (+14, 100.00%)

## editor_config_versions
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## editor_evaluation_log
- Rows: 0
- Primary time column: recorded_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## email_campaigns
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## email_deliveries
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## email_jobs
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## email_segments
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## email_template_versions
- Rows: 116
- Primary time column: created_at
- Time range: 2026-02-19T20:47:53.181Z -> 2026-02-20T02:47:32.002Z
- Freshness delta: 0d 4h 58m 48s
- 24h velocity: last=116, prev=0, delta=116 (100.00%)

## email_templates
- Rows: 32
- Primary time column: updated_at
- Time range: 2026-02-19T22:55:59.154Z -> 2026-02-20T03:49:48.531Z
- Freshness delta: 0d 3h 56m 31s
- 24h velocity: last=32, prev=0, delta=32 (100.00%)
- Status breakdown: published:27, archived:3, draft:2

## email_triggers
- Rows: 0

## evaluation_reports
- Rows: 3
- Primary time column: period_end
- Time range: 2026-02-20T06:47:21.834Z -> 2026-02-20T06:51:37.409Z
- Freshness delta: 0d 0h 54m 42s
- 24h velocity: last=3, prev=0, delta=3 (100.00%)
- Status breakdown: fail:3
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=3, range=2026-02-20T06:47:21.834Z -> 2026-02-20T06:51:37.409Z, freshness=0d 0h 54m 42s, velocity=3/0 (+3, 100.00%)

## event_metrics_cache
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## event_neighborhoods
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## event_venues
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## events
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## feature_set_versions
- Rows: 8
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:17.240Z -> 2026-02-20T06:51:45.228Z
- Freshness delta: 0d 0h 54m 34s
- 24h velocity: last=8, prev=0, delta=8 (100.00%)

## form_settings
- Rows: 6

## forms
- Rows: 7
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:34.408Z -> 2026-02-19T20:57:39.199Z
- Freshness delta: 0d 10h 48m 40s
- 24h velocity: last=7, prev=0, delta=7 (100.00%)
- Status breakdown: published:6, draft:1

## greylist_ips
- Rows: 0

## import_rows
- Rows: 4
- Primary time column: created_at
- Time range: 2026-02-19T21:00:51.845Z -> 2026-02-19T21:00:56.169Z
- Freshness delta: 0d 10h 45m 23s
- 24h velocity: last=4, prev=0, delta=4 (100.00%)
- Status breakdown: valid:4

## imports
- Rows: 2
- Primary time column: started_at
- Time range: 2026-02-19T21:00:50.677Z -> 2026-02-19T21:00:56.058Z
- Freshness delta: 0d 10h 45m 24s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: review:2

## learning_updates
- Rows: 0
- Primary time column: started_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## manychat_field_catalog
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## manychat_jobs
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## manychat_mapping_audit
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## manychat_profiles
- Rows: 0

## manychat_sync_log
- Rows: 0

## market_input_snapshots
- Rows: 8
- Primary time column: captured_at
- Time range: 2026-02-20T06:47:32.373Z -> 2026-02-20T06:51:47.967Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=8, prev=0, delta=8 (100.00%)
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=4, range=2026-02-20T06:50:34.789Z -> 2026-02-20T06:51:45.654Z, freshness=0d 0h 54m 34s, velocity=4/0 (+4, 100.00%)
  - PAXGUSDT: rows=4, range=2026-02-20T06:47:32.373Z -> 2026-02-20T06:51:47.967Z, freshness=0d 0h 54m 32s, velocity=4/0 (+4, 100.00%)

## marketing_campaign_logs
- Rows: 1
- Primary time column: created_at
- Time range: 2026-02-19T21:00:02.107Z -> 2026-02-19T21:00:02.107Z
- Freshness delta: 0d 10h 46m 17s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)
- Status breakdown: queued:1

## marketing_inquiries
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## marketing_inquiry_messages
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## marketing_outreach_runs
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## marketing_settings
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-19T20:59:52.007Z -> 2026-02-19T20:59:52.007Z
- Freshness delta: 0d 10h 46m 28s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)

## media_assets
- Rows: 2
- Primary time column: created_at
- Time range: 2026-02-19T20:54:52.316Z -> 2026-02-19T20:54:52.398Z
- Freshness delta: 0d 10h 51m 27s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: uploaded:2

## messaging_activity
- Rows: 39
- Primary time column: created_at
- Time range: 2026-02-19T20:45:25.396Z -> 2026-02-19T21:03:48.739Z
- Freshness delta: 0d 10h 42m 31s
- 24h velocity: last=39, prev=0, delta=39 (100.00%)
- Status breakdown: simulated:35, queued:4

## messaging_channels
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:33.822Z -> 2026-02-19T20:44:33.822Z
- Freshness delta: 0d 11h 1m 46s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)

## messaging_environment_change_log
- Rows: 3

## messaging_environment_configs
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T21:03:44.666Z -> 2026-02-19T21:03:44.666Z
- Freshness delta: 0d 10h 42m 35s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)

## messaging_provider_credential_metadata
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## model_artifacts
- Rows: 5
- Primary time column: created_at
- Time range: 2026-02-20T06:47:17.257Z -> 2026-02-20T06:51:40.634Z
- Freshness delta: 0d 0h 54m 39s
- 24h velocity: last=5, prev=0, delta=5 (100.00%)

## neighborhoods
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## ops_alerts
- Rows: 16
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:19.215Z -> 2026-02-20T06:51:48.419Z
- Freshness delta: 0d 0h 54m 31s
- 24h velocity: last=16, prev=0, delta=16 (100.00%)
- Status breakdown: open:16

## ops_audit_events
- Rows: 118
- Primary time column: created_at
- Time range: 2026-02-20T06:47:18.203Z -> 2026-02-20T06:51:48.017Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=118, prev=0, delta=118 (100.00%)

## provider_backfill_state
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## provider_sms_events
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## reservation_assignment_state
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:57:09.250Z -> 2026-02-19T20:57:39.845Z
- Freshness delta: 0d 10h 48m 40s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)

## reservation_inquiries
- Rows: 11
- Primary time column: updated_at
- Time range: 2026-02-19T20:47:24.335Z -> 2026-02-19T20:59:23.986Z
- Freshness delta: 0d 10h 46m 56s
- 24h velocity: last=11, prev=0, delta=11 (100.00%)
- Status breakdown: new:9, in_progress:2

## reservation_inquiry_logs
- Rows: 25
- Primary time column: created_at
- Time range: 2026-02-19T20:47:24.224Z -> 2026-02-19T20:59:23.958Z
- Freshness delta: 0d 10h 46m 56s
- 24h velocity: last=25, prev=0, delta=25 (100.00%)

## reservation_inquiry_photo_requests
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-19T20:47:32.447Z -> 2026-02-19T20:47:32.447Z
- Freshness delta: 0d 10h 58m 47s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)
- Status breakdown: complete:1

## reservation_inquiry_photos
- Rows: 2
- Primary time column: created_at
- Time range: 2026-02-19T20:47:32.245Z -> 2026-02-19T20:47:32.433Z
- Freshness delta: 0d 10h 58m 47s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: uploaded:2

## retry_queue
- Rows: 4
- Primary time column: updated_at
- Time range: 2026-02-20T06:50:32.401Z -> 2026-02-20T06:52:00.455Z
- Freshness delta: 0d 0h 54m 19s
- 24h velocity: last=4, prev=0, delta=4 (100.00%)
- Status breakdown: succeeded:3, pending:1

## review_attestations
- Rows: 0

## review_automation_settings
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-19T20:58:28.805Z -> 2026-02-19T20:58:28.805Z
- Freshness delta: 0d 10h 47m 51s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)

## review_incentives
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## review_request_events
- Rows: 0

## review_requests
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## risk_limit_sets
- Rows: 13
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:17.236Z -> 2026-02-20T06:52:00.370Z
- Freshness delta: 0d 0h 54m 19s
- 24h velocity: last=13, prev=0, delta=13 (100.00%)

## route_content
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## route_content_drafts
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## route_migration_status
- Rows: 0

## sanity_event_metrics
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## schedule_assignments
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## schedule_items
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## schedule_notification_logs
- Rows: 0

## schedules
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## segment_members
- Rows: 50

## segments
- Rows: 1
- Primary time column: created_at
- Time range: 2026-02-19T20:56:09.547Z -> 2026-02-19T20:56:09.547Z
- Freshness delta: 0d 10h 50m 10s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)

## send_profiles
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## site_variants
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## sms_campaign_sync_state
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## sms_campaigns
- Rows: 3
- Primary time column: updated_at
- Time range: 2026-02-19T20:55:59.800Z -> 2026-02-19T20:56:18.525Z
- Freshness delta: 0d 10h 50m 1s
- 24h velocity: last=3, prev=0, delta=3 (100.00%)
- Status breakdown: draft:2, completed:1

## sms_jobs
- Rows: 50
- Primary time column: updated_at
- Time range: 2026-02-19T20:56:17.991Z -> 2026-02-19T20:56:17.991Z
- Freshness delta: 0d 10h 50m 2s
- 24h velocity: last=50, prev=0, delta=50 (100.00%)
- Status breakdown: queued:50

## sms_sends
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## sms_settings
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## sms_templates
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:56:13.640Z -> 2026-02-19T20:56:13.653Z
- Freshness delta: 0d 10h 50m 6s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: published:2

## source_policies
- Rows: 5
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:32.635Z -> 2026-02-20T06:51:48.332Z
- Freshness delta: 0d 0h 54m 31s
- 24h velocity: last=5, prev=0, delta=5 (100.00%)

## submission_failures
- Rows: 0
- Primary time column: created_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)

## submissions
- Rows: 76
- Primary time column: updated_at
- Time range: 2026-02-19T20:44:56.462Z -> 2026-02-19T20:59:51.683Z
- Freshness delta: 0d 10h 46m 28s
- 24h velocity: last=76, prev=0, delta=76 (100.00%)

## subscription_billing_events
- Rows: 2
- Primary time column: created_at
- Time range: 2026-02-19T20:49:12.918Z -> 2026-02-19T20:49:12.918Z
- Freshness delta: 0d 10h 57m 7s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)

## subscription_credit_balances
- Rows: 1
- Primary time column: updated_at
- Time range: 2026-02-19T20:49:12.929Z -> 2026-02-19T20:49:12.929Z
- Freshness delta: 0d 10h 57m 7s
- 24h velocity: last=1, prev=0, delta=1 (100.00%)

## subscription_expected_profiles
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:49:12.907Z -> 2026-02-19T20:49:12.907Z
- Freshness delta: 0d 10h 57m 7s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)

## subscription_services
- Rows: 2
- Primary time column: updated_at
- Time range: 2026-02-19T20:49:12.900Z -> 2026-02-19T20:49:12.900Z
- Freshness delta: 0d 10h 57m 7s
- 24h velocity: last=2, prev=0, delta=2 (100.00%)
- Status breakdown: Active:2

## trade_decisions
- Rows: 11
- Primary time column: decided_at
- Time range: 2026-02-20T06:47:19.294Z -> 2026-02-20T06:51:47.969Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=11, prev=0, delta=11 (100.00%)
- Ticker column: pair
- Per-ticker:
  - Gold-USDT: rows=7, range=2026-02-20T06:47:19.294Z -> 2026-02-20T06:51:45.656Z, freshness=0d 0h 54m 34s, velocity=7/0 (+7, 100.00%)
  - PAXGUSDT: rows=4, range=2026-02-20T06:47:32.384Z -> 2026-02-20T06:51:47.969Z, freshness=0d 0h 54m 32s, velocity=4/0 (+4, 100.00%)

## trade_executions
- Rows: 9
- Primary time column: executed_at
- Time range: 2026-02-20T06:47:20.538Z -> 2026-02-20T06:51:47.975Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=9, prev=0, delta=9 (100.00%)
- Status breakdown: filled:8, partial:1

## trade_state_events
- Rows: 15
- Primary time column: created_at
- Time range: 2026-02-20T06:47:20.552Z -> 2026-02-20T06:51:47.986Z
- Freshness delta: 0d 0h 54m 32s
- 24h velocity: last=15, prev=0, delta=15 (100.00%)

## trades
- Rows: 38
- Primary time column: updated_at
- Time range: 2026-02-20T06:47:19.080Z -> 2026-02-20T06:51:48.350Z
- Freshness delta: 0d 0h 54m 31s
- 24h velocity: last=38, prev=0, delta=38 (100.00%)
- Status breakdown: filled:15, rejected:14, placed:8, partial:1
- Ticker column: instrument
- Per-ticker:
  - GOLD-USDT: rows=36, range=2026-02-20T06:47:19.080Z -> 2026-02-20T06:51:48.350Z, freshness=0d 0h 54m 31s, velocity=36/0 (+36, 100.00%)
  - PAXGUSDT: rows=2, range=2026-02-20T06:51:35.417Z -> 2026-02-20T06:51:47.984Z, freshness=0d 0h 54m 32s, velocity=2/0 (+2, 100.00%)

## venues
- Rows: 0
- Primary time column: updated_at
- Time range: null -> null
- Freshness delta: n/a
- 24h velocity: last=0, prev=0, delta=0 (0.00%)
