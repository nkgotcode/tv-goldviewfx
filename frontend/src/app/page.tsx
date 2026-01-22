"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustom, useList } from "@refinedev/core";
import Layout from "../components/Layout";
import IdeaTable from "../components/IdeaTable";
import TradeTable from "../components/TradeTable";
import SignalTable from "../components/SignalTable";
import TelegramTable from "../components/TelegramTable";
import OperationsPanel from "../components/OperationsPanel";
import TradeControls from "../components/TradeControls";
import SourceEfficacyPanel from "../components/SourceEfficacyPanel";
import SentimentPnlChart from "../components/SentimentPnlChart";
import TopicTrendsPanel from "../components/TopicTrendsPanel";
import SourceGatingPanel from "../components/SourceGatingPanel";
import type { DashboardSummary, Idea, Signal, TelegramPost, Trade } from "../services/api";

function toIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export default function HomePage() {
  const [ideaQuery, setIdeaQuery] = useState("");
  const [ideaSentiment, setIdeaSentiment] = useState("");
  const [ideaStart, setIdeaStart] = useState("");
  const [ideaEnd, setIdeaEnd] = useState("");
  const [ideaDuplicates, setIdeaDuplicates] = useState(false);
  const [ideasPage, setIdeasPage] = useState(1);
  const [ideasPageSize, setIdeasPageSize] = useState(10);

  const [signalQuery, setSignalQuery] = useState("");
  const [signalSource, setSignalSource] = useState("");
  const [signalMinConfidence, setSignalMinConfidence] = useState("");
  const [signalStart, setSignalStart] = useState("");
  const [signalEnd, setSignalEnd] = useState("");
  const [signalsPage, setSignalsPage] = useState(1);
  const [signalsPageSize, setSignalsPageSize] = useState(10);

  const [tradeStatus, setTradeStatus] = useState("");
  const [tradeMode, setTradeMode] = useState("");
  const [tradeSide, setTradeSide] = useState("");
  const [tradeInstrument, setTradeInstrument] = useState("");
  const [tradeStart, setTradeStart] = useState("");
  const [tradeEnd, setTradeEnd] = useState("");
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPageSize, setTradesPageSize] = useState(10);

  const [telegramQuery, setTelegramQuery] = useState("");
  const [telegramStatus, setTelegramStatus] = useState("");
  const [telegramStart, setTelegramStart] = useState("");
  const [telegramEnd, setTelegramEnd] = useState("");
  const [telegramDuplicates, setTelegramDuplicates] = useState(false);
  const [telegramPage, setTelegramPage] = useState(1);
  const [telegramPageSize, setTelegramPageSize] = useState(10);

  const clearFilters = () => {
    setIdeaQuery("");
    setIdeaSentiment("");
    setIdeaStart("");
    setIdeaEnd("");
    setIdeaDuplicates(false);
    setIdeasPage(1);
    setSignalQuery("");
    setSignalSource("");
    setSignalMinConfidence("");
    setSignalStart("");
    setSignalEnd("");
    setSignalsPage(1);
    setTradeStatus("");
    setTradeMode("");
    setTradeSide("");
    setTradeInstrument("");
    setTradeStart("");
    setTradeEnd("");
    setTradesPage(1);
    setTelegramQuery("");
    setTelegramStatus("");
    setTelegramStart("");
    setTelegramEnd("");
    setTelegramDuplicates(false);
    setTelegramPage(1);
  };

  const ideaFilters = useMemo(() => {
    return [
      { field: "q", operator: "eq", value: ideaQuery || undefined },
      { field: "sentiment", operator: "eq", value: ideaSentiment || undefined },
      { field: "start", operator: "eq", value: toIso(ideaStart) },
      { field: "end", operator: "eq", value: toIso(ideaEnd) },
      { field: "include_duplicates", operator: "eq", value: ideaDuplicates ? "true" : undefined },
    ];
  }, [ideaQuery, ideaSentiment, ideaStart, ideaEnd, ideaDuplicates]);

  useEffect(() => {
    setIdeasPage(1);
  }, [ideaQuery, ideaSentiment, ideaStart, ideaEnd, ideaDuplicates]);

  const signalFilters = useMemo(() => {
    return [
      { field: "q", operator: "eq", value: signalQuery || undefined },
      { field: "source", operator: "eq", value: signalSource || undefined },
      { field: "min_confidence", operator: "eq", value: signalMinConfidence || undefined },
      { field: "start", operator: "eq", value: toIso(signalStart) },
      { field: "end", operator: "eq", value: toIso(signalEnd) },
    ];
  }, [signalQuery, signalSource, signalMinConfidence, signalStart, signalEnd]);

  useEffect(() => {
    setSignalsPage(1);
  }, [signalQuery, signalSource, signalMinConfidence, signalStart, signalEnd]);

  const tradeFilters = useMemo(() => {
    return [
      { field: "status", operator: "eq", value: tradeStatus || undefined },
      { field: "mode", operator: "eq", value: tradeMode || undefined },
      { field: "side", operator: "eq", value: tradeSide || undefined },
      { field: "instrument", operator: "eq", value: tradeInstrument || undefined },
      { field: "start", operator: "eq", value: toIso(tradeStart) },
      { field: "end", operator: "eq", value: toIso(tradeEnd) },
    ];
  }, [tradeStatus, tradeMode, tradeSide, tradeInstrument, tradeStart, tradeEnd]);

  useEffect(() => {
    setTradesPage(1);
  }, [tradeStatus, tradeMode, tradeSide, tradeInstrument, tradeStart, tradeEnd]);

  const telegramFilters = useMemo(() => {
    return [
      { field: "q", operator: "eq", value: telegramQuery || undefined },
      { field: "status", operator: "eq", value: telegramStatus || undefined },
      { field: "start", operator: "eq", value: toIso(telegramStart) },
      { field: "end", operator: "eq", value: toIso(telegramEnd) },
      { field: "include_duplicates", operator: "eq", value: telegramDuplicates ? "true" : undefined },
    ];
  }, [telegramQuery, telegramStatus, telegramStart, telegramEnd, telegramDuplicates]);

  useEffect(() => {
    setTelegramPage(1);
  }, [telegramQuery, telegramStatus, telegramStart, telegramEnd, telegramDuplicates]);

  const { result: summaryResult, query: summaryQuery } = useCustom<DashboardSummary>({
    url: "/dashboard/summary",
    method: "get",
  });

  const { result: ideasResult, query: ideasQuery } = useList<Idea>({
    resource: "ideas",
    filters: ideaFilters,
    pagination: { currentPage: ideasPage, pageSize: ideasPageSize, mode: "server" },
  });

  const { result: signalsResult, query: signalsQuery } = useList<Signal>({
    resource: "signals",
    filters: signalFilters,
    pagination: { currentPage: signalsPage, pageSize: signalsPageSize, mode: "server" },
  });

  const { result: tradesResult, query: tradesQuery } = useList<Trade>({
    resource: "trades",
    filters: tradeFilters,
    pagination: { currentPage: tradesPage, pageSize: tradesPageSize, mode: "server" },
  });

  const { result: telegramResult, query: telegramListQuery } = useList<TelegramPost>({
    resource: "telegram-posts",
    filters: telegramFilters,
    pagination: { currentPage: telegramPage, pageSize: telegramPageSize, mode: "server" },
  });

  const summary = summaryResult?.data ?? summaryQuery?.data?.data ?? {
    idea_count: 0,
    signal_count: 0,
    trade_count: 0,
    last_sync_status: "unavailable",
    last_sync_at: null,
  };

  const ideas = ideasResult?.data ?? ideasQuery?.data?.data ?? [];
  const signals = signalsResult?.data ?? signalsQuery?.data?.data ?? [];
  const trades = tradesResult?.data ?? tradesQuery?.data?.data ?? [];
  const telegramPosts = telegramResult?.data ?? telegramListQuery?.data?.data ?? [];

  const ideasLoading = Boolean(ideasQuery?.isLoading);
  const signalsLoading = Boolean(signalsQuery?.isLoading);
  const tradesLoading = Boolean(tradesQuery?.isLoading);
  const telegramLoading = Boolean(telegramListQuery?.isLoading);

  const ideasTotal = ideasResult?.total ?? ideasQuery?.data?.total ?? ideas.length;
  const signalsTotal = signalsResult?.total ?? signalsQuery?.data?.total ?? signals.length;
  const tradesTotal = tradesResult?.total ?? tradesQuery?.data?.total ?? trades.length;
  const telegramTotal = telegramResult?.total ?? telegramListQuery?.data?.total ?? telegramPosts.length;

  return (
    <Layout>
      <section className="hero">
        <h1>Goldviewfx Signal Command</h1>
        <p>
          Monitor TradingView ideas, Telegram intelligence, and execution quality
          in a single production-grade cockpit. Use the filters to zero in on
          sentiment shifts, confidence bands, and trade outcomes.
        </p>
      </section>

      <section className="summary-grid">
        <div className="summary-card">
          <span>Ideas</span>
          <strong>{summary.idea_count}</strong>
          <div className="inline-muted">TradingView updates</div>
        </div>
        <div className="summary-card">
          <span>Signals</span>
          <strong>{summary.signal_count}</strong>
          <div className="inline-muted">Enriched + Telegram</div>
        </div>
        <div className="summary-card">
          <span>Trades</span>
          <strong>{summary.trade_count}</strong>
          <div className="inline-muted">Paper + live pipelines</div>
        </div>
        <div className="summary-card">
          <span>Last Sync</span>
          <strong>{summary.last_sync_status ?? "unknown"}</strong>
          <div className="inline-muted">{summary.last_sync_at ?? "not recorded"}</div>
        </div>
      </section>

      <section className="ops-grid">
        <TradeControls />
        <SourceGatingPanel />
      </section>

      <OperationsPanel />

      <section className="insights-grid">
        <SourceEfficacyPanel />
        <SentimentPnlChart />
        <TopicTrendsPanel />
      </section>

      <section className="dashboard-grid">
        <aside className="filters">
          <div className="filter-group">
            <h4>Ideas</h4>
            <div className="filter-row">
              <label htmlFor="idea-query">Keyword</label>
              <input
                id="idea-query"
                value={ideaQuery}
                onChange={(event) => setIdeaQuery(event.target.value)}
                placeholder="Search titles or content"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="idea-sentiment">Sentiment</label>
              <select
                id="idea-sentiment"
                value={ideaSentiment}
                onChange={(event) => setIdeaSentiment(event.target.value)}
              >
                <option value="">All</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="idea-start">From</label>
              <input
                id="idea-start"
                type="datetime-local"
                value={ideaStart}
                onChange={(event) => setIdeaStart(event.target.value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="idea-end">To</label>
              <input
                id="idea-end"
                type="datetime-local"
                value={ideaEnd}
                onChange={(event) => setIdeaEnd(event.target.value)}
              />
            </div>
            <label className="inline-muted">
              <input
                type="checkbox"
                checked={ideaDuplicates}
                onChange={(event) => setIdeaDuplicates(event.target.checked)}
              />{" "}
              Include duplicates
            </label>
          </div>

          <div className="filter-group">
            <h4>Signals</h4>
            <div className="filter-row">
              <label htmlFor="signal-query">Keyword</label>
              <input
                id="signal-query"
                value={signalQuery}
                onChange={(event) => setSignalQuery(event.target.value)}
                placeholder="Search summaries"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-source">Source</label>
              <select
                id="signal-source"
                value={signalSource}
                onChange={(event) => setSignalSource(event.target.value)}
              >
                <option value="">All</option>
                <option value="tradingview">TradingView</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="signal-confidence">Min confidence</label>
              <input
                id="signal-confidence"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={signalMinConfidence}
                onChange={(event) => setSignalMinConfidence(event.target.value)}
                placeholder="0.0 - 1.0"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-start">From</label>
              <input
                id="signal-start"
                type="datetime-local"
                value={signalStart}
                onChange={(event) => setSignalStart(event.target.value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-end">To</label>
              <input
                id="signal-end"
                type="datetime-local"
                value={signalEnd}
                onChange={(event) => setSignalEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <h4>Trades</h4>
            <div className="filter-row">
              <label htmlFor="trade-status">Status</label>
              <select
                id="trade-status"
                value={tradeStatus}
                onChange={(event) => setTradeStatus(event.target.value)}
              >
                <option value="">All</option>
                <option value="proposed">Proposed</option>
                <option value="placed">Placed</option>
                <option value="filled">Filled</option>
                <option value="cancelled">Cancelled</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="trade-mode">Mode</label>
              <select
                id="trade-mode"
                value={tradeMode}
                onChange={(event) => setTradeMode(event.target.value)}
              >
                <option value="">All</option>
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="trade-side">Side</label>
              <select
                id="trade-side"
                value={tradeSide}
                onChange={(event) => setTradeSide(event.target.value)}
              >
                <option value="">All</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="trade-instrument">Instrument</label>
              <input
                id="trade-instrument"
                value={tradeInstrument}
                onChange={(event) => setTradeInstrument(event.target.value)}
                placeholder="GOLD-USDT"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="trade-start">From</label>
              <input
                id="trade-start"
                type="datetime-local"
                value={tradeStart}
                onChange={(event) => setTradeStart(event.target.value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="trade-end">To</label>
              <input
                id="trade-end"
                type="datetime-local"
                value={tradeEnd}
                onChange={(event) => setTradeEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <h4>Telegram</h4>
            <div className="filter-row">
              <label htmlFor="telegram-query">Keyword</label>
              <input
                id="telegram-query"
                value={telegramQuery}
                onChange={(event) => setTelegramQuery(event.target.value)}
                placeholder="Search posts"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="telegram-status">Status</label>
              <select
                id="telegram-status"
                value={telegramStatus}
                onChange={(event) => setTelegramStatus(event.target.value)}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="edited">Edited</option>
                <option value="removed">Removed</option>
              </select>
            </div>
            <div className="filter-row">
              <label htmlFor="telegram-start">From</label>
              <input
                id="telegram-start"
                type="datetime-local"
                value={telegramStart}
                onChange={(event) => setTelegramStart(event.target.value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="telegram-end">To</label>
              <input
                id="telegram-end"
                type="datetime-local"
                value={telegramEnd}
                onChange={(event) => setTelegramEnd(event.target.value)}
              />
            </div>
            <label className="inline-muted">
              <input
                type="checkbox"
                checked={telegramDuplicates}
                onChange={(event) => setTelegramDuplicates(event.target.checked)}
              />{" "}
              Include duplicates
            </label>
          </div>

          <button className="secondary" type="button" onClick={clearFilters}>
            Clear all filters
          </button>
        </aside>

        <div className="section-stack">
          <IdeaTable
            ideas={ideas}
            loading={ideasLoading}
            page={ideasPage}
            pageSize={ideasPageSize}
            total={ideasTotal}
            onPageChange={setIdeasPage}
            onPageSizeChange={(value) => {
              setIdeasPageSize(value);
              setIdeasPage(1);
            }}
          />
          <SignalTable
            signals={signals}
            loading={signalsLoading}
            page={signalsPage}
            pageSize={signalsPageSize}
            total={signalsTotal}
            onPageChange={setSignalsPage}
            onPageSizeChange={(value) => {
              setSignalsPageSize(value);
              setSignalsPage(1);
            }}
          />
          <TradeTable
            trades={trades}
            loading={tradesLoading}
            page={tradesPage}
            pageSize={tradesPageSize}
            total={tradesTotal}
            onPageChange={setTradesPage}
            onPageSizeChange={(value) => {
              setTradesPageSize(value);
              setTradesPage(1);
            }}
          />
          <TelegramTable
            posts={telegramPosts}
            loading={telegramLoading}
            page={telegramPage}
            pageSize={telegramPageSize}
            total={telegramTotal}
            onPageChange={setTelegramPage}
            onPageSizeChange={(value) => {
              setTelegramPageSize(value);
              setTelegramPage(1);
            }}
          />
        </div>
      </section>
    </Layout>
  );
}
