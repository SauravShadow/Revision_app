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
      {/* [&>*]:min-w-0 — grid items default to min-width:auto too, so the rows
          themselves must be allowed to shrink, not just the text inside them. */}
      <div className="grid gap-3.5 [&>*]:min-w-0">
        {subjects.map((s) => {
          const pct = subjectProgress(data, s.id, now);
          // Rows are 32px tall in a 14px-gap stack, so a 44px hit box grows
          // 6px each way into the gap without touching its neighbour.
          return (
            <Link key={s.id} href={`/subject/${s.id}`} className="touch-target group block">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                {/* min-w-0: truncate sets white-space:nowrap, and a flex item
                    defaults to min-width:auto — without this the span refuses to
                    shrink under a long subject name and widens the whole page
                    (the same fix RankBars already carries). */}
                <span className="min-w-0 truncate text-sm text-ink transition group-hover:text-accent">{s.name}</span>
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
