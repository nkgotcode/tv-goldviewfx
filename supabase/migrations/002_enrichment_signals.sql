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
  enrichment_id uuid references enrichments (id) on delete set null,
  generated_at timestamptz not null default now(),
  payload_summary text,
  confidence_score numeric not null default 0
);

create index if not exists signals_source_type_idx
  on signals (source_type);
