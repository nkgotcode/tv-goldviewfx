"use client";

import { useState } from "react";
import { ALL_PAIRS } from "../config/marketCatalog";
import { runIngestionAction, updateIngestionConfig } from "../services/ops";

const FEED_OPTIONS = [
  "candles",
  "orderbook",
  "trades",
  "funding",
  "open_interest",
  "mark_index",
  "ticker",
];

export default function IngestionControls() {
  const [sourceType, setSourceType] = useState("tradingview");
  const [sourceId, setSourceId] = useState("");
  const [feed, setFeed] = useState("");
  const [refreshInterval, setRefreshInterval] = useState("");
  const [backoffBase, setBackoffBase] = useState("");
  const [backoffMax, setBackoffMax] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [backfillDays, setBackfillDays] = useState("");
  const [fullContent, setFullContent] = useState(true);
  const [includeUpdates, setIncludeUpdates] = useState(false);
  const [pairs, setPairs] = useState(ALL_PAIRS.join(","));
  const [intervals, setIntervals] = useState("1m,3m,5m,15m,30m,1h,2h,4h,6h,12h,1d,3d,1w,1M");
  const [maxBatches, setMaxBatches] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const numericValue = (value: string) => (value.trim() ? Number(value) : undefined);

  const handleConfigSave = async () => {
    setMessage(null);
    const payload = {
      source_type: sourceType,
      source_id: sourceId || null,
      feed: feed || null,
      refresh_interval_seconds: numericValue(refreshInterval),
      backoff_base_seconds: numericValue(backoffBase),
      backoff_max_seconds: numericValue(backoffMax),
      rate_limit_per_minute: numericValue(rateLimit),
      backfill_max_days: numericValue(backfillDays),
    };
    await updateIngestionConfig(payload);
    setMessage("Config saved.");
  };

  const handleAction = async (action: "run" | "backfill" | "pause" | "resume") => {
    setMessage(null);
    const payload = {
      source_id: sourceId || undefined,
      feed: feed || undefined,
      full_content: fullContent,
      include_updates: includeUpdates,
      pairs: pairs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      intervals: intervals
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      max_batches: numericValue(maxBatches),
    };
    await runIngestionAction(action, sourceType, payload);
    setMessage(`${action} submitted.`);
  };

  return (
    <div className="table-card">
      <h3>Ingestion Controls</h3>
      <p>Pause, resume, and reconfigure data sync cadence in real time.</p>
      <div className="control-grid">
        <div className="control-row">
          <label htmlFor="source-type">Source</label>
          <select id="source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="tradingview">TradingView</option>
            <option value="telegram">Telegram</option>
            <option value="bingx">BingX</option>
          </select>
        </div>
        <div className="control-row">
          <label htmlFor="source-id">Source ID</label>
          <input
            id="source-id"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            placeholder="UUID for TradingView/Telegram"
          />
        </div>
        <div className="control-row">
          <label htmlFor="feed">Feed</label>
          <select id="feed" value={feed} onChange={(event) => setFeed(event.target.value)}>
            <option value="">Default</option>
            {FEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="control-row">
          <label htmlFor="refresh">Refresh (sec)</label>
          <input
            id="refresh"
            value={refreshInterval}
            onChange={(event) => setRefreshInterval(event.target.value)}
            placeholder="3600"
          />
        </div>
        <div className="control-row">
          <label htmlFor="backoff-base">Backoff Base (sec)</label>
          <input
            id="backoff-base"
            value={backoffBase}
            onChange={(event) => setBackoffBase(event.target.value)}
            placeholder="300"
          />
        </div>
        <div className="control-row">
          <label htmlFor="backoff-max">Backoff Max (sec)</label>
          <input
            id="backoff-max"
            value={backoffMax}
            onChange={(event) => setBackoffMax(event.target.value)}
            placeholder="3600"
          />
        </div>
        <div className="control-row">
          <label htmlFor="rate-limit">Rate Limit/min</label>
          <input
            id="rate-limit"
            value={rateLimit}
            onChange={(event) => setRateLimit(event.target.value)}
            placeholder="60"
          />
        </div>
        <div className="control-row">
          <label htmlFor="backfill-days">Backfill Days</label>
          <input
            id="backfill-days"
            value={backfillDays}
            onChange={(event) => setBackfillDays(event.target.value)}
            placeholder="30"
          />
        </div>
        <div className="control-row">
          <label htmlFor="pairs">Pairs</label>
          <input
            id="pairs"
            value={pairs}
            onChange={(event) => setPairs(event.target.value)}
            placeholder={ALL_PAIRS.join(",")}
          />
        </div>
        <div className="control-row">
          <label htmlFor="intervals">Intervals</label>
          <input
            id="intervals"
            value={intervals}
            onChange={(event) => setIntervals(event.target.value)}
            placeholder="1m,3m,5m,15m,30m,1h,2h,4h,6h,12h,1d,3d,1w,1M"
          />
        </div>
        <div className="control-row">
          <label htmlFor="max-batches">Max Batches</label>
          <input
            id="max-batches"
            value={maxBatches}
            onChange={(event) => setMaxBatches(event.target.value)}
            placeholder="Leave blank for full backfill"
          />
        </div>
        <div className="control-row checkbox-row">
          <label>
            <input type="checkbox" checked={fullContent} onChange={(event) => setFullContent(event.target.checked)} />
            Full content
          </label>
        </div>
        <div className="control-row checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={includeUpdates}
              onChange={(event) => setIncludeUpdates(event.target.checked)}
            />
            Include updates
          </label>
        </div>
      </div>
      <div className="control-actions">
        <button type="button" className="secondary" onClick={() => handleAction("run")}>Run</button>
        <button type="button" className="secondary" onClick={() => handleAction("backfill")}>Backfill</button>
        <button type="button" className="secondary" onClick={() => handleAction("pause")}>Pause</button>
        <button type="button" className="secondary" onClick={() => handleAction("resume")}>Resume</button>
        <button type="button" className="primary" onClick={handleConfigSave}>Save Config</button>
      </div>
      {message ? <div className="inline-muted">{message}</div> : null}
    </div>
  );
}
