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

alter table signals
  add column if not exists telegram_post_id uuid references telegram_posts (id) on delete cascade;
