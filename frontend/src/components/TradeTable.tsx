import { useEffect, useMemo, useState } from "react";
import { fetchTradeDetail, type Trade } from "../services/api";
import PaginationControls from "./PaginationControls";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatPnl(value: number | null | undefined) {
  if (value === null || value === undefined) return { text: "—", className: "" };
  const text = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return {
    text,
    className: value > 0 ? "pnl-positive" : value < 0 ? "pnl-negative" : "pnl-neutral",
  };
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

type TradeTableProps = {
  trades: Trade[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type TradeExecution = {
  exchange_order_id: string | null;
  status: string;
  filled_quantity: number;
  average_price: number;
  executed_at: string;
};

type TradeDetail = Trade & { executions: TradeExecution[] };

export default function TradeTable({
  trades,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: TradeTableProps) {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [tradeDetail, setTradeDetail] = useState<TradeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTrade) {
      setTradeDetail(null);
      setDetailError(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    fetchTradeDetail(selectedTrade.id)
      .then((data) => {
        if (active) {
          setTradeDetail(data);
        }
      })
      .catch((error) => {
        if (active) {
          setDetailError(error instanceof Error ? error.message : "Failed to load trade detail.");
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedTrade]);

  const executions = tradeDetail?.executions ?? [];
  const displayTrade = tradeDetail ?? selectedTrade;
  const totalFilled = useMemo(() => {
    return executions.reduce((sum, execution) => sum + (execution.filled_quantity ?? 0), 0);
  }, [executions]);

  return (
    <section className="table-card">
      <h3>Trade Execution</h3>
      <p>Audit-ready view of all proposed and executed orders.</p>
      {loading ? (
        <div className="empty">Loading trades…</div>
      ) : trades.length === 0 ? (
        <div className="empty">No trades match the current filters.</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Side</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Position</th>
                <th>Avg Fill</th>
                <th>PnL</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const pnl = formatPnl(trade.pnl);
                return (
                  <tr key={trade.id}>
                    <td>
                      <button
                        type="button"
                        className="link-button badge"
                        onClick={() => setSelectedTrade(trade)}
                      >
                        {trade.instrument}
                      </button>
                    </td>
                    <td>{trade.side}</td>
                    <td>{trade.status}</td>
                    <td>{trade.mode}</td>
                    <td>{formatNumber(trade.position_size ?? trade.quantity)}</td>
                    <td>{formatNumber(trade.avg_fill_price)}</td>
                    <td className={pnl.className}>{pnl.text}</td>
                    <td>{formatDate(trade.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
      {selectedTrade && displayTrade ? (
        <div className="modal-backdrop" onClick={() => setSelectedTrade(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h4>Trade: {displayTrade.instrument}</h4>
              <button type="button" className="icon-button" onClick={() => setSelectedTrade(null)}>
                ✕
              </button>
            </div>
            <div className="modal-meta">
              <span>Side: {displayTrade.side}</span>
              <span>Status: {displayTrade.status}</span>
              <span>Mode: {displayTrade.mode}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span>Position Size</span>
                <strong>{formatNumber(displayTrade.position_size ?? displayTrade.quantity)}</strong>
              </div>
              <div>
                <span>Average Fill</span>
                <strong>{formatNumber(displayTrade.avg_fill_price)}</strong>
              </div>
              <div>
                <span>PnL</span>
                <strong className={formatPnl(displayTrade.pnl).className}>
                  {formatPnl(displayTrade.pnl).text}
                </strong>
              </div>
              <div>
                <span>PnL %</span>
                <strong className={formatPnl(displayTrade.pnl_pct).className}>
                  {formatPercent(displayTrade.pnl_pct)}
                </strong>
              </div>
              <div>
                <span>Take Profit</span>
                <strong className="tp-value">{formatNumber(displayTrade.tp_price)}</strong>
              </div>
              <div>
                <span>Stop Loss</span>
                <strong className="sl-value">{formatNumber(displayTrade.sl_price)}</strong>
              </div>
              <div>
                <span>Liquidation</span>
                <strong>{formatNumber(displayTrade.liquidation_price)}</strong>
              </div>
              <div>
                <span>Leverage</span>
                <strong>{formatNumber(displayTrade.leverage)}</strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{displayTrade.margin_type ?? "—"}</strong>
              </div>
              <div>
                <span>Client Order</span>
                <strong className="mono">{displayTrade.client_order_id ?? "—"}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{formatDate(displayTrade.created_at)}</strong>
              </div>
            </div>
            <div className="modal-body">
              <h5>Execution Fills</h5>
              {detailLoading ? (
                <div className="empty">Loading executions…</div>
              ) : detailError ? (
                <div className="empty">{detailError}</div>
              ) : executions.length === 0 ? (
                <div className="empty">No executions recorded yet.</div>
              ) : (
                <>
                  <div className="inline-muted">Total filled: {formatNumber(totalFilled)}</div>
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Executed</th>
                        <th>Status</th>
                        <th>Filled Qty</th>
                        <th>Avg Price</th>
                        <th>Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executions.map((execution) => (
                        <tr key={`${execution.exchange_order_id ?? "execution"}-${execution.executed_at}`}>
                          <td>{formatDate(execution.executed_at)}</td>
                          <td>{execution.status}</td>
                          <td>{formatNumber(execution.filled_quantity)}</td>
                          <td>{formatNumber(execution.average_price)}</td>
                          <td className="mono">{execution.exchange_order_id ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setSelectedTrade(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
