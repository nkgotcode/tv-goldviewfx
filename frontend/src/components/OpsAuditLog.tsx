"use client";

import { useEffect, useState } from "react";
import { fetchOpsAudit, type OpsAuditEvent } from "../services/ops";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OpsAuditLog() {
  const [events, setEvents] = useState<OpsAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const payload = await fetchOpsAudit();
        if (mounted) {
          setEvents(payload.data ?? []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="table-card">
      <h3>Ops Audit Log</h3>
      <p>Every operator action is captured with metadata and timestamps.</p>
      {loading ? (
        <div className="empty">Loading audit log…</div>
      ) : events.length === 0 ? (
        <div className="empty">No audit events recorded.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{formatDate(event.created_at)}</td>
                <td>{event.actor}</td>
                <td>{event.action}</td>
                <td>{event.resource_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
