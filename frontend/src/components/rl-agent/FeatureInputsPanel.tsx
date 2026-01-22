"use client";

import { useState } from "react";
import { createFeatureSetVersion, type FeatureSetVersion } from "../../services/datasets";

export default function FeatureInputsPanel({
  featureSets,
  onCreated,
}: {
  featureSets: FeatureSetVersion[];
  onCreated: (version: FeatureSetVersion) => void;
}) {
  const [includeNews, setIncludeNews] = useState(true);
  const [includeOcr, setIncludeOcr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const version = await createFeatureSetVersion({ includeNews, includeOcr });
      onCreated(version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create feature set.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="table-card">
      <h3>Feature Inputs</h3>
      <p>Toggle news sentiment and OCR text inputs for the active feature set.</p>
      {error ? <div className="empty">{error}</div> : null}
      <div className="form-grid">
        <label className="toggle-row">
          <span>News Sentiment</span>
          <input
            type="checkbox"
            checked={includeNews}
            onChange={(event) => setIncludeNews(event.target.checked)}
          />
        </label>
        <label className="toggle-row">
          <span>OCR Text</span>
          <input
            type="checkbox"
            checked={includeOcr}
            onChange={(event) => setIncludeOcr(event.target.checked)}
          />
        </label>
      </div>
      <div className="action-row">
        <button type="button" onClick={handleCreate} disabled={saving}>
          Create Feature Set
        </button>
      </div>
      <div className="detail-grid">
        <div>
          <span>Available Sets</span>
          <strong>{featureSets.length}</strong>
        </div>
        <div>
          <span>Latest Label</span>
          <strong>{featureSets[0]?.label ?? "—"}</strong>
        </div>
      </div>
    </section>
  );
}
