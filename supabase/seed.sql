-- Generated from supabase/seed/rl_agent_seed.sql and supabase/seed/rl_agent_edge_seed.sql

truncate table
  learning_updates,
  evaluation_reports,
  trade_decisions,
  market_input_snapshots,
  agent_runs,
  agent_versions,
  risk_limit_sets,
  data_source_status,
  bingx_candles,
  bingx_orderbook_snapshots,
  bingx_trades,
  bingx_funding_rates,
  bingx_open_interest,
  bingx_mark_index_prices,
  bingx_tickers
restart identity cascade;

insert into risk_limit_sets (
  id,
  name,
  max_position_size,
  leverage_cap,
  max_daily_loss,
  max_drawdown,
  max_open_positions,
  active
) values (
  '11111111-1111-4111-8111-111111111111',
  'Baseline Limits',
  1.5,
  3,
  500,
  800,
  2,
  true
);

insert into agent_versions (
  id,
  name,
  training_window_start,
  training_window_end,
  algorithm_label,
  hyperparameter_summary,
  artifact_uri,
  status
) values (
  '22222222-2222-4222-8222-222222222222',
  'Gold RL v1',
  now() - interval '7 days',
  now(),
  'PPO',
  'gamma=0.99, batch=256',
  'supabase://models/gold-rl-v1',
  'promoted'
);

insert into agent_runs (
  id,
  mode,
  pair,
  status,
  started_at,
  stopped_at,
  learning_enabled,
  learning_window_minutes,
  agent_version_id,
  risk_limit_set_id
) values (
  '33333333-3333-4333-8333-333333333333',
  'live',
  'Gold-USDT',
  'stopped',
  now() - interval '2 hours',
  now() - interval '30 minutes',
  true,
  60,
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111'
);

insert into market_input_snapshots (
  id,
  pair,
  captured_at,
  market_features_ref,
  chart_features_ref,
  idea_features_ref,
  signal_features_ref,
  news_features_ref
) values (
  '44444444-4444-4444-8444-444444444444',
  'Gold-USDT',
  now() - interval '5 minutes',
  's3://features/market/1',
  's3://features/chart/1',
  's3://features/ideas/1',
  's3://features/signals/1',
  's3://features/news/1'
);

insert into trade_decisions (
  id,
  agent_run_id,
  pair,
  decided_at,
  action,
  confidence_score,
  inputs_snapshot_id,
  policy_version_label,
  risk_check_result,
  reason
) values (
  '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  'Gold-USDT',
  now() - interval '4 minutes',
  'long',
  0.72,
  '44444444-4444-4444-8444-444444444444',
  'policy-2026-01-12',
  'pass',
  'Aligned signals with favorable risk'
);

insert into evaluation_reports (
  id,
  agent_version_id,
  pair,
  period_start,
  period_end,
  win_rate,
  net_pnl_after_fees,
  max_drawdown,
  trade_count,
  exposure_by_pair,
  status
) values (
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  'Gold-USDT',
  now() - interval '30 days',
  now(),
  0.58,
  1520.4,
  320.1,
  42,
  '{"Gold-USDT": 0.85}'::jsonb,
  'pass'
);

insert into learning_updates (
  id,
  agent_version_id,
  window_start,
  window_end,
  started_at,
  completed_at,
  status,
  evaluation_report_id
) values (
  '77777777-7777-4777-8777-777777777777',
  '22222222-2222-4222-8222-222222222222',
  now() - interval '2 hours',
  now() - interval '1 hour',
  now() - interval '1 hour 30 minutes',
  now() - interval '1 hour',
  'succeeded',
  '66666666-6666-4666-8666-666666666666'
);

insert into bingx_candles (
  id,
  pair,
  interval,
  open_time,
  close_time,
  open,
  high,
  low,
  close,
  volume,
  quote_volume
) values
  (
    '99999999-9999-4999-8999-999999999991',
    'Gold-USDT',
    '1m',
    now() - interval '10 minutes',
    now() - interval '9 minutes',
    2065.4,
    2068.1,
    2063.9,
    2066.7,
    120.4,
    248530.2
  ),
  (
    '99999999-9999-4999-8999-999999999992',
    'Gold-USDT',
    '1m',
    now() - interval '9 minutes',
    now() - interval '8 minutes',
    2066.7,
    2069.2,
    2065.1,
    2068.4,
    98.7,
    204128.6
  );

insert into bingx_orderbook_snapshots (
  id,
  pair,
  captured_at,
  depth_level,
  bids,
  asks
) values (
  '99999999-9999-4999-8999-999999999993',
  'Gold-USDT',
  now() - interval '1 minute',
  5,
  '[[2066.5, 1.2], [2066.3, 0.9], [2066.1, 0.7]]'::jsonb,
  '[[2066.8, 1.1], [2067.0, 0.8], [2067.2, 0.6]]'::jsonb
);

insert into bingx_trades (
  id,
  pair,
  trade_id,
  price,
  quantity,
  side,
  executed_at
) values
  (
    '99999999-9999-4999-8999-999999999994',
    'Gold-USDT',
    'trade-1001',
    2066.8,
    0.35,
    'buy',
    now() - interval '2 minutes'
  ),
  (
    '99999999-9999-4999-8999-999999999995',
    'Gold-USDT',
    'trade-1002',
    2066.2,
    0.28,
    'sell',
    now() - interval '90 seconds'
  );

insert into bingx_funding_rates (
  id,
  pair,
  funding_rate,
  funding_time
) values (
  '99999999-9999-4999-8999-999999999996',
  'Gold-USDT',
  0.0004,
  now() - interval '8 hours'
);

insert into bingx_open_interest (
  id,
  pair,
  open_interest,
  captured_at
) values (
  '99999999-9999-4999-8999-999999999997',
  'Gold-USDT',
  12345.6,
  now() - interval '5 minutes'
);

insert into bingx_mark_index_prices (
  id,
  pair,
  mark_price,
  index_price,
  captured_at
) values (
  '99999999-9999-4999-8999-999999999998',
  'Gold-USDT',
  2066.9,
  2066.5,
  now() - interval '5 minutes'
);

insert into bingx_tickers (
  id,
  pair,
  last_price,
  volume_24h,
  price_change_24h,
  captured_at
) values (
  '99999999-9999-4999-8999-999999999999',
  'Gold-USDT',
  2066.8,
  50231.4,
  1.25,
  now() - interval '2 minutes'
);

insert into data_source_status (
  id,
  source_type,
  pair,
  last_seen_at,
  freshness_threshold_seconds,
  status
) values
  ('88888888-8888-8888-8888-888888888881', 'bingx_candles', 'Gold-USDT', now() - interval '30 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888882', 'bingx_orderbook', 'Gold-USDT', now() - interval '45 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888883', 'bingx_trades', 'Gold-USDT', now() - interval '50 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888884', 'bingx_funding', 'Gold-USDT', now() - interval '1 hour', 3600, 'ok'),
  ('88888888-8888-8888-8888-888888888885', 'bingx_open_interest', 'Gold-USDT', now() - interval '40 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888886', 'bingx_mark_price', 'Gold-USDT', now() - interval '40 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888887', 'bingx_index_price', 'Gold-USDT', now() - interval '40 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888888', 'bingx_ticker', 'Gold-USDT', now() - interval '40 seconds', 120, 'ok'),
  ('88888888-8888-8888-8888-888888888889', 'ideas', 'Gold-USDT', now() - interval '60 seconds', 300, 'ok'),
  ('88888888-8888-8888-8888-888888888890', 'signals', 'Gold-USDT', now() - interval '75 seconds', 300, 'ok'),
  ('88888888-8888-8888-8888-888888888891', 'news', 'Gold-USDT', now() - interval '90 seconds', 600, 'ok'),
  ('88888888-8888-8888-8888-888888888892', 'trades', 'Gold-USDT', now() - interval '90 seconds', 120, 'ok');


-- Edge case fixtures

insert into risk_limit_sets (
  id,
  name,
  max_position_size,
  leverage_cap,
  max_daily_loss,
  max_drawdown,
  max_open_positions,
  active
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Edge Limits',
  0.5,
  1,
  50,
  75,
  1,
  false
) on conflict (id) do nothing;

insert into agent_versions (
  id,
  name,
  training_window_start,
  training_window_end,
  algorithm_label,
  hyperparameter_summary,
  artifact_uri,
  status
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Gold RL v1-rollback',
  now() - interval '14 days',
  now() - interval '7 days',
  'PPO',
  'gamma=0.98, batch=128',
  'supabase://models/gold-rl-v1-rollback',
  'retired'
) on conflict (id) do nothing;

insert into agent_runs (
  id,
  mode,
  pair,
  status,
  started_at,
  stopped_at,
  learning_enabled,
  learning_window_minutes,
  agent_version_id,
  risk_limit_set_id
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'live',
  'PAXGUSDT',
  'stopped',
  now() - interval '3 hours',
  now() - interval '1 hour',
  false,
  30,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
) on conflict (id) do nothing;

insert into trade_decisions (
  id,
  agent_run_id,
  pair,
  decided_at,
  action,
  confidence_score,
  risk_check_result,
  reason
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'PAXGUSDT',
  now() - interval '10 minutes',
  'hold',
  0.31,
  'fail',
  'Risk limit breach detected'
) on conflict (id) do nothing;

insert into data_source_status (
  id,
  source_type,
  pair,
  last_seen_at,
  freshness_threshold_seconds,
  status
) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bingx_candles', 'PAXGUSDT', now() - interval '10 minutes', 120, 'stale'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef', 'bingx_orderbook', 'PAXGUSDT', now() - interval '15 minutes', 120, 'stale'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'news', 'PAXGUSDT', null, 120, 'unavailable')
on conflict (id) do nothing;
