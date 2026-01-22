alter table trades
  add column if not exists avg_fill_price numeric,
  add column if not exists position_size numeric,
  add column if not exists pnl numeric,
  add column if not exists pnl_pct numeric,
  add column if not exists tp_price numeric,
  add column if not exists sl_price numeric,
  add column if not exists liquidation_price numeric,
  add column if not exists leverage numeric,
  add column if not exists margin_type text;

with execution_rollup as (
  select
    trade_id,
    sum(filled_quantity) as total_quantity,
    case
      when sum(filled_quantity) > 0
      then sum(filled_quantity * average_price) / sum(filled_quantity)
      else null
    end as avg_price
  from trade_executions
  group by trade_id
)
update trades
set
  position_size = execution_rollup.total_quantity,
  avg_fill_price = execution_rollup.avg_price,
  updated_at = now()
from execution_rollup
where trades.id = execution_rollup.trade_id;
