'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { startOfDay } from '@/lib/revision/engine';
import { buildAgenda, loadByDay, type AgendaStatus, type AgendaTopic } from '@/lib/insights/agenda';
import { WeekStrip } from './WeekStrip';

const DAY = 86_400_000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TONE: Record<AgendaStatus, string> = {
  overdue: 'var(--alarm)', due: 'var(--annotation)', completed: 'var(--go)',
};
const PILL: Record<AgendaStatus, string> = {
  overdue: 'border-alarm/60 bg-alarm/10 text-alarm',
  due: 'border-annotation/60 bg-annotation/10 text-annotation',
  completed: 'border-go/60 bg-go/10 text-go',
};
const PILL_LABEL: Record<AgendaStatus, string> = { overdue: 'Overdue', due: 'Due', completed: 'Done' };

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

function AgendaRow({ t }: { t: AgendaTopic }) {
  return (
    <li>
      <Link href={`/topic/${t.id}`}
        className="group/row flex items-center gap-3.5 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-accent-soft">
        {/* Subject chip: colour + initial; ring encodes status (SubjectCard idiom) */}
        <span
          aria-hidden
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full font-mono text-sm font-semibold text-white"
          style={{ background: t.subjectColor ?? 'var(--ink-faint)', boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${TONE[t.status]}` }}
        >
          {(t.subject ?? t.title).charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
          <span className="block truncate text-xs text-ink-faint">
            {t.subject ?? '—'}{t.chapter ? ` · ${t.chapter}` : ''}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${PILL[t.status]}`}>
          {PILL_LABEL[t.status]}
        </span>
        <svg
          className="shrink-0 text-ink-faint transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-accent"
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
    </li>
  );
}

function Section({ id, title, dateLabel, tone, alarm = false, topics, delay }: {
  id: string; title: string; dateLabel: string; tone: string; alarm?: boolean;
  topics: AgendaTopic[]; delay: number;
}) {
  const counts = topics.reduce<Partial<Record<AgendaStatus, number>>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <section id={id} className="bp-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className={`mb-1 flex items-center justify-between gap-2 border-b pb-2 ${alarm ? 'border-alarm' : 'border-line'}`}>
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.12em]" style={{ color: tone }}>{title}</span>
          <span className="text-xs text-ink-dim">{dateLabel}</span>
        </div>
        <div className="flex gap-1.5">
          {(['overdue', 'due', 'completed'] as const).filter((k) => counts[k]).map((k) => (
            <span key={k}
              className="inline-grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 font-mono text-[0.66rem] font-semibold tabular-nums"
              style={{ color: TONE[k], background: `color-mix(in srgb, ${TONE[k]} 14%, transparent)` }}
              title={`${counts[k]} ${PILL_LABEL[k].toLowerCase()}`}
            >
              {counts[k]}
            </span>
          ))}
        </div>
      </div>
      {topics.length > 0
        ? <ul className="divide-y divide-line">{topics.map((t) => <AgendaRow key={t.id} t={t} />)}</ul>
        : <div className="px-2.5 py-2.5 text-xs italic text-ink-faint">Nothing scheduled.</div>}
    </section>
  );
}

export function Agenda() {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const [now] = useState(() => Date.now());
  const data = useMemo(() => ({ subjects, chapters, topics }) as unknown as AppData, [subjects, chapters, topics]);
  const agenda = useMemo(() => buildAgenda(data, now), [data, now]);
  const loads = useMemo(() => loadByDay(data, now), [data, now]);
  const today = startOfDay(now);

  const summary = useMemo(() => ({
    overdue: agenda.overdue.length,
    dueWeek: agenda.days
      .filter((d) => d.ts < today + 7 * DAY)
      .reduce((n, d) => n + d.topics.filter((t) => t.status === 'due').length, 0),
    doneToday: agenda.days.find((d) => d.ts === today)?.topics.filter((t) => t.status === 'completed').length ?? 0,
  }), [agenda, today]);

  const empty = agenda.overdue.length === 0 && agenda.days.every((d) => d.topics.length === 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="dim-chip" style={{ color: 'var(--alarm)' }}>{summary.overdue} overdue</span>
        <span className="dim-chip" style={{ color: 'var(--annotation)' }}>{summary.dueWeek} due this week</span>
        <span className="dim-chip" style={{ color: 'var(--go)' }}>{summary.doneToday} done today</span>
      </div>

      <WeekStrip loads={loads} now={now} />

      {empty ? (
        <div className="glass bp-ticks relative flex flex-col items-center rounded-xl px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-ink-dim">Nothing due in the next two weeks — you&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {agenda.overdue.length > 0 && (
            <Section id="day-overdue" title="Overdue" tone="var(--alarm)" alarm
              dateLabel={`${agenda.overdue.length} topic${agenda.overdue.length === 1 ? '' : 's'} slipping`}
              topics={agenda.overdue} delay={0} />
          )}
          {agenda.days.map((d, i) => {
            const rel = Math.round((d.ts - today) / DAY);
            const title = rel === 0 ? 'Today' : rel === 1 ? 'Tomorrow' : DOW[new Date(d.ts).getDay()].toUpperCase();
            return (
              <Section key={d.ts} id={`day-${d.ts}`} title={title} dateLabel={fmtDate(d.ts)}
                tone={rel === 0 ? 'var(--accent)' : 'var(--ink-dim)'}
                topics={d.topics} delay={(i + 1) * 70} />
            );
          })}
        </div>
      )}
    </div>
  );
}
