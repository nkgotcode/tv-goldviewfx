alter table agent_configurations
  add column if not exists kill_switch boolean not null default false,
  add column if not exists min_confidence_score numeric not null default 0,
  add column if not exists allowed_source_ids uuid[] not null default '{}'::uuid[],
  add column if not exists promotion_required boolean not null default false,
  add column if not exists promotion_min_trades integer not null default 0,
  add column if not exists promotion_min_win_rate numeric not null default 0,
  add column if not exists promotion_min_net_pnl numeric not null default 0,
  add column if not exists promotion_max_drawdown numeric not null default 0;

create table if not exists source_policies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources (id) on delete cascade,
  source_type text not null,
  enabled boolean not null default true,
  min_confidence_score numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_type)
);

create index if not exists source_policies_source_type_idx
  on source_policies (source_type);
