'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { todayQueue } from '@/lib/revision/todayQueue';
import { RevisionBadge } from '@/components/RevisionBadge';

// "Today's queue" — the revise-now worklist at the top of home. Surfaces every
// Overdue / Due-Today topic with one-tap mark-revised (drops it from the list).
export function TodayQueue() {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const markRevised = useStore((s) => s.markTopicRevised);

  const now = Date.now();
  const data = useMemo(
    () => ({ subjects, chapters, topics }) as unknown as AppData,
    [subjects, chapters, topics],
  );
  const queue = useMemo(() => todayQueue(data, now), [data, now]);

  if (queue.length === 0) return null;

  return (
    <section aria-label="Today's revision queue" className="mb-8 overflow-hidden rounded-2xl border border-line bg-panel/30">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="tblabel text-accent">Today · Revise now</span>
        <span className="dim-chip font-mono tabular-nums text-ink-dim">{queue.length}</span>
      </header>
      <ul className="divide-y divide-line">
        {queue.map(({ topic, chapter, subject, state }) => (
          <li key={topic.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel">
            <Link href={`/topic/${topic.id}`} className="min-w-0 flex-1">
              <div className="tblabel truncate text-ink-faint">
                {subject?.name ?? '—'}{chapter ? ` · ${chapter.name}` : ''}
              </div>
              <div className="truncate text-sm font-medium text-ink">{topic.title}</div>
            </Link>
            <RevisionBadge state={state} />
            <button
              type="button"
              onClick={() => markRevised(topic.id)}
              aria-label={`Mark ${topic.title} revised`}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-dim transition hover:border-go/50 hover:bg-go/10 hover:text-go"
            >
              <Check size={14} /> <span className="hidden sm:inline">Revised</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
