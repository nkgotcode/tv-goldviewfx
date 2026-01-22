create table if not exists data_source_configs (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  source_type text not null,
  enabled boolean not null default true,
  freshness_threshold_seconds integer not null default 120,
  updated_at timestamptz not null default now(),
  constraint data_source_configs_pair_check check (pair in ('Gold-USDT', 'XAUTUSDT', 'PAXGUSDT')),
  constraint data_source_configs_type_check check (
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
  unique (pair, source_type)
);

create index if not exists data_source_configs_pair_idx on data_source_configs (pair);
create index if not exists data_source_configs_source_type_idx on data_source_configs (source_type);
