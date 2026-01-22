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
