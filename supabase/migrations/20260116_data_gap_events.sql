create table if not exists data_gap_events (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  source_type text not null,
  interval text,
  gap_start timestamptz not null,
  gap_end timestamptz not null,
  expected_interval_seconds integer,
  gap_seconds integer not null,
  missing_points integer,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  heal_attempts integer not null default 0,
  last_heal_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  constraint data_gap_events_status_check check (status in ('open', 'healing', 'resolved')),
  constraint data_gap_events_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT')),
  constraint data_gap_events_source_check check (
    source_type in (
      'bingx_candles',
      'bingx_orderbook',
      'bingx_trades',
      'bingx_funding',
      'bingx_open_interest',
      'bingx_mark_price',
      'bingx_index_price',
      'bingx_ticker',
      'ideas',
      'signals',
      'news',
      'ocr_text',
      'trades'
    )
  ),
  unique (pair, source_type, interval, gap_start, gap_end)
);

create index if not exists data_gap_events_pair_idx on data_gap_events (pair);
create index if not exists data_gap_events_source_idx on data_gap_events (source_type);
create index if not exists data_gap_events_status_idx on data_gap_events (status);
create index if not exists data_gap_events_detected_at_idx on data_gap_events (detected_at desc);
