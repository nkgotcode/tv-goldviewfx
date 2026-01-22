"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl, getApiHeaders } from "../services/api";

type Note = {
  id: string;
  author: string | null;
  note: string;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function IdeaNotes({ ideaId }: { ideaId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  const loadNotes = async () => {
    const response = await fetch(`${getApiBaseUrl()}/idea-notes/${ideaId}`, {
      headers: getApiHeaders(),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setNotes(payload.data ?? []);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await loadNotes();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [ideaId]);

  const addNote = async () => {
    if (!note.trim()) return;
    await fetch(`${getApiBaseUrl()}/idea-notes/${ideaId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getApiHeaders(),
      },
      body: JSON.stringify({ note }),
    });
    setNote("");
    await loadNotes();
  };

  if (loading) {
    return <div className="inline-muted">Loading notes…</div>;
  }

  return (
    <div className="panel">
      <h5>Notes</h5>
      <div className="notes-list">
        {notes.length === 0 ? <div className="inline-muted">No notes yet.</div> : null}
        {notes.map((item) => (
          <div key={item.id} className="note-item">
            <div className="note-meta">
              <span>{item.author ?? "system"}</span>
              <span>{formatDate(item.created_at)}</span>
            </div>
            <p>{item.note}</p>
          </div>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add a triage note"
      />
      <button type="button" className="secondary" onClick={addNote}>Add Note</button>
    </div>
  );
}
