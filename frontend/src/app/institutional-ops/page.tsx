"use client";

import Layout from "../../components/Layout";
import { InstitutionalOpsTabs } from "../../components/institutional-ops/InstitutionalOpsTabs";

export default function InstitutionalOpsPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Institutional Ops</span>
          <h1>Data, backtests &amp; controls</h1>
          <p>
            Data lake, backtests, RL training, model registry, paper/live trading, risk &amp; controls.
          </p>
        </div>
      </section>
      <InstitutionalOpsTabs />
    </Layout>
  );
}
