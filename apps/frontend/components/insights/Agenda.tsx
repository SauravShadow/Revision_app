'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import type { AppData } from '@revision-app/shared';
import { useStore } from '@/store/useStore';
import { startOfDay } from '@/lib/revision/engine';
import { buildAgenda, type AgendaTopic } from '@/lib/insights/agenda';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

function dayLabel(ts: number, today: number): string {
  const diff = Math.round((ts - today) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const d = new Date(ts);
  return `${DOW[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]}`;
}

function AgendaRow({ t }: { t: AgendaTopic }) {
  const pill = t.status === 'overdue'
    ? 'border-alarm/50 bg-alarm/10 text-alarm'
    : 'border-annotation/50 bg-annotation/10 text-annotation';
  return (
    <li className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent-soft">
      <Link href={`/topic/${t.id}`} className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{t.title}</div>
        <div className="tblabel truncate text-ink-faint">
          {t.subject ?? '—'}{t.chapter ? ` · ${t.chapter}` : ''}
        </div>
      </Link>
      <span className={`dim-chip ${pill}`}>{t.status === 'overdue' ? 'Overdue' : 'Due'}</span>
    </li>
  );
}

function Section({ label, tone, topics, delay }: { label: string; tone: string; topics: AgendaTopic[]; delay: number }) {
  return (
    <section className="bp-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="tblabel" style={{ color: tone }}>{label}</span>
        <span className="dim-chip font-mono text-[0.6rem] text-ink-dim">{topics.length}</span>
      </div>
      <ul className="glass divide-y divide-line rounded-xl p-2">
        {topics.map((t) => <AgendaRow key={t.id} t={t} />)}
      </ul>
    </section>
  );
}

export function Agenda() {
  const subjects = useStore((s) => s.subjects);
  const chapters = useStore((s) => s.chapters);
  const topics = useStore((s) => s.topics);
  const now = Date.now();
  const data = useMemo(() => ({ subjects, chapters, topics }) as unknown as AppData, [subjects, chapters, topics]);
  const agenda = useMemo(() => buildAgenda(data, now), [data, now]);
  const today = startOfDay(now);

  if (agenda.overdue.length === 0 && agenda.days.length === 0) {
    return (
      <div className="glass bp-ticks relative flex flex-col items-center rounded-xl px-6 py-16 text-center">
        <p className="max-w-sm text-sm text-ink-dim">Nothing due in the next two weeks — you&apos;re all caught up.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {agenda.overdue.length > 0 && (
        <Section label="Overdue" tone="var(--alarm)" topics={agenda.overdue} delay={0} />
      )}
      {agenda.days.map((d, i) => (
        <Section key={d.ts} label={dayLabel(d.ts, today)} tone="var(--accent)" topics={d.topics} delay={(i + 1) * 40} />
      ))}
    </div>
  );
}
