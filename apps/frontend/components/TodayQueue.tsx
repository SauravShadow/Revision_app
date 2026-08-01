'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { todayQueue, type QueueItem } from '@/lib/revision/todayQueue';
import { PlanNextDialog } from '@/components/PlanNextDialog';

// "Today's queue" — the revise-now worklist at the bottom of home. Grouped by
// category (Overdue / Due today) and capped per group so a long backlog stays
// scannable; one-tap mark-revised drops a topic from the list.
const CAP = 6;

function QueueGroup({
  title,
  tone,
  items,
  onRevise,
}: {
  title: string;
  tone: string;
  items: QueueItem[];
  onRevise: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, CAP);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-1">
        <span className="tblabel" style={{ color: tone }}>{title}</span>
        <span className="dim-chip font-mono text-[0.6rem] text-ink-dim">{items.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map(({ topic, chapter, subject }) => (
          <li key={topic.id} className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent-soft active:bg-accent-soft">
            <Link href={`/topic/${topic.id}`} className="touch-target min-w-0 flex-1">
              <div className="tblabel truncate text-ink-faint">
                {subject?.name ?? '—'}{chapter ? ` · ${chapter.name}` : ''}
              </div>
              <div className="truncate text-sm font-medium text-ink">{topic.title}</div>
            </Link>
            <button
              type="button"
              onClick={() => onRevise(topic.id)}
              aria-label={`Mark ${topic.title} revised`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-dim transition hover:border-go/50 hover:bg-go/10 hover:text-go active:scale-95 active:border-go/50 active:bg-go/10 active:text-go md:min-h-0 md:min-w-0 md:py-1.5"
            >
              <Check size={14} /> <span className="hidden sm:inline">Revised</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > CAP && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="tblabel mt-1.5 flex min-h-11 items-center px-2 text-ink-dim transition hover:text-accent md:min-h-0"
        >
          {expanded ? 'Show less' : `Show ${items.length - CAP} more`}
        </button>
      )}
    </div>
  );
}

export function TodayQueue() {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const markRevised = useStore((s) => s.markTopicRevised);
  const [planFor, setPlanFor] = useState<string | null>(null);

  const now = Date.now();
  const data = useMemo(
    () => ({ subjects, chapters, topics }) as unknown as AppData,
    [subjects, chapters, topics],
  );
  const queue = useMemo(() => todayQueue(data, now), [data, now]);

  // Keep the plan-next dialog alive even when revising emptied the queue —
  // the last item's dialog must still be answerable.
  if (queue.length === 0) {
    return planFor ? <PlanNextDialog topicId={planFor} onClose={() => setPlanFor(null)} /> : null;
  }

  const overdue = queue.filter((i) => i.state === 'Overdue');
  const dueToday = queue.filter((i) => i.state === 'DueToday');

  return (
    <section aria-label="Today's revision queue" className="overflow-hidden rounded-2xl border border-line bg-panel/30">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="tblabel text-accent">Today · Revise now</span>
        <span className="dim-chip font-mono tabular-nums text-ink-dim">{queue.length}</span>
      </header>
      <div className="flex flex-col gap-4 p-3">
        <QueueGroup title="Overdue" tone="var(--alarm)" items={overdue} onRevise={(id) => { markRevised(id); setPlanFor(id); }} />
        <QueueGroup title="Due today" tone="var(--annotation)" items={dueToday} onRevise={(id) => { markRevised(id); setPlanFor(id); }} />
      </div>
      {planFor && <PlanNextDialog topicId={planFor} onClose={() => setPlanFor(null)} />}
    </section>
  );
}
