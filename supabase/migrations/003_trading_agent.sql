create table if not exists agent_configurations (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  mode text not null default 'paper',
  max_position_size numeric not null default 1,
  daily_loss_limit numeric not null default 0,
  allowed_instruments text[] not null default array['GOLD'],
  updated_at timestamptz not null default now()
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals (id) on delete set null,
  agent_config_id uuid references agent_configurations (id) on delete set null,
  instrument text not null,
  side text not null,
  quantity numeric not null,
  status text not null,
  mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trades_status_idx
  on trades (status);

create index if not exists trades_created_at_idx
  on trades (created_at desc);

create table if not exists trade_executions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trades (id) on delete cascade,
  exchange_order_id text,
  filled_quantity numeric not null default 0,
  average_price numeric not null default 0,
  executed_at timestamptz not null default now(),
  status text not null
);

create index if not exists trade_executions_trade_id_idx
  on trade_executions (trade_id);
