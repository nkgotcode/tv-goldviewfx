"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_PAIRS } from "../../config/marketCatalog";
import Layout from "../../components/Layout";
import RunDetailPanel from "../../components/rl-agent/RunDetailPanel";
import RiskLimitsForm from "../../components/rl-agent/RiskLimitsForm";
import DatasetPanel from "../../components/rl-agent/DatasetPanel";
import GovernancePanel from "../../components/rl-agent/GovernancePanel";
import DriftAlertsPanel from "../../components/rl-agent/DriftAlertsPanel";
import FeatureInputsPanel from "../../components/rl-agent/FeatureInputsPanel";
import {
  fetchAgentStatus,
  listAgentRuns,
  listRiskLimitSets,
  pauseAgentRun,
  resumeAgentRun,
  startAgentRun,
  stopAgentRun,
  type AgentRun,
  type AgentStatus,
  type RiskLimitSet,
} from "../../services/rl_agent";
import {
  listDatasetVersions,
  listFeatureSetVersions,
  type DatasetVersion,
  type FeatureSetVersion,
} from "../../services/datasets";

export default function RlAgentPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [riskLimits, setRiskLimits] = useState<RiskLimitSet[]>([]);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [featureSets, setFeatureSets] = useState<FeatureSetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pair, setPair] = useState<string>(ALL_PAIRS[0] ?? "XAUTUSDT");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [learningWindow, setLearningWindow] = useState("30");
  const [riskLimitId, setRiskLimitId] = useState<string>("");
  const [featureSetId, setFeatureSetId] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentStatus, agentRuns, limits, datasetVersions, featureSetVersions] = await Promise.all([
        fetchAgentStatus(),
        listAgentRuns(),
        listRiskLimitSets(),
        listDatasetVersions(),
        listFeatureSetVersions(),
      ]);
      setStatus(agentStatus);
      setRuns(agentRuns);
      setRiskLimits(limits);
      setDatasets(datasetVersions);
      setFeatureSets(featureSetVersions);
      const firstRiskLimit = limits[0];
      if (!riskLimitId && firstRiskLimit) {
        setRiskLimitId(firstRiskLimit.id);
      }
      const firstFeatureSet = featureSetVersions[0];
      if (!featureSetId && firstFeatureSet) {
        setFeatureSetId(firstFeatureSet.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RL agent data.");
    } finally {
      setLoading(false);
    }
  }, [riskLimitId, featureSetId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeRun = status?.currentRun ?? null;
  const activeVersion = status?.activeVersion ?? null;
  const activeRiskLimit = useMemo(
    () => riskLimits.find((limit) => limit.id === activeRun?.risk_limit_set_id) ?? null,
    [riskLimits, activeRun],
  );
  const gateTone =
    status?.promotionGateStatus === "pass"
      ? "status-ok"
      : status?.promotionGateStatus === "fail"
        ? "status-bad"
        : "status-muted";

  const handleStart = async () => {
    if (!riskLimitId) {
      setError("Select a risk limit set before starting a run.");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await startAgentRun("gold-rl-agent", {
        mode,
        pair,
        riskLimitSetId: riskLimitId,
        learningEnabled,
        learningWindowMinutes: Number(learningWindow),
        featureSetVersionId: featureSetId || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await pauseAgentRun();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await resumeAgentRun();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume run.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await stopAgentRun();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop run.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Layout>
      <section className="hero">
        <h1>RL Trading Command</h1>
        <p>
          Launch, pause, and audit the learning agent across configured perpetual pairs. Track
          learning windows, active model versions, and risk compliance in real time.
        </p>
      </section>

      {error ? <div className="empty">{error}</div> : null}

      <section className="summary-grid">
        <div className="summary-card" data-tone="ember">
          <span>Run Status</span>
          <strong>{activeRun?.status ?? "idle"}</strong>
          <div className="inline-muted">{activeRun?.mode ?? "paper"} mode</div>
        </div>
        <div className="summary-card" data-tone="teal">
          <span>Promotion Gate</span>
          <strong>{status?.promotionGateStatus ?? "unknown"}</strong>
          <div className="inline-muted">
            <span className={`status-pill ${gateTone}`}>Gate status</span>
          </div>
        </div>
        <div className="summary-card" data-tone="slate">
          <span>Active Version</span>
          <strong>{activeVersion?.name ?? activeVersion?.id ?? "—"}</strong>
          <div className="inline-muted">{activeRun?.pair ?? "XAUTUSDT"}</div>
        </div>
        <div className="summary-card" data-tone="clay">
          <span>Kill Switch</span>
          <strong>{status?.killSwitchEnabled ? "Armed" : "Standby"}</strong>
          <div className="inline-muted">Safety latch</div>
        </div>
      </section>

      <section className="rl-grid">
        <div className="table-card">
          <h3>Run Controls</h3>
          <p>Configure the live session, align risk limits, and deploy the latest model.</p>
          <div className="form-grid">
            <label>
              Pair
              <select value={pair} onChange={(event) => setPair(event.target.value as typeof pair)}>
                {ALL_PAIRS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label>
              Risk Limits
              <select value={riskLimitId} onChange={(event) => setRiskLimitId(event.target.value)}>
                {riskLimits.map((limit) => (
                  <option key={limit.id} value={limit.id}>
                    {limit.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feature Set
              <select value={featureSetId} onChange={(event) => setFeatureSetId(event.target.value)}>
                {featureSets.map((featureSet) => (
                  <option key={featureSet.id} value={featureSet.id}>
                    {featureSet.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Learning Window (min)
              <input
                type="number"
                value={learningWindow}
                onChange={(event) => setLearningWindow(event.target.value)}
              />
            </label>
            <label className="toggle-row">
              <span>Learning Enabled</span>
              <input
                type="checkbox"
                checked={learningEnabled}
                onChange={(event) => setLearningEnabled(event.target.checked)}
              />
            </label>
          </div>
          <div className="action-row">
            <button type="button" onClick={handleStart} disabled={actionLoading || loading}>
              Start Run
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handlePause}
              disabled={actionLoading || activeRun?.status !== "running"}
            >
              Pause
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleResume}
              disabled={actionLoading || activeRun?.status !== "paused"}
            >
              Resume
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleStop}
              disabled={actionLoading || !activeRun}
            >
              Stop
            </button>
          </div>
        </div>

        <div className="table-card">
          <h3>Current Run</h3>
          <p>Live snapshot of the deployed model, risk guardrails, and session status.</p>
          {loading ? (
            <div className="empty">Loading current run…</div>
          ) : (
            <RunDetailPanel run={activeRun} version={activeVersion} riskLimit={activeRiskLimit} />
          )}
        </div>
        <DatasetPanel datasets={datasets} featureSets={featureSets} />
      </section>

      <section className="rl-grid">
        <GovernancePanel onRefresh={refresh} />
        <DriftAlertsPanel />
      </section>

      <FeatureInputsPanel
        featureSets={featureSets}
        onCreated={(version) => {
          setFeatureSets((prev) => [version, ...prev]);
          setFeatureSetId(version.id);
        }}
      />

      <section className="table-card">
        <h3>Risk Limit Sets</h3>
        <p>Create and manage exposure boundaries before enabling live trading.</p>
        <RiskLimitsForm
          onCreated={(limit) => {
            setRiskLimits((prev) => [limit, ...prev]);
            setRiskLimitId(limit.id);
          }}
        />
      </section>

      <section className="table-card">
        <h3>Run History</h3>
        <p>Track recent sessions and learning cadence for audit readiness.</p>
        {loading ? (
          <div className="empty">Loading run history…</div>
        ) : runs.length === 0 ? (
          <div className="empty">No runs recorded yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Learning</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.pair}</td>
                  <td>{run.status}</td>
                  <td>{run.mode}</td>
                  <td>{run.learning_enabled ? "On" : "Off"}</td>
                  <td>{new Date(run.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Layout>
  );
}
