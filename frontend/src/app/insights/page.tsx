"use client";

import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import MarketKlinePanel from "../../components/MarketKlinePanel";
import SourceEfficacyPanel from "../../components/SourceEfficacyPanel";
import SentimentPnlChart from "../../components/SentimentPnlChart";
import TopicTrendsPanel from "../../components/TopicTrendsPanel";
import TradingAnalyticsPanel from "../../components/TradingAnalyticsPanel";
import RecentSignalsPanel from "../../components/RecentSignalsPanel";
import RecentTradesPanel from "../../components/RecentTradesPanel";

export default function InsightsPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Signal Insights</span>
          <h1>Signal efficacy + market response</h1>
          <p>Track source performance, sentiment impact, and topic drift.</p>
          <HeroActions />
        </div>
      </section>

      <section className="chart-grid">
        <MarketKlinePanel
          title="Instrument tape"
          description="Candles with trade annotations for the selected window."
          defaultMode="live"
          showModeToggle
          tone="teal"
        />
        <MarketKlinePanel
          title="Backtest tape"
          description="Paper-mode trades mapped onto the same market window."
          defaultMode="paper"
          showModeToggle={false}
          tone="clay"
        />
      </section>

      <section className="insights-grid">
        <TradingAnalyticsPanel />
        <SourceEfficacyPanel />
        <SentimentPnlChart />
        <TopicTrendsPanel />
      </section>

      <section className="pulse-grid">
        <RecentSignalsPanel />
        <RecentTradesPanel />
      </section>
    </Layout>
  );
}
