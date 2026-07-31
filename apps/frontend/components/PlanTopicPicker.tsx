'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Sheet } from '@/components/Sheet';
import { activeTopics } from '@/lib/insights/topics';

// Search-and-pick modal for planting a topic on a calendar day.
export function PlanTopicPicker({ day, onClose }: { day: number; onClose: () => void }) {
  const data = useStore();
  const planTopic = useStore((s) => s.planTopic);
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeTopics(data)
      .filter((t) => {
        if (!needle) return true;
        const chapter = data.chapters[t.chapterId];
        const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
        return `${t.title} ${chapter?.name ?? ''} ${subject?.name ?? ''}`.toLowerCase().includes(needle);
      })
      .slice(0, 30);
  }, [data, q]);
  const label = new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <Sheet label={`Plan revision on ${label}`} onClose={onClose} className="sm:max-w-md">
      <div className="tblabel mb-2">Plan revision · {label}</div>
      <input autoFocus type="text" aria-label="Search topics" placeholder="Search topics…" value={q} onChange={(e) => setQ(e.target.value)}
        className="mb-3 min-h-11 w-full rounded-lg border border-line bg-ground-deep px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent" />
      <div className="grid gap-1">
        {matches.map((t) => {
          const chapter = data.chapters[t.chapterId];
          const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
          return (
            <button key={t.id} onClick={() => { planTopic(t.id, day); onClose(); }}
              className="rounded-lg px-2.5 py-2.5 text-left transition hover:bg-accent-soft active:bg-accent-soft">
              <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
              <span className="block truncate text-xs text-ink-faint">
                {subject?.name ?? '—'}{chapter ? ` · ${chapter.name}` : ''}
                {t.plannedAt != null && ` · planned ${new Date(t.plannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
              </span>
            </button>
          );
        })}
        {matches.length === 0 && <p className="px-2.5 py-2 text-sm text-ink-faint">No matching topics.</p>}
      </div>
    </Sheet>
  );
}
