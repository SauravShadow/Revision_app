'use client';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import type { TopicRevisionRank } from '@/lib/insights/rankings';

// A ranked horizontal bar chart of topics. Bar length is proportional to the
// revision count relative to the busiest topic in the set.
export function RankBars({
  title,
  rows,
  data,
  color = 'var(--accent)',
}: {
  title: string;
  rows: TopicRevisionRank[];
  data: AppData;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="glass rounded-xl p-4">
      <div className="tblabel mb-3">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">Nothing yet.</p>
      ) : (
        <div className="grid gap-3 [&>*]:min-w-0">
          {rows.map((r) => {
            const subject = data.subjects[r.subjectId];
            const chapter = data.chapters[r.chapterId];
            return (
              <Link key={r.topicId} href={`/topic/${r.topicId}`} className="touch-target group block min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  {/* min-w-0: without it the flex item can't shrink under its
                      text, so truncate never engages and a long topic title
                      widens the whole page on phones. */}
                  <span className="min-w-0 truncate text-sm text-ink transition group-hover:text-accent">{r.title}</span>
                  <span className="bp-figure shrink-0 text-xs text-ink-dim">{r.count}&times;</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ground-deep ring-1 ring-inset ring-line">
                  <div
                    className="bp-grow h-full rounded-full"
                    style={{ width: `${(r.count / max) * 100}%`, background: color }}
                  />
                </div>
                <div className="mt-1 truncate text-[11px] text-ink-faint">
                  {subject?.name}
                  {chapter ? ` · ${chapter.name}` : ''}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
