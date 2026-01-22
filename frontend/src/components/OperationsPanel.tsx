"use client";

import { useEffect, useState } from "react";
import IngestionStatusTable from "./IngestionStatusTable";
import IngestionRunsTable from "./IngestionRunsTable";
import IngestionControls from "./IngestionControls";
import TradingAnalyticsPanel from "./TradingAnalyticsPanel";
import OpsAuditLog from "./OpsAuditLog";
import { fetchOpsIngestionRuns, fetchOpsIngestionStatus, type IngestionRun, type OpsIngestionStatusResponse } from "../services/ops";

export default function OperationsPanel() {
  const [status, setStatus] = useState<OpsIngestionStatusResponse | null>(null);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const payload = await fetchOpsIngestionStatus();
        if (mounted) setStatus(payload);
      } finally {
        if (mounted) setLoadingStatus(false);
      }
    };
    loadStatus();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadRuns = async () => {
      try {
        const payload = await fetchOpsIngestionRuns();
        if (mounted) setRuns(payload.data ?? []);
      } finally {
        if (mounted) setLoadingRuns(false);
      }
    };
    loadRuns();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="ops-panel">
      <div className="ops-grid">
        <IngestionStatusTable status={status} loading={loadingStatus} />
        <IngestionControls />
        <IngestionRunsTable runs={runs} loading={loadingRuns} />
        <TradingAnalyticsPanel />
        <OpsAuditLog />
      </div>
    </section>
  );
}
