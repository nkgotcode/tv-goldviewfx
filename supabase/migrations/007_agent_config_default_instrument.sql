alter table if exists agent_configurations
  alter column allowed_instruments set default array['GOLD-USDT'];

update agent_configurations
set allowed_instruments = array['GOLD-USDT']
where allowed_instruments = array['GOLD'];
