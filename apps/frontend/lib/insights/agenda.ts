import type { AppData } from '@revision-app/shared';
import { DAY_MS } from '@revision-app/shared';
import { badgeState, lastRevisedAt, nextDueDate, startOfDay } from '@/lib/revision/engine';
import { activeTopics } from './topics';

// Agenda-first calendar model (docs/calendar-agenda-prototype.html): an overdue
// bucket plus per-day groups through a horizon. Each active topic appears at
// most once: overdue bucket, else completed in today's group if revised today,
// else due on its due day. Today and Tomorrow groups always exist so the agenda
// anchors on "now" even when empty.
export type AgendaStatus = 'overdue' | 'due' | 'completed' | 'unplanned';

export interface AgendaTopic {
  id: string;
  title: string;
  subject?: string;
  chapter?: string;
  subjectColor?: string;
  status: AgendaStatus;
}

export interface AgendaDay {
  ts: number; // startOfDay
  topics: AgendaTopic[];
}

export interface Agenda {
  overdue: AgendaTopic[];
  unplanned: AgendaTopic[];
  days: AgendaDay[];
}

const RANK: Record<AgendaStatus, number> = { overdue: 0, due: 1, completed: 2, unplanned: 3 };

export function buildAgenda(data: AppData, now: number, horizonDays = 14): Agenda {
  const today = startOfDay(now);
  const horizonEnd = today + horizonDays * DAY_MS;
  const overdue: AgendaTopic[] = [];
  const unplanned: AgendaTopic[] = [];
  const byDay = new Map<number, AgendaTopic[]>([[today, []], [today + DAY_MS, []]]);
  const push = (day: number, t: AgendaTopic) => {
    const arr = byDay.get(day) ?? [];
    arr.push(t);
    byDay.set(day, arr);
  };

  for (const t of activeTopics(data)) {
    const chapter = data.chapters[t.chapterId];
    const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
    const base = {
      id: t.id, title: t.title,
      subject: subject?.name, chapter: chapter?.name, subjectColor: subject?.color,
    };

    if (badgeState(t, now) === 'Overdue') {
      overdue.push({ ...base, status: 'overdue' });
      continue;
    }
    const last = lastRevisedAt(t.revisionHistory);
    if (last !== undefined && startOfDay(last) === today) {
      push(today, { ...base, status: 'completed' });
      continue;
    }
    const due = nextDueDate(t);
    if (due === undefined) {
      // Revised but never re-planned: surface it so it doesn't silently vanish.
      if (t.revisionHistory.length > 0) unplanned.push({ ...base, status: 'unplanned' });
      continue;
    }
    const dueDay = startOfDay(due);
    if (dueDay >= today && dueDay <= horizonEnd) push(dueDay, { ...base, status: 'due' });
  }

  const days = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, topics]) => ({ ts, topics: topics.sort((a, b) => RANK[a.status] - RANK[b.status]) }));
  return { overdue, unplanned, days };
}

export interface DayLoad {
  count: number;
  worst: AgendaStatus;
}

// Per-day workload for the week strip: every topic with a display day, unbounded
// (the strip navigates arbitrary weeks). Same one-day-per-topic rule as above.
export function loadByDay(data: AppData, now: number): Map<number, DayLoad> {
  const today = startOfDay(now);
  const loads = new Map<number, DayLoad>();
  const add = (day: number, status: AgendaStatus) => {
    const cur = loads.get(day);
    if (!cur) loads.set(day, { count: 1, worst: status });
    else loads.set(day, { count: cur.count + 1, worst: RANK[status] < RANK[cur.worst] ? status : cur.worst });
  };

  for (const t of activeTopics(data)) {
    const last = lastRevisedAt(t.revisionHistory);
    if (badgeState(t, now) === 'Overdue') {
      const due = nextDueDate(t);
      if (due !== undefined) add(startOfDay(due), 'overdue');
      continue;
    }
    if (last !== undefined && startOfDay(last) === today) {
      add(today, 'completed');
      continue;
    }
    const due = nextDueDate(t);
    if (due !== undefined) add(startOfDay(due), 'due');
  }
  return loads;
}
