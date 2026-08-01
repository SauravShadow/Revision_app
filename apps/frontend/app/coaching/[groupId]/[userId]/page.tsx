'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import type { StudentDrilldown } from '@revision-app/shared';
import { fetchStudentDrilldown } from '@/lib/orgs/client';
import { Sparkline } from '@/components/insights/Sparkline';

// Mirrors RevisionBadge's colour palette (see components/RevisionBadge.tsx) —
// same redline/annotation/go semantics, but the server's raw state string is
// rendered verbatim rather than the uppercase LABELS mapping, since this
// page has no control over which state strings the drilldown API returns.
const STATE_TONE: Record<string, string> = {
  NeverRevised: 'border-line text-ink-dim',
  Overdue: 'border-alarm/50 text-alarm bg-alarm/10',
  DueToday: 'border-annotation/50 text-annotation bg-annotation/10',
  DueTomorrow: 'border-accent/50 text-accent bg-accent/10',
  RecentlyRevised: 'border-go/50 text-go bg-go/10',
  Upcoming: 'border-line text-ink-faint',
};


export default function DrilldownPage() {
  const { session, loading } = useAuth();
  const params = useParams<{ groupId: string; userId: string }>();
  const [data, setData] = useState<StudentDrilldown | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    fetchStudentDrilldown(params.groupId, params.userId).then((r) => {
      if ('error' in r) setError(r.error);
      else setData(r);
    });
  }, [session, params.groupId, params.userId]);

  if (loading || !session) return null;

  if (error) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching', href: '/coaching' }, { label: 'Student' }]} />
        <p className="mt-4 text-sm text-alarm">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching', href: '/coaching' }, { label: 'Student' }]} />
        <p className="mt-4 text-sm text-ink-dim">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching', href: '/coaching' }, { label: 'Student' }]} />
      <div className="mb-6 mt-4">
        <div className="tblabel mb-1.5">Student · Drilldown</div>
        <h1 className="bp-figure text-2xl font-semibold tracking-tight text-ink">{data.username}</h1>
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-lg border border-line bg-panel/40 px-3 py-2 text-xs text-ink-dim">
        <Lock size={13} className="shrink-0 text-ink-faint" />
        <span>Read-only · revision status only — {data.username}&apos;s notes and attachments stay private.</span>
      </div>

      <div className="grid gap-5">
        <div className="bp-rise" style={{ animationDelay: '40ms' }}>
          <Sparkline points={data.activity} label={`${data.username} revision activity (last 30 days)`} />
        </div>

        {data.subjects.map((s, i) => (
          <div key={s.id} className="bp-rise glass rounded-xl p-4" style={{ animationDelay: `${120 + i * 40}ms` }}>
            <h2 className="bp-figure mb-2 text-lg">{s.name}</h2>
            {s.chapters.map((c) => (
              <div key={c.id} className="mb-3 last:mb-0">
                <h3 className="tblabel mb-1">{c.name}</h3>
                <ul className="flex flex-col gap-1">
                  {c.topics.map((t) => (
                    <li key={t.id} className="flex items-center justify-between border-t border-line py-1.5 text-sm first:border-t-0">
                      <span className="text-ink">{t.title}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-ink-faint">{t.revisionCount}×</span>
                        <span className={`dim-chip inline-flex items-center gap-1 font-medium ${STATE_TONE[t.state] ?? 'border-line text-ink-dim'}`}>
                          <span className="h-1 w-1 rounded-full bg-current" />
                          {t.state}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}

        {data.subjects.length === 0 && (
          <div className="glass bp-ticks relative flex flex-col items-center rounded-xl px-6 py-16 text-center">
            <p className="max-w-sm text-sm text-ink-dim">No data yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
