"use client";

import { useList } from "@refinedev/core";
import type { Trade } from "../services/api";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}

export default function RecentTradesPanel() {
  const { result, query } = useList<Trade>({
    resource: "trades",
    pagination: { currentPage: 1, pageSize: 6, mode: "server" },
  });

  const trades = result?.data ?? query?.data?.data ?? [];
  const loading = Boolean(query?.isLoading);
  const total = result?.total ?? query?.data?.total ?? trades.length;

  return (
    <section className="table-card">
      <h3>Trade Pulse</h3>
      <p>Most recent executions across paper and live modes.</p>
      <div className="inline-muted">{total} trades tracked</div>
      {loading ? (
        <div className="empty">Loading latest trades...</div>
      ) : trades.length === 0 ? (
        <div className="empty">No trades available.</div>
      ) : (
        <div className="table-scroll">
          <table className="table compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Instrument</th>
                <th>Side</th>
                <th>Mode</th>
                <th>Status</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{formatDate(trade.created_at)}</td>
                  <td>{trade.instrument}</td>
                  <td>{trade.side}</td>
                  <td>{trade.mode}</td>
                  <td>{trade.status}</td>
                  <td className={trade.pnl === null ? "pnl-neutral" : trade.pnl >= 0 ? "pnl-positive" : "pnl-negative"}>
                    {formatNumber(trade.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
