import type { AppData } from '@revision-app/shared';
import { DAY_MS } from '@revision-app/shared';
import { badgeState, nextDueDate, startOfDay } from '@/lib/revision/engine';
import { activeTopics } from './topics';

// Agenda-first calendar model (docs/calendar-agenda-prototype.html): an overdue
// bucket plus upcoming due topics grouped by day through a horizon.
export type AgendaStatus = 'overdue' | 'due';

export interface AgendaTopic {
  id: string;
  title: string;
  subject?: string;
  chapter?: string;
  status: AgendaStatus;
}

export interface AgendaDay {
  ts: number; // startOfDay
  topics: AgendaTopic[];
}

export interface Agenda {
  overdue: AgendaTopic[];
  days: AgendaDay[];
}

export function buildAgenda(data: AppData, now: number, horizonDays = 14): Agenda {
  const today = startOfDay(now);
  const horizonEnd = today + horizonDays * DAY_MS;
  const overdue: AgendaTopic[] = [];
  const byDay = new Map<number, AgendaTopic[]>();

  for (const t of activeTopics(data)) {
    const chapter = data.chapters[t.chapterId];
    const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
    const base = { id: t.id, title: t.title, subject: subject?.name, chapter: chapter?.name };

    if (badgeState(t.revisionHistory, now) === 'Overdue') {
      overdue.push({ ...base, status: 'overdue' });
      continue;
    }
    const due = nextDueDate(t.revisionHistory);
    if (due === undefined) continue;
    const dueDay = startOfDay(due);
    if (dueDay >= today && dueDay <= horizonEnd) {
      const arr = byDay.get(dueDay) ?? [];
      arr.push({ ...base, status: 'due' });
      byDay.set(dueDay, arr);
    }
  }

  const days = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, topics]) => ({ ts, topics }));
  return { overdue, days };
}
