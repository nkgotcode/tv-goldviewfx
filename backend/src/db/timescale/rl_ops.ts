import postgres from "postgres";
import { logInfo } from "../../services/logger";

type Direction = "asc" | "desc";

type Filter = {
  field: string;
  op?: "eq" | "in" | "gte" | "lte" | "is";
  value: unknown;
};

let sqlClient: postgres.Sql | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function envBool(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  return defaultValue;
}

function assertIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return value;
}

function quoteIdent(value: string) {
  return `"${assertIdentifier(value)}"`;
}

function normalizeRow<T extends Record<string, unknown>>(row: T): T {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return normalized as T;
}

export function rlOpsUsesTimescale() {
  const enabled = envBool("TIMESCALE_RL_OPS_ENABLED", false);
  const hasUrl = Boolean(process.env.TIMESCALE_URL);
  if (enabled && !hasUrl) {
    throw new Error("TIMESCALE_RL_OPS_ENABLED=true requires TIMESCALE_URL");
  }
  return enabled && hasUrl;
}

function getSql() {
  const url = process.env.TIMESCALE_URL;
  if (!url) {
    throw new Error("TIMESCALE_URL is required when TIMESCALE_RL_OPS_ENABLED=true");
  }
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
  }
  return sqlClient;
}

export async function ensureTimescaleRlOpsSchema() {
  if (!rlOpsUsesTimescale()) return;
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists agent_runs (
          id text primary key,
          mode text not null,
          pair text not null,
          status text not null,
          learning_enabled boolean not null default true,
          learning_window_minutes integer null,
          agent_version_id text not null,
          risk_limit_set_id text not null,
          dataset_version_id text null,
          feature_set_version_id text null,
          started_at timestamptz not null default now(),
          stopped_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_agent_runs_pair_started on agent_runs (pair, started_at desc)`;

      await sql`
        create table if not exists agent_versions (
          id text primary key,
          name text not null,
          training_window_start timestamptz null,
          training_window_end timestamptz null,
          algorithm_label text null,
          hyperparameter_summary text null,
          artifact_uri text null,
          artifact_checksum text null,
          artifact_size_bytes bigint null,
          dataset_version_id text null,
          dataset_hash text null,
          feature_set_version_id text null,
          status text not null default 'draft',
          promoted_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_agent_versions_status_created on agent_versions (status, created_at desc)`;

      await sql`
        create table if not exists evaluation_reports (
          id text primary key,
          agent_version_id text not null,
          pair text not null,
          period_start timestamptz not null,
          period_end timestamptz not null,
          dataset_version_id text null,
          dataset_hash text null,
          feature_set_version_id text null,
          artifact_uri text null,
          backtest_run_id text null,
          win_rate double precision not null,
          net_pnl_after_fees double precision not null,
          max_drawdown double precision not null,
          trade_count integer not null,
          exposure_by_pair jsonb not null default '{}'::jsonb,
          metadata jsonb not null default '{}'::jsonb,
          status text not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_eval_reports_agent_created on evaluation_reports (agent_version_id, created_at desc)`;
      await sql`alter table evaluation_reports add column if not exists metadata jsonb not null default '{}'::jsonb`;

      await sql`
        create table if not exists model_artifacts (
          id text primary key,
          agent_version_id text not null,
          artifact_uri text not null,
          artifact_checksum text not null,
          artifact_size_bytes bigint not null,
          content_type text null,
          training_window_start timestamptz null,
          training_window_end timestamptz null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create unique index if not exists idx_model_artifacts_uri on model_artifacts (artifact_uri)`;

      await sql`
        create table if not exists learning_updates (
          id text primary key,
          agent_version_id text not null,
          window_start timestamptz not null,
          window_end timestamptz not null,
          status text not null,
          started_at timestamptz not null default now(),
          completed_at timestamptz null,
          evaluation_report_id text null,
          champion_evaluation_report_id text null,
          promoted boolean null,
          decision_reasons jsonb not null default '[]'::jsonb,
          metric_deltas jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_learning_updates_agent_started on learning_updates (agent_version_id, started_at desc)`;
      await sql`alter table learning_updates add column if not exists champion_evaluation_report_id text null`;
      await sql`alter table learning_updates add column if not exists promoted boolean null`;
      await sql`alter table learning_updates add column if not exists decision_reasons jsonb not null default '[]'::jsonb`;
      await sql`alter table learning_updates add column if not exists metric_deltas jsonb not null default '{}'::jsonb`;

      await sql`
        create table if not exists agent_configurations (
          id text primary key,
          enabled boolean not null default false,
          mode text not null default 'paper',
          max_position_size double precision not null default 1,
          daily_loss_limit double precision not null default 0,
          allowed_instruments jsonb not null default '[]'::jsonb,
          kill_switch boolean not null default false,
          kill_switch_reason text null,
          min_confidence_score double precision not null default 0,
          allowed_source_ids jsonb not null default '[]'::jsonb,
          promotion_required boolean not null default false,
          promotion_min_trades integer not null default 0,
          promotion_min_win_rate double precision not null default 0,
          promotion_min_net_pnl double precision not null default 0,
          promotion_max_drawdown double precision not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_agent_config_updated on agent_configurations (updated_at desc)`;

      await sql`
        create table if not exists risk_limit_sets (
          id text primary key,
          name text not null,
          max_position_size double precision not null,
          leverage_cap double precision not null,
          max_daily_loss double precision not null,
          max_drawdown double precision not null,
          max_open_positions integer not null,
          effective_from timestamptz not null default now(),
          active boolean not null default true,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_risk_limit_effective on risk_limit_sets (effective_from desc)`;

      await sql`
        create table if not exists dataset_versions (
          id text primary key,
          pair text not null,
          interval text not null,
          start_at timestamptz not null,
          end_at timestamptz not null,
          checksum text not null,
          dataset_hash text null,
          window_size integer null,
          stride integer null,
          feature_set_version_id text null,
          feature_schema_fingerprint text null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_dataset_versions_created on dataset_versions (created_at desc)`;
      await sql`alter table dataset_versions add column if not exists feature_schema_fingerprint text null`;

      await sql`
        create table if not exists feature_set_versions (
          id text primary key,
          label text not null,
          description text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create unique index if not exists idx_feature_set_label on feature_set_versions (label)`;
      await sql`create index if not exists idx_feature_set_created on feature_set_versions (created_at desc)`;

      await sql`
        create table if not exists trades (
          id text primary key,
          signal_id text null,
          agent_config_id text null,
          agent_run_id text null,
          instrument text not null,
          side text not null,
          quantity double precision not null,
          status text not null,
          mode text not null,
          client_order_id text null,
          avg_fill_price double precision null,
          position_size double precision null,
          pnl double precision null,
          pnl_pct double precision null,
          tp_price double precision null,
          sl_price double precision null,
          closed_at timestamptz null,
          liquidation_price double precision null,
          leverage double precision null,
          margin_type text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_trades_created on trades (created_at desc)`;
      await sql`create index if not exists idx_trades_run_created on trades (agent_run_id, created_at desc)`;
      await sql`create index if not exists idx_trades_status on trades (status)`;

      await sql`
        create table if not exists trade_decisions (
          id text primary key,
          agent_run_id text not null,
          pair text not null,
          decided_at timestamptz not null default now(),
          action text not null,
          confidence_score double precision not null,
          inputs_snapshot_id text null,
          policy_version_label text null,
          risk_check_result text null,
          reason text null,
          reference_price double precision null,
          trace_id text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_trade_decisions_run_time on trade_decisions (agent_run_id, decided_at desc)`;

      await sql`
        create table if not exists trade_executions (
          id text primary key,
          trade_id text not null,
          trade_decision_id text null,
          execution_kind text null,
          exchange_order_id text null,
          client_order_id text null,
          idempotency_key text null,
          trace_id text null,
          execution_mode text null,
          requested_instrument text null,
          requested_side text null,
          requested_quantity double precision null,
          filled_quantity double precision not null,
          average_price double precision not null,
          status text not null,
          status_reason text null,
          reconciled_at timestamptz null,
          reconciliation_status text null,
          attempt_count integer null,
          last_attempt_at timestamptz null,
          executed_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`drop index if exists idx_trade_executions_idempotency`;
      await sql`create unique index if not exists idx_trade_executions_idempotency on trade_executions (idempotency_key)`;
      await sql`create index if not exists idx_trade_executions_trade on trade_executions (trade_id, executed_at desc)`;
      await sql`create index if not exists idx_trade_executions_decision on trade_executions (trade_decision_id, executed_at desc)`;
      await sql`create index if not exists idx_trade_executions_status on trade_executions (status)`;

      await sql`
        create table if not exists trade_state_events (
          id text primary key,
          entity_type text not null,
          trade_id text null,
          trade_execution_id text null,
          from_status text null,
          to_status text not null,
          reason text null,
          metadata jsonb not null default '{}'::jsonb,
          recorded_at timestamptz not null default now(),
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_trade_state_events_recorded on trade_state_events (recorded_at desc)`;

      await sql`
        create table if not exists market_input_snapshots (
          id text primary key,
          pair text not null,
          captured_at timestamptz not null default now(),
          dataset_version_id text null,
          dataset_hash text null,
          feature_set_version_id text null,
          agent_version_id text null,
          artifact_uri text null,
          market_features_ref text null,
          chart_features_ref text null,
          idea_features_ref text null,
          signal_features_ref text null,
          news_features_ref text null,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_market_input_snapshots_pair_time on market_input_snapshots (pair, captured_at desc)`;

      await sql`
        create table if not exists source_policies (
          id text primary key,
          source_id text not null default '__global__',
          source_type text not null,
          enabled boolean not null default true,
          min_confidence_score double precision null,
          notes text null,
          updated_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          unique (source_type, source_id)
        )
      `;
      await sql`create index if not exists idx_source_policies_updated on source_policies (updated_at desc)`;

      await sql`
        create table if not exists data_source_status (
          id text primary key,
          source_type text not null,
          pair text not null,
          last_seen_at timestamptz null,
          freshness_threshold_seconds integer not null,
          status text not null default 'unavailable',
          updated_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          unique (pair, source_type)
        )
      `;
      await sql`create index if not exists idx_data_source_status_pair_type on data_source_status (pair, source_type)`;

      await sql`
        create table if not exists data_source_configs (
          id text primary key,
          pair text not null,
          source_type text not null,
          enabled boolean not null,
          freshness_threshold_seconds integer not null,
          updated_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          unique (pair, source_type)
        )
      `;
      await sql`create index if not exists idx_data_source_configs_pair_type on data_source_configs (pair, source_type)`;

      await sql`
        create table if not exists dataset_lineage (
          id text primary key,
          dataset_id text not null unique,
          source_run_ids jsonb not null default '[]'::jsonb,
          parent_dataset_ids jsonb not null default '[]'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;

      await sql`
        create table if not exists retry_queue (
          id text primary key,
          job_type text not null,
          payload jsonb not null default '{}'::jsonb,
          status text not null default 'pending',
          attempts integer not null default 0,
          max_attempts integer not null default 5,
          next_attempt_at timestamptz not null default now(),
          dedupe_key text null,
          last_error text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`drop index if exists idx_retry_queue_dedupe`;
      await sql`create unique index if not exists idx_retry_queue_dedupe on retry_queue (job_type, dedupe_key)`;
      await sql`create index if not exists idx_retry_queue_due on retry_queue (status, next_attempt_at asc)`;

      await sql`
        create table if not exists ops_audit_events (
          id text primary key,
          actor text not null,
          action text not null,
          resource_type text not null,
          resource_id text null,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_ops_audit_events_created on ops_audit_events (created_at desc)`;

      await sql`
        create table if not exists account_risk_state (
          id text primary key,
          status text not null,
          cooldown_until timestamptz null,
          last_triggered_at timestamptz null,
          trigger_reason text null,
          updated_at timestamptz not null default now(),
          created_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_account_risk_state_updated on account_risk_state (updated_at desc)`;

      await sql`
        create table if not exists account_risk_policies (
          id text primary key,
          name text not null,
          max_total_exposure double precision not null,
          max_instrument_exposure double precision not null,
          max_open_positions integer not null,
          max_daily_loss double precision not null,
          circuit_breaker_loss double precision not null,
          cooldown_minutes integer not null,
          max_leverage double precision null,
          active boolean not null default true,
          effective_from timestamptz not null default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_account_risk_policies_effective on account_risk_policies (effective_from desc)`;

      await sql`
        create table if not exists ops_alerts (
          id text primary key,
          category text not null,
          severity text not null,
          metric text not null,
          value double precision not null,
          threshold double precision null,
          status text not null default 'open',
          triggered_at timestamptz not null default now(),
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`create index if not exists idx_ops_alerts_triggered on ops_alerts (triggered_at desc)`;

      logInfo("Timescale RL/ops schema ready");
    })();
  }
  await schemaReadyPromise;
}

export async function insertRlOpsRow<T extends Record<string, unknown>>(table: string, payload: Record<string, unknown>) {
  await ensureTimescaleRlOpsSchema();
  const sql = getSql();
  const keys = Object.keys(payload).filter((key) => payload[key] !== undefined);
  if (keys.length === 0) {
    throw new Error(`insert ${table}: empty payload`);
  }
  const quotedTable = quoteIdent(table);
  const columns = keys.map(quoteIdent).join(", ");
  const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
  const values = keys.map((key) => payload[key]);
  const rows = (await sql.unsafe(
    `insert into ${quotedTable} (${columns}) values (${placeholders}) returning *`,
    values,
  )) as T[];
  const row = rows[0];
  if (!row) {
    throw new Error(`insert ${table}: missing row`);
  }
  return normalizeRow(row);
}

export async function upsertRlOpsRow<T extends Record<string, unknown>>(
  table: string,
  payload: Record<string, unknown>,
  onConflict: string[],
) {
  await ensureTimescaleRlOpsSchema();
  const sql = getSql();
  const keys = Object.keys(payload).filter((key) => payload[key] !== undefined);
  if (keys.length === 0) {
    throw new Error(`upsert ${table}: empty payload`);
  }
  if (onConflict.length === 0) {
    throw new Error(`upsert ${table}: onConflict is required`);
  }
  const quotedTable = quoteIdent(table);
  const columns = keys.map(quoteIdent).join(", ");
  const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
  const values = keys.map((key) => payload[key]);
  const conflictColumns = onConflict.map(quoteIdent).join(", ");
  const updatableKeys = keys.filter((key) => !onConflict.includes(key));
  const assignments =
    updatableKeys.length > 0
      ? updatableKeys.map((key) => `${quoteIdent(key)} = excluded.${quoteIdent(key)}`).join(", ")
      : `${quoteIdent(onConflict[0])} = excluded.${quoteIdent(onConflict[0])}`;

  const rows = (await sql.unsafe(
    `insert into ${quotedTable} (${columns}) values (${placeholders}) on conflict (${conflictColumns}) do update set ${assignments} returning *`,
    values,
  )) as T[];
  const row = rows[0];
  if (!row) {
    throw new Error(`upsert ${table}: missing row`);
  }
  return normalizeRow(row);
}

export async function updateRlOpsRowById<T extends Record<string, unknown>>(
  table: string,
  id: string,
  payload: Record<string, unknown>,
  options: { touchUpdatedAt?: boolean } = {},
) {
  await ensureTimescaleRlOpsSchema();
  const sql = getSql();
  const keys = Object.keys(payload).filter((key) => payload[key] !== undefined);
  if (keys.length === 0) {
    const existing = await getRlOpsRowById<T>(table, id);
    if (!existing) {
      throw new Error(`update ${table}: missing row`);
    }
    return existing;
  }
  const quotedTable = quoteIdent(table);
  const values = keys.map((key) => payload[key]);
  const assignments = keys.map((key, idx) => `${quoteIdent(key)} = $${idx + 1}`);
  if (options.touchUpdatedAt !== false && !keys.includes("updated_at")) {
    assignments.push(`"updated_at" = now()`);
  }
  values.push(id);
  const rows = (await sql.unsafe(
    `update ${quotedTable} set ${assignments.join(", ")} where id = $${values.length} returning *`,
    values,
  )) as T[];
  const row = rows[0];
  if (!row) {
    throw new Error(`update ${table}: missing row`);
  }
  return normalizeRow(row);
}

export async function getRlOpsRowById<T extends Record<string, unknown>>(table: string, id: string) {
  await ensureTimescaleRlOpsSchema();
  const sql = getSql();
  const quotedTable = quoteIdent(table);
  const rows = (await sql.unsafe(`select * from ${quotedTable} where id = $1 limit 1`, [id])) as T[];
  const row = rows[0];
  return row ? normalizeRow(row) : null;
}

export async function listRlOpsRows<T extends Record<string, unknown>>(
  table: string,
  options: {
    filters?: Filter[];
    orderBy?: string;
    direction?: Direction;
    limit?: number;
    offset?: number;
  } = {},
) {
  await ensureTimescaleRlOpsSchema();
  const sql = getSql();
  const quotedTable = quoteIdent(table);
  const filters = options.filters ?? [];
  const params: unknown[] = [];
  const where =
    filters.length === 0
      ? ""
      : ` where ${filters
          .map((filter) => {
            const op = filter.op ?? "eq";
            const field = quoteIdent(filter.field);
            if (op === "in") {
              const values = Array.isArray(filter.value) ? filter.value : [filter.value];
              if (values.length === 0) {
                return "false";
              }
              const placeholders = values.map((value) => {
                params.push(value);
                return `$${params.length}`;
              });
              return `${field} in (${placeholders.join(", ")})`;
            }
            if (op === "gte") {
              params.push(filter.value);
              return `${field} >= $${params.length}`;
            }
            if (op === "lte") {
              params.push(filter.value);
              return `${field} <= $${params.length}`;
            }
            if (op === "is") {
              if (filter.value === null || filter.value === undefined) {
                return `${field} is null`;
              }
              params.push(filter.value);
              return `${field} is not distinct from $${params.length}`;
            }
            params.push(filter.value);
            return `${field} = $${params.length}`;
          })
          .join(" and ")}`;
  const orderBy = options.orderBy ? ` order by ${quoteIdent(options.orderBy)} ${options.direction === "asc" ? "asc" : "desc"}` : "";
  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? ` limit ${Math.max(1, Math.min(Math.trunc(options.limit), 10000))}`
      : "";
  const offset =
    typeof options.offset === "number" && options.offset >= 0 ? ` offset ${Math.max(0, Math.trunc(options.offset))}` : "";
  const rows = (await sql.unsafe(`select * from ${quotedTable}${where}${orderBy}${limit}${offset}`, params)) as T[];
  return rows.map((row) => normalizeRow(row));
}

export async function getRlOpsRowByField<T extends Record<string, unknown>>(table: string, field: string, value: unknown) {
  const rows = await listRlOpsRows<T>(table, { filters: [{ field, value }], limit: 1 });
  return rows[0] ?? null;
}
