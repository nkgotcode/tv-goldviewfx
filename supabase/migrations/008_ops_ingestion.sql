create table if not exists ingestion_configs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid references sources (id) on delete set null,
  feed text,
  enabled boolean not null default true,
  refresh_interval_seconds integer,
  backfill_max_days integer,
  rate_limit_per_minute integer,
  backoff_base_seconds integer,
  backoff_max_seconds integer,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, feed)
);

create index if not exists ingestion_configs_source_idx
  on ingestion_configs (source_type);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid references sources (id) on delete set null,
  feed text,
  trigger text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  new_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  error_summary text,
  coverage_pct numeric,
  missing_fields_count integer,
  parse_confidence numeric
);

create index if not exists ingestion_runs_source_idx
  on ingestion_runs (source_type);

create index if not exists ingestion_runs_status_idx
  on ingestion_runs (status);

create index if not exists ingestion_runs_started_at_idx
  on ingestion_runs (started_at desc);

create table if not exists ops_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_events_created_at_idx
  on ops_audit_events (created_at desc);

alter table sync_runs
  add column if not exists coverage_pct numeric,
  add column if not exists missing_fields_count integer,
  add column if not exists parse_confidence numeric;
