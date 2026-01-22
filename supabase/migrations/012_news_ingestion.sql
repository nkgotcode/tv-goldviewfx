create table if not exists news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  identifier text not null,
  category text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identifier)
);

create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references news_sources (id) on delete set null,
  external_id text,
  title text not null,
  url text,
  summary text,
  content text,
  content_hash text,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  dedup_status text not null default 'canonical',
  unique (source_id, external_id)
);

create index if not exists news_items_published_at_idx
  on news_items (published_at desc);

alter table signals
  add column if not exists news_item_id uuid references news_items (id) on delete set null;
