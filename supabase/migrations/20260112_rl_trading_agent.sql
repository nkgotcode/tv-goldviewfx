create table if not exists risk_limit_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_position_size numeric not null,
  leverage_cap numeric not null,
  max_daily_loss numeric not null,
  max_drawdown numeric not null,
  max_open_positions integer not null,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists agent_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  training_window_start timestamptz,
  training_window_end timestamptz,
  algorithm_label text,
  hyperparameter_summary text,
  artifact_uri text,
  status text not null default 'draft',
  promoted_at timestamptz,
  constraint agent_versions_status_check check (status in ('draft', 'evaluating', 'promoted', 'retired'))
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  pair text not null,
  status text not null,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  learning_enabled boolean not null default true,
  learning_window_minutes integer,
  agent_version_id uuid not null references agent_versions (id) on delete restrict,
  risk_limit_set_id uuid not null references risk_limit_sets (id) on delete restrict,
  constraint agent_runs_mode_check check (mode in ('paper', 'live')),
  constraint agent_runs_status_check check (status in ('running', 'paused', 'stopped')),
  constraint agent_runs_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists market_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  captured_at timestamptz not null default now(),
  market_features_ref text,
  chart_features_ref text,
  idea_features_ref text,
  signal_features_ref text,
  news_features_ref text,
  constraint market_input_snapshots_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists trade_decisions (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs (id) on delete cascade,
  pair text not null,
  decided_at timestamptz not null default now(),
  action text not null,
  confidence_score numeric not null,
  inputs_snapshot_id uuid references market_input_snapshots (id) on delete set null,
  policy_version_label text,
  risk_check_result text not null default 'pass',
  reason text,
  constraint trade_decisions_action_check check (action in ('long', 'short', 'close', 'hold')),
  constraint trade_decisions_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT')),
  constraint trade_decisions_risk_check check (risk_check_result in ('pass', 'fail'))
);

alter table trade_executions
  add column if not exists trade_decision_id uuid references trade_decisions (id) on delete set null;

create table if not exists evaluation_reports (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions (id) on delete cascade,
  pair text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  win_rate numeric not null,
  net_pnl_after_fees numeric not null,
  max_drawdown numeric not null,
  trade_count integer not null,
  exposure_by_pair jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null default now(),
  constraint evaluation_reports_status_check check (status in ('pass', 'fail')),
  constraint evaluation_reports_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists learning_updates (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions (id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  evaluation_report_id uuid references evaluation_reports (id) on delete set null,
  constraint learning_updates_status_check check (status in ('running', 'succeeded', 'failed'))
);

create table if not exists data_source_status (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  pair text not null,
  last_seen_at timestamptz,
  freshness_threshold_seconds integer not null,
  status text not null default 'ok',
  updated_at timestamptz not null default now(),
  constraint data_source_status_type_check check (
    source_type in (
      'bingx_candles',
      'bingx_orderbook',
      'bingx_trades',
      'bingx_funding',
      'bingx_open_interest',
      'bingx_mark_price',
      'bingx_index_price',
      'bingx_ticker',
      'ideas',
      'signals',
      'news',
      'ocr_text',
      'trades'
    )
  ),
  constraint data_source_status_state_check check (status in ('ok', 'stale', 'unavailable')),
  constraint data_source_status_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_candles (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  interval text not null,
  open_time timestamptz not null,
  close_time timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  quote_volume numeric,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_candles_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_orderbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  captured_at timestamptz not null,
  depth_level integer not null,
  bids jsonb not null,
  asks jsonb not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_orderbook_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_trades (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  trade_id text not null,
  price numeric not null,
  quantity numeric not null,
  side text not null,
  executed_at timestamptz not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_trades_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT')),
  constraint bingx_trades_side_check check (side in ('buy', 'sell'))
);

create table if not exists bingx_funding_rates (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  funding_rate numeric not null,
  funding_time timestamptz not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_funding_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_open_interest (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  open_interest numeric not null,
  captured_at timestamptz not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_open_interest_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_mark_index_prices (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  mark_price numeric not null,
  index_price numeric not null,
  captured_at timestamptz not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_mark_index_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create table if not exists bingx_tickers (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  last_price numeric not null,
  volume_24h numeric,
  price_change_24h numeric,
  captured_at timestamptz not null,
  source text not null default 'bingx',
  created_at timestamptz not null default now(),
  constraint bingx_tickers_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

create index if not exists agent_versions_status_idx on agent_versions (status);
create index if not exists agent_runs_pair_status_idx on agent_runs (pair, status);
create index if not exists agent_runs_started_at_idx on agent_runs (started_at desc);

create index if not exists market_input_snapshots_pair_captured_idx on market_input_snapshots (pair, captured_at desc);

create index if not exists trade_decisions_agent_run_idx on trade_decisions (agent_run_id);
create index if not exists trade_decisions_decided_at_idx on trade_decisions (decided_at desc);

create index if not exists trade_executions_trade_decision_idx on trade_executions (trade_decision_id);

create index if not exists evaluation_reports_agent_version_idx on evaluation_reports (agent_version_id);
create index if not exists evaluation_reports_created_at_idx on evaluation_reports (created_at desc);

create index if not exists learning_updates_agent_version_idx on learning_updates (agent_version_id);
create index if not exists learning_updates_status_idx on learning_updates (status);

create unique index if not exists data_source_status_pair_source_idx on data_source_status (pair, source_type);
create index if not exists data_source_status_status_idx on data_source_status (status);

create unique index if not exists bingx_candles_pair_interval_open_idx
  on bingx_candles (pair, interval, open_time);
create index if not exists bingx_candles_pair_close_idx on bingx_candles (pair, close_time desc);

create index if not exists bingx_orderbook_pair_captured_idx on bingx_orderbook_snapshots (pair, captured_at desc);

create unique index if not exists bingx_trades_pair_trade_idx on bingx_trades (pair, trade_id);
create index if not exists bingx_trades_pair_executed_idx on bingx_trades (pair, executed_at desc);

create unique index if not exists bingx_funding_pair_time_idx on bingx_funding_rates (pair, funding_time);

create unique index if not exists bingx_open_interest_pair_time_idx on bingx_open_interest (pair, captured_at);

create unique index if not exists bingx_mark_index_pair_time_idx on bingx_mark_index_prices (pair, captured_at);

create unique index if not exists bingx_tickers_pair_time_idx on bingx_tickers (pair, captured_at);
