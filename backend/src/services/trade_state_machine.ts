import { getTradeById, updateTradeStatus } from "../db/repositories/trades";
import {
  getTradeExecutionById,
  updateTradeExecution,
  type TradeExecutionInsert,
} from "../db/repositories/trade_executions";
import { insertTradeStateEvent } from "../db/repositories/trade_state_events";
import { recordOpsAudit } from "./ops_audit";

export type TradeStatus = "proposed" | "placed" | "partial" | "filled" | "cancelled" | "rejected";
export type ExecutionStatus = TradeExecutionInsert["status"];

const tradeTransitions: Record<TradeStatus, TradeStatus[]> = {
  proposed: ["placed", "rejected", "cancelled"],
  placed: ["partial", "filled", "cancelled", "rejected"],
  partial: ["filled", "cancelled", "rejected"],
  filled: [],
  cancelled: [],
  rejected: [],
};

const executionTransitions: Record<ExecutionStatus, ExecutionStatus[]> = {
  submitted: ["partial", "filled", "failed", "cancelled"],
  partial: ["filled", "failed", "cancelled"],
  filled: [],
  failed: [],
  cancelled: [],
};

function assertTransition<T extends string>(
  from: T,
  to: T,
  transitions: Record<T, T[]>,
  label: string,
) {
  if (from === to) {
    return;
  }
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid ${label} transition from ${from} to ${to}`);
  }
}

export async function transitionTradeStatus(
  tradeId: string,
  nextStatus: TradeStatus,
  options?: { reason?: string | null; metadata?: Record<string, unknown> },
) {
  const trade = await getTradeById(tradeId);
  assertTransition(trade.status as TradeStatus, nextStatus, tradeTransitions, "trade status");
  if (trade.status === nextStatus) {
    return trade;
  }
  const updated = await updateTradeStatus(tradeId, nextStatus);
  await insertTradeStateEvent({
    entity_type: "trade",
    trade_id: tradeId,
    from_status: trade.status,
    to_status: nextStatus,
    reason: options?.reason ?? null,
    metadata: options?.metadata ?? {},
  });
  await recordOpsAudit({
    actor: "system",
    action: "trade.status_change",
    resource_type: "trade",
    resource_id: tradeId,
    metadata: { from: trade.status, to: nextStatus, reason: options?.reason ?? null },
  });
  return updated;
}

export async function transitionExecutionStatus(
  executionId: string,
  nextStatus: ExecutionStatus,
  options?: {
    reason?: string | null;
    metadata?: Record<string, unknown>;
    patch?: Partial<TradeExecutionInsert>;
  },
) {
  const execution = await getTradeExecutionById(executionId);
  assertTransition(execution.status as ExecutionStatus, nextStatus, executionTransitions, "execution status");
  if (execution.status === nextStatus && !options?.patch) {
    return execution;
  }
  const updated = await updateTradeExecution(executionId, {
    ...options?.patch,
    status: nextStatus,
    status_reason: options?.reason ?? execution.status_reason ?? null,
  });
  await insertTradeStateEvent({
    entity_type: "execution",
    trade_id: execution.trade_id ?? null,
    trade_execution_id: executionId,
    from_status: execution.status,
    to_status: nextStatus,
    reason: options?.reason ?? null,
    metadata: options?.metadata ?? options?.patch ?? {},
  });
  await recordOpsAudit({
    actor: "system",
    action: "trade_execution.status_change",
    resource_type: "trade_execution",
    resource_id: executionId,
    metadata: { from: execution.status, to: nextStatus, reason: options?.reason ?? null },
  });
  return updated;
}
