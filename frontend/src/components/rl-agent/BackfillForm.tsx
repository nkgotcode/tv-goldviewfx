"use client";

import { useState } from "react";
import type { DataSourceBackfillRequest } from "../../services/data_sources";

const PAIRS = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"] as const;
const SOURCE_TYPES = [
  "bingx_candles",
  "bingx_trades",
  "bingx_orderbook",
  "bingx_funding",
  "bingx_open_interest",
  "bingx_mark_price",
  "bingx_index_price",
  "bingx_ticker",
  "ideas",
  "signals",
] as const;

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

export default function BackfillForm({ onSubmit }: { onSubmit: (payload: DataSourceBackfillRequest) => Promise<void> }) {
  const [sourceType, setSourceType] = useState<(typeof SOURCE_TYPES)[number]>("bingx_candles");
  const [pair, setPair] = useState<(typeof PAIRS)[number]>("Gold-USDT");
  const [start, setStart] = useState(() => toInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [end, setEnd] = useState(() => toInputValue(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        sourceType,
        pair,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger backfill.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="table-card">
      <h3>Backfill Requests</h3>
      <p>Trigger targeted backfills for BingX, TradingView, or Telegram sources.</p>
      {error ? <div className="empty">{error}</div> : null}
      <div className="form-grid">
        <label>
          Source Type
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)}>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pair
          <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
            {PAIRS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start
          <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          End
          <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      <div className="action-row">
        <button type="button" onClick={handleSubmit} disabled={loading}>
          Trigger Backfill
        </button>
      </div>
    </section>
  );
}
