"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl, getApiHeaders } from "../services/api";

type ReviewPayload = {
  review_status: "new" | "triaged" | "approved" | "rejected";
  reviewed_by?: string;
};

export default function IdeaReviewPanel({ ideaId }: { ideaId: string }) {
  const [status, setStatus] = useState<ReviewPayload["review_status"]>("new");
  const [reviewer, setReviewer] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/idea-reviews/${ideaId}`, {
          headers: getApiHeaders(),
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (mounted && payload?.review_status) {
          setStatus(payload.review_status);
          setReviewer(payload.reviewed_by ?? "");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [ideaId]);

  const save = async () => {
    setMessage(null);
    const response = await fetch(`${getApiBaseUrl()}/idea-reviews/${ideaId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...getApiHeaders(),
      },
      body: JSON.stringify({ review_status: status, reviewed_by: reviewer || undefined }),
    });
    if (response.ok) {
      setMessage("Review status saved.");
    } else {
      setMessage("Failed to save review status.");
    }
  };

  if (loading) {
    return <div className="inline-muted">Loading review status…</div>;
  }

  return (
    <div className="panel">
      <h5>Review Status</h5>
      <div className="control-row">
        <label htmlFor="review-status">Status</label>
        <select id="review-status" value={status} onChange={(event) => setStatus(event.target.value as ReviewPayload["review_status"])}>
          <option value="new">New</option>
          <option value="triaged">Triaged</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="control-row">
        <label htmlFor="reviewer">Reviewer</label>
        <input id="reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
      </div>
      <button type="button" className="secondary" onClick={save}>Save Review</button>
      {message ? <div className="inline-muted">{message}</div> : null}
    </div>
  );
}
