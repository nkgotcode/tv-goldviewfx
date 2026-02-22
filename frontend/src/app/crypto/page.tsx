"use client";

import { CRYPTO_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import MarketKlinePanel from "../../components/MarketKlinePanel";

export default function CryptoSectionPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Crypto Section</span>
          <h1>Perpetual crypto futures command lane</h1>
          <p>
            Monitor ALGO, BTC, ETH, SOL, XRP, and BNB perpetual flows separately from gold market operations.
          </p>
          <HeroActions />
        </div>
      </section>

      <section className="chart-grid">
        <MarketKlinePanel
          title="Crypto live tape"
          description="Live-mode trade overlays across configured crypto pairs."
          pairs={CRYPTO_PAIRS}
          defaultPair={CRYPTO_PAIRS[0] ?? "BTC-USDT"}
          defaultMode="live"
          tone="ember"
        />
        <MarketKlinePanel
          title="Crypto paper tape"
          description="Paper strategy overlays for crypto validation windows."
          pairs={CRYPTO_PAIRS}
          defaultPair={CRYPTO_PAIRS[0] ?? "BTC-USDT"}
          defaultMode="paper"
          showModeToggle={false}
          tone="slate"
        />
      </section>
    </Layout>
  );
}
