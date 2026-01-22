create table if not exists topic_clusters (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  label text not null,
  keywords text[] not null default '{}'::text[],
  idea_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists topic_clusters_period_idx
  on topic_clusters (period, window_start desc);

create table if not exists idea_topics (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  cluster_id uuid not null references topic_clusters (id) on delete cascade,
  score numeric,
  created_at timestamptz not null default now(),
  unique (idea_id, cluster_id)
);

create index if not exists idea_topics_cluster_idx
  on idea_topics (cluster_id);
