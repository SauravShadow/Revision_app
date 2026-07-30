'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { StatTile } from '@/components/insights/StatTile';
import { FilterChips } from '@/components/filters/FilterChips';
import type { CohortStudentRow, CohortSummary, MembershipSummary } from '@revision-app/shared';
import { fetchMemberships, listGroups, fetchCohortSummary, fetchCohortStudents } from '@/lib/orgs/client';

interface GroupOption { groupId: string; label: string }

// Heads coach the group on their membership row; admins coach every group in
// their org, which takes one listGroups call per admin org to enumerate.
async function resolveGroupOptions(memberships: MembershipSummary[]): Promise<GroupOption[]> {
  const options = new Map<string, GroupOption>();
  for (const m of memberships) {
    if (m.role === 'head' && m.groupId) {
      options.set(m.groupId, { groupId: m.groupId, label: `${m.orgName} / ${m.groupName}` });
    }
    if (m.role === 'admin' && m.groupId === null) {
      const r = await listGroups(m.orgId);
      if (!('error' in r)) {
        for (const g of r.groups) options.set(g.id, { groupId: g.id, label: `${m.orgName} / ${g.name}` });
      }
    }
  }
  return [...options.values()];
}

function ActivityBars({ activity }: { activity: { day: string; revisions: number }[] }) {
  const max = Math.max(1, ...activity.map((a) => a.revisions));
  return (
    <div className="glass bp-ticks relative rounded-xl p-4">
      <div className="tblabel mb-2">Revision activity (last 30 days)</div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Cohort revision activity">
        {activity.map((a) => (
          <div
            key={a.day}
            title={`${a.day}: ${a.revisions}`}
            className="w-2 rounded-t bg-accent"
            style={{ height: `${Math.round((a.revisions / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CoachingPage() {
  const { session, loading } = useAuth();
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [summary, setSummary] = useState<CohortSummary | null>(null);
  const [students, setStudents] = useState<CohortStudentRow[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'completion' | 'overdue'>('completion');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    fetchMemberships().then(async (r) => {
      const options = 'error' in r ? [] : await resolveGroupOptions(r.memberships);
      setGroups(options);
      if (options[0]) setSelected(options[0].groupId);
    });
  }, [session]);

  useEffect(() => {
    if (!selected) return;
    setError('');
    fetchCohortSummary(selected).then((r) => ('error' in r ? setError(r.error) : setSummary(r)));
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    fetchCohortStudents(selected, page, sort).then((r) => {
      if (!('error' in r)) {
        setStudents(r.students);
        setTotalMembers(r.totalMembers);
      }
    });
  }, [selected, page, sort]);

  const subjects = useMemo(() => {
    const names = new Set<string>();
    for (const s of students) for (const c of s.subjectCoverage) names.add(c.subject);
    return [...names];
  }, [students]);

  if (loading || !session) return null;

  if (groups && groups.length === 0) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching' }]} />
        <div className="glass bp-ticks relative mt-10 flex flex-col items-center rounded-xl px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-ink-dim">
            You are not a head of any group yet — ask your organisation admin, or create an organisation in Settings.
          </p>
        </div>
      </div>
    );
  }

  if (!groups || !summary) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching' }]} />
        <p className="mt-4 text-sm text-ink-dim">Loading…</p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(totalMembers / 50));

  return (
    <div>
      <Breadcrumb items={[{ label: 'Subjects', href: '/' }, { label: 'Coaching' }]} />
      <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="tblabel mb-1.5">Cohort · Overview</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Coaching Dashboard</h1>
        </div>
        {groups.length > 1 ? (
          <select
            aria-label="Group"
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setPage(1); }}
            className="max-w-full truncate rounded border border-line bg-panel px-2 py-1 text-sm text-ink"
          >
            {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.label}</option>)}
          </select>
        ) : (
          <span className="dim-chip text-ink-dim">{groups[0].label}</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-alarm">{error}</p>}

      <div className="grid gap-5 [&>*]:min-w-0">
        <div className="bp-rise grid grid-cols-2 gap-4 sm:grid-cols-4" style={{ animationDelay: '40ms' }}>
          <StatTile label="Cohort completion" value={`${summary.totals.completionPct}%`} />
          <StatTile label="Students" value={summary.totals.members} />
          <StatTile label="Due today" value={summary.totals.dueToday} tone="accent" />
          <StatTile label="Overdue" value={summary.totals.overdue} tone="alarm" />
        </div>

        <div className="bp-rise" style={{ animationDelay: '120ms' }}>
          <ActivityBars activity={summary.activity} />
        </div>

        <div className="bp-rise glass overflow-x-auto rounded-xl p-4" style={{ animationDelay: '200ms' }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="tblabel">Students</div>
            <FilterChips
              aria-label="Sort students"
              className="mb-0"
              value={sort}
              onChange={(k) => { setSort(k as 'completion' | 'overdue'); setPage(1); }}
              options={[
                { key: 'completion', label: 'Lowest completion' },
                { key: 'overdue', label: 'Most overdue' },
              ]}
            />
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="tblabel">
                <th className="pb-2 pr-3">Student</th>
                <th className="pb-2 pr-3">Completion</th>
                <th className="pb-2 pr-3">Streak</th>
                <th className="pb-2 pr-3">Status</th>
                {subjects.map((s) => <th key={s} className="pb-2 pr-3">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.userId} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <Link className="group/std flex items-center gap-2" href={`/coaching/${selected}/${s.userId}`}>
                      <span
                        aria-hidden
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel-2 text-xs font-bold text-ink"
                        style={{ boxShadow: `0 0 0 2px var(--panel), 0 0 0 3px ${s.hasData && s.completedTopics > 0 ? (s.overdue > 0 ? 'var(--alarm)' : 'var(--go)') : 'var(--line-strong)'}` }}
                      >
                        {s.username.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-ink underline-offset-2 group-hover/std:text-accent group-hover/std:underline">{s.username}</span>
                    </Link>
                  </td>
                  {s.hasData ? (
                    <>
                      <td className="py-2 pr-3">{s.completionPct}%</td>
                      <td className="py-2 pr-3">{s.streakDays}d</td>
                      <td className="py-2 pr-3">
                        {s.completedTopics === 0 ? (
                          <span className="text-ink-faint">Not started</span>
                        ) : s.overdue > 0 ? `Overdue (${s.overdue})` : 'On track'}
                      </td>
                      {subjects.map((name) => {
                        const cov = s.subjectCoverage.find((c) => c.subject === name);
                        const pct = cov && cov.total > 0 ? Math.round((100 * cov.revised) / cov.total) : null;
                        return (
                          <td key={name} className="py-2 pr-3">
                            {pct === null ? (
                              <span className="text-ink-faint">—</span>
                            ) : (
                              <span
                                className="inline-block rounded px-1.5 py-0.5 text-xs font-medium text-ink"
                                style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(12 + (pct / 100) * 60)}%, transparent)` }}
                              >
                                {pct}%
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <td className="py-2 text-ink-faint" colSpan={3 + subjects.length}>No data yet</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded border border-line px-2 py-1 text-xs text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tblabel">page {page} / {pages}</span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className="rounded border border-line px-2 py-1 text-xs text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
