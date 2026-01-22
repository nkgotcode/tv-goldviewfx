import { useState } from "react";
import type { Idea } from "../services/api";
import PaginationControls from "./PaginationControls";
import IdeaReviewPanel from "./IdeaReviewPanel";
import IdeaNotes from "./IdeaNotes";
import IdeaOcrPanel from "./IdeaOcrPanel";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getSentiment(idea: Idea) {
  const enrichment = idea.enrichments?.[0];
  if (!enrichment) return "unscored";
  return `${enrichment.sentiment_label} (${enrichment.sentiment_score.toFixed(2)})`;
}

function formatValue(value: string | null | undefined) {
  if (!value) return "—";
  return value;
}

type IdeaTableProps = {
  ideas: Idea[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function IdeaTable({
  ideas,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: IdeaTableProps) {
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  return (
    <section className="table-card">
      <h3>TradingView Ideas</h3>
      <p>Canonical ideas filtered by sentiment, time, and duplication rules.</p>
      {loading ? (
        <div className="empty">Loading ideas…</div>
      ) : ideas.length === 0 ? (
        <div className="empty">No ideas match the current filters.</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Sentiment</th>
                <th>Published</th>
                <th>Dedup</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea) => (
                <tr key={idea.id}>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setSelectedIdea(idea)}
                    >
                      {idea.title}
                    </button>
                  </td>
                  <td>{getSentiment(idea)}</td>
                  <td>{formatDate(idea.published_at)}</td>
                  <td>{idea.dedup_status ?? "canonical"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
      {selectedIdea ? (
        <div className="modal-backdrop" onClick={() => setSelectedIdea(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h4>{selectedIdea.title}</h4>
              <button type="button" className="icon-button" onClick={() => setSelectedIdea(null)}>
                ✕
              </button>
            </div>
            <div className="modal-meta">
              <span>Author: {formatValue(selectedIdea.author_handle)}</span>
              <span>Published: {formatDate(selectedIdea.published_at)}</span>
              <span>Sentiment: {getSentiment(selectedIdea)}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span>Source ID</span>
                <strong className="mono">{formatValue(selectedIdea.source_id)}</strong>
              </div>
              <div>
                <span>External ID</span>
                <strong className="mono">{formatValue(selectedIdea.external_id)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{formatValue(selectedIdea.status)}</strong>
              </div>
              <div>
                <span>Dedup</span>
                <strong>{selectedIdea.dedup_status ?? "canonical"}</strong>
              </div>
              <div>
                <span>Duplicate Of</span>
                <strong className="mono">{formatValue(selectedIdea.duplicate_of_id)}</strong>
              </div>
              <div>
                <span>Content Hash</span>
                <strong className="mono">{formatValue(selectedIdea.content_hash)}</strong>
              </div>
              <div>
                <span>Ingested</span>
                <strong>{formatDate(selectedIdea.ingested_at)}</strong>
              </div>
              <div>
                <span>Updated</span>
                <strong>{formatDate(selectedIdea.updated_at)}</strong>
              </div>
              <div className="detail-grid-span">
                <span>URL</span>
                <strong className="mono">{selectedIdea.url}</strong>
              </div>
            </div>
            <div className="modal-body">
              <p className="modal-content">{selectedIdea.content || "No content available."}</p>
              <div className="panel-grid">
                <IdeaReviewPanel ideaId={selectedIdea.id} />
                <IdeaNotes ideaId={selectedIdea.id} />
                <IdeaOcrPanel ideaId={selectedIdea.id} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setSelectedIdea(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
