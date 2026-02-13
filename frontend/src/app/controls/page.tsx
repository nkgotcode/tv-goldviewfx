"use client";

import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import ControlSummaryPanel from "../../components/ControlSummaryPanel";
import TradeControls from "../../components/TradeControls";
import SourceGatingPanel from "../../components/SourceGatingPanel";

export default function ControlsPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Command Controls</span>
          <h1>Execution + policy control</h1>
          <p>Switch trading modes, enforce promotion gates, and constrain sources.</p>
          <HeroActions />
        </div>
      </section>

      <section className="control-stack">
        <ControlSummaryPanel />
        <div className="ops-grid">
          <TradeControls />
          <SourceGatingPanel />
        </div>
      </section>

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Control Playbook</span>
            <h2>Execution gates, tuned</h2>
            <p>Keep every run inside guardrails with clear promotion and safety checkpoints.</p>
          </div>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card" data-tone="ember">
            <strong>Live Readiness</strong>
            <ul className="bullet-list">
              <li>Confirm kill switch status and daily loss limit.</li>
              <li>Verify allowed instruments include the target pair.</li>
              <li>Review active policies for high confidence sources.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="teal">
            <strong>Promotion Gate</strong>
            <ul className="bullet-list">
              <li>Check minimum trades and win rate thresholds.</li>
              <li>Compare net PnL and max drawdown limits.</li>
              <li>Export evaluation reports before promoting.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="slate">
            <strong>Emergency Actions</strong>
            <ul className="bullet-list">
              <li>Disable agent when data sources stall.</li>
              <li>Pause live mode before adjusting limits.</li>
              <li>Document overrides in the ops audit log.</li>
            </ul>
          </article>
        </div>
      </section>
    </Layout>
  );
}
