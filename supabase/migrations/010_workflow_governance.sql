alter table ideas
  add column if not exists review_status text not null default 'new',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

alter table idea_revisions
  add column if not exists diff_summary jsonb;

create table if not exists idea_notes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  author text,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idea_notes_idea_id_idx
  on idea_notes (idea_id);

create table if not exists enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer not null default 0,
  error_count integer not null default 0,
  error_summary text
);

create index if not exists enrichment_runs_started_at_idx
  on enrichment_runs (started_at desc);

create table if not exists enrichment_revisions (
  id uuid primary key default gen_random_uuid(),
  enrichment_id uuid not null references enrichments (id) on delete cascade,
  idea_id uuid references ideas (id) on delete cascade,
  run_id uuid references enrichment_runs (id) on delete set null,
  previous_payload jsonb,
  next_payload jsonb,
  diff_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists enrichment_revisions_enrichment_idx
  on enrichment_revisions (enrichment_id);

create table if not exists role_assignments (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  role text not null,
  created_at timestamptz not null default now(),
  unique (actor, role)
);
