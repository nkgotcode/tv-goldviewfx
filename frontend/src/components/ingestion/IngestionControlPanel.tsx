"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import type { IngestionStatus } from "../../services/ingestion";
import {
  triggerBingxBackfill,
  triggerBingxRefresh,
  triggerTelegramIngest,
  triggerTradingViewSync,
} from "../../services/ingestion";

const DEFAULT_INTERVALS = "1m,5m,15m,1h,4h,1d";

function parseCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function IngestionControlPanel({
  status,
  onUpdated,
}: {
  status: IngestionStatus | null;
  onUpdated: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tradingViewSourceId, setTradingViewSourceId] = useState("");
  const [telegramSourceId, setTelegramSourceId] = useState("");
  const [tvFullContent, setTvFullContent] = useState(false);
  const [tvIncludeUpdates, setTvIncludeUpdates] = useState(false);

  const [bingxPairs, setBingxPairs] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_PAIRS.map((pair) => [pair, true])),
  );
  const [bingxIntervals, setBingxIntervals] = useState(DEFAULT_INTERVALS);
  const [bingxMaxBatches, setBingxMaxBatches] = useState("1");

  useEffect(() => {
    if (!status) return;
    const firstTradingViewSource = status.tradingview.sources[0];
    if (!tradingViewSourceId && firstTradingViewSource) {
      setTradingViewSourceId(firstTradingViewSource.id);
    }
    const firstTelegramSource = status.telegram.sources[0];
    if (!telegramSourceId && firstTelegramSource) {
      setTelegramSourceId(firstTelegramSource.id);
    }
  }, [status, tradingViewSourceId, telegramSourceId]);

  const selectedPairs = useMemo(() => {
    const chosen = Object.entries(bingxPairs)
      .filter(([, checked]) => checked)
      .map(([pair]) => pair);
    return chosen.length > 0 ? chosen : undefined;
  }, [bingxPairs]);

  const intervals = useMemo(() => {
    const parsed = parseCsv(bingxIntervals);
    return parsed.length > 0 ? parsed : undefined;
  }, [bingxIntervals]);

  const maxBatches = useMemo(() => {
    const parsed = Number.parseInt(bingxMaxBatches, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, [bingxMaxBatches]);

  const runAction = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleTradingViewSync = () =>
    runAction(async () => {
      await triggerTradingViewSync({
        source_id: tradingViewSourceId || undefined,
        full_content: tvFullContent,
        include_updates: tvIncludeUpdates,
      });
      setMessage("TradingView sync queued.");
    });

  const handleTelegramIngest = () =>
    runAction(async () => {
      if (!telegramSourceId) {
        throw new Error("Select a Telegram source to ingest.");
      }
      await triggerTelegramIngest({ source_id: telegramSourceId });
      setMessage("Telegram ingest queued.");
    });

  const handleBingxRefresh = () =>
    runAction(async () => {
      await triggerBingxRefresh({
        pairs: selectedPairs,
        intervals,
        max_batches: maxBatches,
      });
      setMessage("BingX refresh queued.");
    });

  const handleBingxBackfill = () =>
    runAction(async () => {
      await triggerBingxBackfill({
        pairs: selectedPairs,
        intervals,
        max_batches: maxBatches,
      });
      setMessage("BingX backfill queued.");
    });

  return (
    <section className="table-card">
      <h3>Ingestion Controls</h3>
      <p>Trigger manual runs or backfills for each data source.</p>

      {error ? <div className="empty">{error}</div> : null}
      {message ? <div className="empty">{message}</div> : null}

      <div className="form-grid">
        <label>
          TradingView Source
          <select value={tradingViewSourceId} onChange={(event) => setTradingViewSourceId(event.target.value)}>
            <option value="">Default profile</option>
            {(status?.tradingview.sources ?? []).map((source) => (
              <option key={source.id} value={source.id}>
                {source.display_name ?? source.identifier}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-row">
          <span>Full content</span>
          <input type="checkbox" checked={tvFullContent} onChange={(event) => setTvFullContent(event.target.checked)} />
        </label>
        <label className="toggle-row">
          <span>Include updates</span>
          <input
            type="checkbox"
            checked={tvIncludeUpdates}
            onChange={(event) => setTvIncludeUpdates(event.target.checked)}
          />
        </label>
      </div>

      <div className="action-row">
        <button type="button" onClick={handleTradingViewSync} disabled={loading}>
          Sync TradingView
        </button>
        <button type="button" className="secondary" onClick={handleTelegramIngest} disabled={loading}>
          Ingest Telegram
        </button>
      </div>

      <div className="form-grid" style={{ marginTop: "16px" }}>
        <label>
          BingX Pairs
          <div className="action-row" style={{ marginTop: "6px" }}>
            {ALL_PAIRS.map((pair) => (
              <label key={pair} className="toggle-row">
                <span>{pair}</span>
                <input
                  type="checkbox"
                  checked={bingxPairs[pair]}
                  onChange={(event) => setBingxPairs((prev) => ({ ...prev, [pair]: event.target.checked }))}
                />
              </label>
            ))}
          </div>
        </label>
        <label>
          Intervals (CSV)
          <input value={bingxIntervals} onChange={(event) => setBingxIntervals(event.target.value)} />
        </label>
        <label>
          Max batches
          <input value={bingxMaxBatches} onChange={(event) => setBingxMaxBatches(event.target.value)} />
        </label>
      </div>

      <div className="action-row">
        <button type="button" onClick={handleBingxRefresh} disabled={loading}>
          Refresh BingX
        </button>
        <button type="button" className="secondary" onClick={handleBingxBackfill} disabled={loading}>
          Backfill BingX
        </button>
      </div>
    </section>
  );
}
