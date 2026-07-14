'use client';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Topic } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { totalRevisions, relativeLabel } from '@/lib/revision/engine';

// datetime-local wants a local-time "YYYY-MM-DDTHH:mm" string.
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RevisionHistoryPanel({ topic }: { topic: Topic }) {
  const { deleteRevision, updateRevisionTimestamp } = useStore.getState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const now = Date.now();
  const history = [...topic.revisionHistory].reverse();

  const remove = (id: string, n: number, ts: number) => {
    const d = new Date(ts);
    if (window.confirm(`Delete Revision ${n} (${d.toLocaleDateString()} ${d.toLocaleTimeString()})? The revision count and next due date will recalculate.`)) {
      deleteRevision(topic.id, id);
    }
  };

  const commitEdit = (id: string, value: string) => {
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) updateRevisionTimestamp(topic.id, id, ts);
    setEditingId(null);
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Revision History</h3>
        <span className="text-sm opacity-70">Total Revisions: {totalRevisions(topic.revisionHistory)}</span>
      </div>
      {history.length === 0 ? (
        <p className="text-sm opacity-50">Not revised yet.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((r, i) => {
            const d = new Date(r.timestamp);
            const n = history.length - i;
            return (
              <li key={r.id} className="group flex items-center justify-between gap-2 text-sm">
                <span>Revision {n}</span>
                <span className="flex items-center gap-1">
                  {editingId === r.id ? (
                    <input
                      type="datetime-local"
                      aria-label="Revision timestamp"
                      defaultValue={toLocalInputValue(r.timestamp)}
                      max={toLocalInputValue(now)}
                      autoFocus
                      onBlur={(e) => commitEdit(r.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(r.id, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="rounded bg-black/30 px-1.5 py-0.5 text-sm outline-none"
                    />
                  ) : (
                    <span className="opacity-70">{d.toLocaleDateString()} {d.toLocaleTimeString()} · {relativeLabel(r.timestamp, now)}</span>
                  )}
                  <button aria-label="Edit revision time" onClick={() => setEditingId(r.id)}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100"><Pencil size={13} /></button>
                  <button aria-label="Delete revision" onClick={() => remove(r.id, n, r.timestamp)}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-white/10 focus-visible:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
