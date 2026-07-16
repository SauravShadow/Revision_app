'use client';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import { subjectProgress } from '@/lib/revision/progress';

// Per-subject completion meters — the same "% in good standing" the subject
// cards use, laid out as a comparative bar list.
export function SubjectCompletion({ data, now }: { data: AppData; now: number }) {
  const subjects = data.subjectOrder
    .map((id) => data.subjects[id])
    .filter((s) => s && !s.archivedAt);

  if (subjects.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4">
      <div className="tblabel mb-3">Completion by subject</div>
      <div className="grid gap-3.5">
        {subjects.map((s) => {
          const pct = subjectProgress(data, s.id, now);
          return (
            <Link key={s.id} href={`/subject/${s.id}`} className="group block">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-ink transition group-hover:text-accent">{s.name}</span>
                <span className="bp-figure shrink-0 text-xs text-ink-dim">{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ground-deep ring-1 ring-inset ring-line">
                <div
                  className="bp-grow h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 45%, var(--go)), var(--accent))',
                  }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
