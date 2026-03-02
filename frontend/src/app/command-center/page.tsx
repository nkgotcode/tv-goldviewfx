"use client";

import Layout from "../../components/Layout";
import { CommandCenterTabs } from "../../components/command-center/CommandCenterTabs";

export default function CommandCenterPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Command Center</span>
          <h1>Data, backtests &amp; controls</h1>
          <p>
            Unified data operations, model lifecycle, paper/live execution, and risk governance.
          </p>
        </div>
      </section>
      <CommandCenterTabs />
    </Layout>
  );
}
