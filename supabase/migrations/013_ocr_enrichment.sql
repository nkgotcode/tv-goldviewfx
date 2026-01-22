create table if not exists idea_media (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image',
  ocr_status text not null default 'pending',
  ocr_text text,
  ocr_confidence numeric,
  ocr_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, media_url)
);

create index if not exists idea_media_status_idx
  on idea_media (ocr_status);
