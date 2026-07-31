'use client';
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Sheet } from '@/components/Sheet';
import { startOfDay, suggestedNextDate } from '@/lib/revision/engine';

const DAY = 86_400_000;
const fmt = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Shown right after "Mark as Revised" (and reused as a schedule-anytime picker):
// quick-pick chips, the ladder's suggestion highlighted, or skip to stay unplanned.
export function PlanNextDialog({ topicId, title = 'Revised · Plan next', onClose }: {
  topicId: string; title?: string; onClose: () => void;
}) {
  const topic = useStore((s) => s.topics[topicId]);
  const planTopic = useStore((s) => s.planTopic);
  const [custom, setCustom] = useState('');
  if (!topic) return null;
  const today = startOfDay(Date.now());
  const suggested = suggestedNextDate(topic.revisionHistory);
  const chips: { label: string; ts: number; hot?: boolean }[] = [
    { label: '+1d', ts: today + DAY },
    { label: '+3d', ts: today + 3 * DAY },
    { label: '+7d', ts: today + 7 * DAY },
  ];
  if (suggested !== undefined) chips.push({ label: `Suggested · ${fmt(suggested)}`, ts: suggested, hot: true });
  const pick = (ts: number) => { planTopic(topic.id, ts); onClose(); };
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="tblabel mb-1">{title}</div>
      <div className="mb-3 text-sm font-medium text-ink">{topic.title}</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.label} onClick={() => pick(c.ts)}
            className={`dim-chip transition hover:border-accent hover:text-accent ${c.hot ? 'border-accent/50 bg-accent/10 text-accent' : 'text-ink-dim'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <input type="date" aria-label="Custom date" value={custom} onChange={(e) => setCustom(e.target.value)}
          className="min-h-11 flex-1 rounded-lg border border-line bg-ground-deep px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" />
        <button disabled={!custom} onClick={() => pick(new Date(`${custom}T00:00:00`).getTime())}
          className="dim-chip text-ink-dim transition enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40">
          Plan
        </button>
      </div>
      <button onClick={onClose} className="tblabel min-h-11 w-full text-center text-ink-faint transition hover:text-ink active:text-ink">
        Skip — leave unplanned
      </button>
    </Sheet>
  );
}
