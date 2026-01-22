"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl, getApiHeaders } from "../services/api";

type IdeaMedia = {
  id: string;
  media_url: string;
  ocr_status: string;
  ocr_text: string | null;
  created_at: string;
};

export default function IdeaOcrPanel({ ideaId }: { ideaId: string }) {
  const [media, setMedia] = useState<IdeaMedia[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMedia = async () => {
    const response = await fetch(`${getApiBaseUrl()}/idea-ocr/${ideaId}`, {
      headers: getApiHeaders(),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setMedia(payload.data ?? []);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await loadMedia();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [ideaId]);

  const runOcr = async () => {
    await fetch(`${getApiBaseUrl()}/idea-ocr/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getApiHeaders(),
      },
      body: JSON.stringify({ limit: 5 }),
    });
    await loadMedia();
  };

  if (loading) {
    return <div className="inline-muted">Loading OCR…</div>;
  }

  return (
    <div className="panel">
      <h5>OCR Enrichment</h5>
      {media.length === 0 ? (
        <div className="inline-muted">No chart images found.</div>
      ) : (
        <div className="ocr-list">
          {media.map((item) => (
            <div key={item.id} className="ocr-item">
              <div className="ocr-meta">
                <span>{item.ocr_status}</span>
                <span>{item.media_url}</span>
              </div>
              <p>{item.ocr_text ?? "No OCR text captured."}</p>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="secondary" onClick={runOcr}>
        Run OCR
      </button>
    </div>
  );
}
