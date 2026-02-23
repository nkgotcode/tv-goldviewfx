"use client";

import { useEffect, useMemo, useState } from "react";
import { useList, type CrudFilter } from "@refinedev/core";
import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import IdeaTable from "../../components/IdeaTable";
import TradeTable from "../../components/TradeTable";
import SignalTable from "../../components/SignalTable";
import TelegramTable from "../../components/TelegramTable";
import type { Idea, Signal, TelegramPost, Trade } from "../../services/api";

function toIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function buildEqFilters(entries: Array<{ field: string; value: string | undefined }>): CrudFilter[] {
  return entries
    .filter((entry) => entry.value !== undefined && entry.value !== "")
    .map((entry) => ({
      field: entry.field,
      operator: "eq" as const,
      value: entry.value,
    }));
}

export default function LibraryPage() {
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
    return buildEqFilters([
      { field: "q", value: ideaQuery || undefined },
      { field: "sentiment", value: ideaSentiment || undefined },
      { field: "start", value: toIso(ideaStart) },
      { field: "end", value: toIso(ideaEnd) },
      { field: "include_duplicates", value: ideaDuplicates ? "true" : undefined },
    ]);
  }, [ideaQuery, ideaSentiment, ideaStart, ideaEnd, ideaDuplicates]);

  useEffect(() => {
    setIdeasPage(1);
  }, [ideaQuery, ideaSentiment, ideaStart, ideaEnd, ideaDuplicates]);

  const signalFilters = useMemo(() => {
    return buildEqFilters([
      { field: "q", value: signalQuery || undefined },
      { field: "source", value: signalSource || undefined },
      { field: "min_confidence", value: signalMinConfidence || undefined },
      { field: "start", value: toIso(signalStart) },
      { field: "end", value: toIso(signalEnd) },
    ]);
  }, [signalQuery, signalSource, signalMinConfidence, signalStart, signalEnd]);

  useEffect(() => {
    setSignalsPage(1);
  }, [signalQuery, signalSource, signalMinConfidence, signalStart, signalEnd]);

  const tradeFilters = useMemo(() => {
    return buildEqFilters([
      { field: "status", value: tradeStatus || undefined },
      { field: "mode", value: tradeMode || undefined },
      { field: "side", value: tradeSide || undefined },
      { field: "instrument", value: tradeInstrument || undefined },
      { field: "start", value: toIso(tradeStart) },
      { field: "end", value: toIso(tradeEnd) },
    ]);
  }, [tradeStatus, tradeMode, tradeSide, tradeInstrument, tradeStart, tradeEnd]);

  useEffect(() => {
    setTradesPage(1);
  }, [tradeStatus, tradeMode, tradeSide, tradeInstrument, tradeStart, tradeEnd]);

  const telegramFilters = useMemo(() => {
    return buildEqFilters([
      { field: "q", value: telegramQuery || undefined },
      { field: "status", value: telegramStatus || undefined },
      { field: "start", value: toIso(telegramStart) },
      { field: "end", value: toIso(telegramEnd) },
      { field: "include_duplicates", value: telegramDuplicates ? "true" : undefined },
    ]);
  }, [telegramQuery, telegramStatus, telegramStart, telegramEnd, telegramDuplicates]);

  useEffect(() => {
    setTelegramPage(1);
  }, [telegramQuery, telegramStatus, telegramStart, telegramEnd, telegramDuplicates]);

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
        <div className="hero-intro">
          <span className="hero-eyebrow">Signal Library</span>
          <h1>Signal Library</h1>
          <p>Filter, review, and validate the full archive by sentiment, timeframe, and source.</p>
          <HeroActions />
        </div>
      </section>

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Ideas</span>
          <strong>{ideasTotal}</strong>
          <div className="inline-muted">TradingView archive</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Signals</span>
          <strong>{signalsTotal}</strong>
          <div className="inline-muted">Signal intelligence</div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Trades</span>
          <strong>{tradesTotal}</strong>
          <div className="inline-muted">Execution history</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Telegram</span>
          <strong>{telegramTotal}</strong>
          <div className="inline-muted">Channel posts</div>
        </div>
      </section>

      <section className="table-card">
        <h3>Archive Briefing</h3>
        <p>Review the most important slices without drowning in the full data table.</p>
        <div className="panel-grid">
          <div className="panel">
            <h5>Signal density</h5>
            <div className="inline-muted">
              {signalsTotal} signals across {ideasTotal} ideas.
            </div>
          </div>
          <div className="panel">
            <h5>Execution trail</h5>
            <div className="inline-muted">
              {tradesTotal} trades recorded across paper + live runs.
            </div>
          </div>
          <div className="panel">
            <h5>Telegram coverage</h5>
            <div className="inline-muted">
              {telegramTotal} posts aligned with signals and dedup state.
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <aside className="filters">
          <div className="filters-header">
            <span>Filter Matrix</span>
            <p>Refine the live stream across every feed.</p>
          </div>
          <div className="filter-group">
            <h4>Ideas</h4>
            <div className="filter-row">
              <label htmlFor="idea-query">Keyword</label>
              <input
                id="idea-query"
                value={ideaQuery}
                onChange={(event) => setIdeaQuery((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
                placeholder="Search titles or content"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="idea-sentiment">Sentiment</label>
              <select
                id="idea-sentiment"
                value={ideaSentiment}
                onChange={(event) => setIdeaSentiment((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setIdeaStart((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="idea-end">To</label>
              <input
                id="idea-end"
                type="datetime-local"
                value={ideaEnd}
                onChange={(event) => setIdeaEnd((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <label className="inline-muted">
              <input
                type="checkbox"
                checked={ideaDuplicates}
                onChange={(event) => setIdeaDuplicates((event.currentTarget as HTMLInputElement).checked)}
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
                onChange={(event) => setSignalQuery((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
                placeholder="Search summaries"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-source">Source</label>
              <select
                id="signal-source"
                value={signalSource}
                onChange={(event) => setSignalSource((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setSignalMinConfidence((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
                placeholder="0.0 - 1.0"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-start">From</label>
              <input
                id="signal-start"
                type="datetime-local"
                value={signalStart}
                onChange={(event) => setSignalStart((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="signal-end">To</label>
              <input
                id="signal-end"
                type="datetime-local"
                value={signalEnd}
                onChange={(event) => setSignalEnd((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTradeStatus((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTradeMode((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTradeSide((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTradeInstrument((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
                placeholder="XAUTUSDT"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="trade-start">From</label>
              <input
                id="trade-start"
                type="datetime-local"
                value={tradeStart}
                onChange={(event) => setTradeStart((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="trade-end">To</label>
              <input
                id="trade-end"
                type="datetime-local"
                value={tradeEnd}
                onChange={(event) => setTradeEnd((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTelegramQuery((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
                placeholder="Search posts"
              />
            </div>
            <div className="filter-row">
              <label htmlFor="telegram-status">Status</label>
              <select
                id="telegram-status"
                value={telegramStatus}
                onChange={(event) => setTelegramStatus((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
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
                onChange={(event) => setTelegramStart((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <div className="filter-row">
              <label htmlFor="telegram-end">To</label>
              <input
                id="telegram-end"
                type="datetime-local"
                value={telegramEnd}
                onChange={(event) => setTelegramEnd((event.currentTarget as HTMLInputElement | HTMLSelectElement).value)}
              />
            </div>
            <label className="inline-muted">
              <input
                type="checkbox"
                checked={telegramDuplicates}
                onChange={(event) => setTelegramDuplicates((event.currentTarget as HTMLInputElement).checked)}
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
