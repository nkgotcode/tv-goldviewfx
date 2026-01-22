create table if not exists tradingview_ideas (
  id bigserial primary key,
  idea_id text,
  url text not null unique,
  title text not null,
  content text,
  author text,
  author_url text,
  symbol text,
  symbol_url text,
  symbol_title text,
  image_url text,
  published_at timestamptz,
  comment_count integer,
  boost_count integer,
  source text not null default 'tradingview',
  scraped_at timestamptz not null default now()
);

create index if not exists tradingview_ideas_published_at_idx
  on tradingview_ideas (published_at desc);

create table if not exists tradingview_idea_updates (
  id bigserial primary key,
  idea_url text not null references tradingview_ideas (url) on delete cascade,
  update_index integer not null,
  update_time timestamptz not null,
  label text,
  content text not null,
  source text not null default 'tradingview',
  scraped_at timestamptz not null default now(),
  unique (idea_url, update_time)
);

create index if not exists tradingview_idea_updates_idea_url_idx
  on tradingview_idea_updates (idea_url, update_time desc);

create extension if not exists pgcrypto;

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  identifier text not null,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, identifier)
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  error_summary text
);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete cascade,
  external_id text,
  url text not null,
  title text not null,
  author_handle text,
  content text,
  content_hash text not null,
  duplicate_of_id uuid references ideas (id) on delete set null,
  dedup_status text not null default 'canonical',
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'active',
  unique (source_id, external_id)
);

create index if not exists ideas_source_content_hash_idx
  on ideas (source_id, content_hash);

create table if not exists idea_revisions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  content text not null,
  content_hash text not null,
  recorded_at timestamptz not null default now(),
  unique (idea_id, content_hash)
);

create index if not exists ideas_published_at_idx
  on ideas (published_at desc);

create table if not exists telegram_posts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete cascade,
  external_id text not null,
  content text not null,
  content_hash text not null,
  duplicate_of_id uuid references telegram_posts (id) on delete set null,
  dedup_status text not null default 'canonical',
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  edited_at timestamptz,
  status text not null default 'active',
  unique (source_id, external_id)
);

create index if not exists telegram_posts_source_content_hash_idx
  on telegram_posts (source_id, content_hash);

create index if not exists telegram_posts_published_at_idx
  on telegram_posts (published_at desc);

create extension if not exists vector;

create table if not exists enrichments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  sentiment_label text not null,
  sentiment_score numeric not null,
  similarity_vector vector,
  model_name text not null,
  created_at timestamptz not null default now(),
  unique (idea_id)
);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  idea_id uuid references ideas (id) on delete cascade,
  telegram_post_id uuid references telegram_posts (id) on delete cascade,
  enrichment_id uuid references enrichments (id) on delete set null,
  generated_at timestamptz not null default now(),
  payload_summary text,
  confidence_score numeric not null default 0
);

create index if not exists signals_source_type_idx
  on signals (source_type);

create table if not exists agent_configurations (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  mode text not null default 'paper',
  max_position_size numeric not null default 1,
  daily_loss_limit numeric not null default 0,
  allowed_instruments text[] not null default array['GOLD-USDT'],
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
  client_order_id text,
  avg_fill_price numeric,
  position_size numeric,
  pnl numeric,
  pnl_pct numeric,
  tp_price numeric,
  sl_price numeric,
  liquidation_price numeric,
  leverage numeric,
  margin_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trades_status_idx
  on trades (status);

create index if not exists trades_created_at_idx
  on trades (created_at desc);

create index if not exists trades_client_order_id_idx
  on trades (client_order_id);

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
