"use client";

import { GOLD_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import MarketKlinePanel from "../../components/MarketKlinePanel";

export default function GoldSectionPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Gold Section</span>
          <h1>Precious-metal futures command lane</h1>
          <p>Track gold-correlated perpetual pairs and execution overlays in an isolated section.</p>
          <HeroActions />
        </div>
      </section>

      <section className="chart-grid">
        <MarketKlinePanel
          title="Gold live tape"
          description="Live-mode annotations across gold instruments."
          pairs={GOLD_PAIRS}
          defaultPair={GOLD_PAIRS[0] ?? "XAUTUSDT"}
          defaultMode="live"
          tone="teal"
        />
        <MarketKlinePanel
          title="Gold paper tape"
          description="Paper-mode fills and price context for testing."
          pairs={GOLD_PAIRS}
          defaultPair={GOLD_PAIRS[0] ?? "XAUTUSDT"}
          defaultMode="paper"
          showModeToggle={false}
          tone="clay"
        />
      </section>
    </Layout>
  );
}
