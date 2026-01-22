alter table trades
  add column if not exists client_order_id text;

create index if not exists trades_client_order_id_idx
  on trades (client_order_id);
