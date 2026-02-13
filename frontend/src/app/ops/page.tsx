"use client";

import Layout from "../../components/Layout";
import HeroActions from "../../components/HeroActions";
import OperationsPanel from "../../components/OperationsPanel";

export default function OpsPage() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-intro">
          <span className="hero-eyebrow">Ops Telemetry</span>
          <h1>Ingestion telemetry + audit trail</h1>
          <p>Monitor scheduler health, ingestion runs, and audit events in real time.</p>
          <HeroActions />
        </div>
      </section>

      <OperationsPanel />

      <section className="module-section">
        <div className="section-head">
          <div>
            <span>Ops Playbook</span>
            <h2>Keep the pipeline alive</h2>
            <p>Escalation and recovery steps for ingestion, trade, and data quality disruptions.</p>
          </div>
        </div>
        <div className="playbook-grid">
          <article className="playbook-card" data-tone="slate">
            <strong>Ingestion Recovery</strong>
            <ul className="bullet-list">
              <li>Re-run stalled feeds from the ingestion controls.</li>
              <li>Confirm backoff timers after repeated failures.</li>
              <li>Audit parse confidence dips before resuming.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="clay">
            <strong>Audit Discipline</strong>
            <ul className="bullet-list">
              <li>Record manual runs with metadata tags.</li>
              <li>Attach source IDs for targeted remediation.</li>
              <li>Track retry counts and outcomes.</li>
            </ul>
          </article>
          <article className="playbook-card" data-tone="teal">
            <strong>Signal Integrity</strong>
            <ul className="bullet-list">
              <li>Validate coverage before enabling live trades.</li>
              <li>Scan for missing fields on recent runs.</li>
              <li>Coordinate with RL ops when gaps persist.</li>
            </ul>
          </article>
        </div>
      </section>
    </Layout>
  );
}
