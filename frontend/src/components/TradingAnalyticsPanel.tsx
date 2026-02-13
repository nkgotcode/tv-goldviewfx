"use client";

import { useEffect, useState } from "react";
import { fetchTradingMetrics, fetchTradingSummary, type TradingMetrics, type TradingSummary } from "../services/ops";

export default function TradingAnalyticsPanel() {
  const [summary, setSummary] = useState<TradingSummary | null>(null);
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [summaryData, metricsData] = await Promise.all([fetchTradingSummary(), fetchTradingMetrics()]);
        if (mounted) {
          setSummary(summaryData);
          setMetrics(metricsData);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load trading analytics.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="empty">Loading trading analytics…</div>;
  }

  if (error) {
    return <div className="empty">{error}</div>;
  }

  if (!summary) {
    return <div className="empty">No trading analytics available.</div>;
  }

  const exposureEntries = Object.entries(summary.exposure_by_instrument ?? {});

  return (
    <section className="table-card">
      <h3>Trading Analytics</h3>
      <p>Live performance, exposure, and drawdown signals by instrument.</p>
      <div className="summary-grid">
        <div className="summary-card">
          <span>Net PnL</span>
          <strong>{summary.net_pnl.toFixed(2)}</strong>
        </div>
        <div className="summary-card">
          <span>Win Rate</span>
          <strong>{(summary.win_rate * 100).toFixed(1)}%</strong>
        </div>
        <div className="summary-card">
          <span>Max Drawdown</span>
          <strong>{summary.max_drawdown.toFixed(2)}</strong>
        </div>
        <div className="summary-card">
          <span>Filled Trades</span>
          <strong>{summary.filled_count}</strong>
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel">
          <h5>Exposure by instrument</h5>
          {exposureEntries.length === 0 ? (
            <div className="inline-muted">No exposure data available.</div>
          ) : (
            <div className="inline-muted">
              {exposureEntries.map(([instrument, exposure]) => `${instrument}: ${exposure}`).join(" · ")}
            </div>
          )}
        </div>
        <div className="panel">
          <h5>Avg PnL</h5>
          <div className="inline-muted">{summary.avg_pnl.toFixed(2)} per trade</div>
        </div>
      </div>
      {metrics ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>PnL</th>
                <th>Trades</th>
                <th>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {metrics.series.map((row) => (
                <tr key={row.bucket}>
                  <td>{row.bucket}</td>
                  <td>{row.pnl.toFixed(2)}</td>
                  <td>{row.trade_count}</td>
                  <td>{(row.win_rate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
