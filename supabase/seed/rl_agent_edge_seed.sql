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
