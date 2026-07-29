'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { badgeState } from '@/lib/revision/engine';

function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bulk "revise this subject on date X": date + topic multi-select, defaulting
// to the topics that have no plan yet (Unplanned / NeverRevised).
export function PlanSubjectDialog({ subjectId, onClose }: { subjectId: string; onClose: () => void }) {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const planTopics = useStore((s) => s.planTopics);
  const [date, setDate] = useState(tomorrowISO());

  const rows = useMemo(() => {
    const subject = subjects[subjectId];
    if (!subject) return [];
    const now = Date.now();
    return subject.chapterIds
      .map((cid) => chapters[cid])
      .filter((c) => c && !c.archivedAt)
      .flatMap((c) => c.topicIds
        .map((tid) => topics[tid])
        .filter((t) => t && !t.archivedAt)
        .map((t) => {
          const state = badgeState(t, now);
          return { topic: t, chapter: c, defaultChecked: state === 'Unplanned' || state === 'NeverRevised' };
        }));
  }, [subjects, chapters, topics, subjectId]);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.defaultChecked).map((r) => r.topic.id)),
  );
  const toggle = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const confirm = () => {
    planTopics([...checked], new Date(`${date}T00:00:00`).getTime());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Plan subject revision" onClick={onClose}>
      <div className="glass flex max-h-[70vh] w-full max-w-md flex-col rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="tblabel mb-2">Plan revision · {subjects[subjectId]?.name}</div>
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-dim">
          <span className="tblabel">Revision date</span>
          <input type="date" aria-label="Revision date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-ground-deep px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" />
        </label>
        <div className="grid gap-1 overflow-y-auto">
          {rows.map(({ topic, chapter }) => (
            <label key={topic.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition hover:bg-accent-soft">
              <input type="checkbox" aria-label={topic.title} checked={checked.has(topic.id)} onChange={() => toggle(topic.id)}
                className="accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{topic.title}</span>
                <span className="block truncate text-xs text-ink-faint">{chapter.name}</span>
              </span>
            </label>
          ))}
          {rows.length === 0 && <p className="px-2.5 py-2 text-sm text-ink-faint">No active topics in this subject.</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
          <button onClick={onClose} className="dim-chip text-ink-dim transition hover:text-ink">Cancel</button>
          <button disabled={checked.size === 0} onClick={confirm}
            className="dim-chip border-accent/50 bg-accent/10 text-accent transition enabled:hover:border-accent disabled:opacity-40">
            Plan {checked.size} topic{checked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
