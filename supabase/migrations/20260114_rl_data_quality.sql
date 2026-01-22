create table if not exists feature_set_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists dataset_versions (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  interval text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  checksum text not null,
  feature_set_version_id uuid references feature_set_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dataset_versions_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT')),
  constraint dataset_versions_window_check check (start_at < end_at)
);

create table if not exists dataset_lineage (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references dataset_versions (id) on delete cascade,
  source_run_ids uuid[] not null default '{}'::uuid[],
  parent_dataset_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create table if not exists data_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  pair text not null,
  coverage_pct numeric not null,
  missing_fields_count integer not null,
  parse_confidence numeric not null,
  status text not null,
  computed_at timestamptz not null default now(),
  constraint data_quality_metrics_status_check check (status in ('ok', 'degraded', 'failed')),
  constraint data_quality_metrics_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT'))
);

alter table agent_runs
  add column if not exists dataset_version_id uuid references dataset_versions (id) on delete set null,
  add column if not exists feature_set_version_id uuid references feature_set_versions (id) on delete set null;

alter table evaluation_reports
  add column if not exists dataset_version_id uuid references dataset_versions (id) on delete set null,
  add column if not exists feature_set_version_id uuid references feature_set_versions (id) on delete set null;

create index if not exists data_quality_metrics_pair_idx on data_quality_metrics (pair);
create index if not exists data_quality_metrics_source_idx on data_quality_metrics (source_type);
create index if not exists dataset_versions_pair_idx on dataset_versions (pair);
create index if not exists dataset_lineage_dataset_idx on dataset_lineage (dataset_id);
