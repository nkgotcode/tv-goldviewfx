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
