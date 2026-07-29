import type { AppData } from '@revision-app/shared';
import { badgeState, nextDueDate } from '@/lib/revision/engine';
import { startOfDay } from './day';
import { activeTopics } from './topics';

export interface CalendarDay {
  day: number;
  inMonth: boolean;
  dueTopicIds: string[];
  overdueTopicIds: string[];
  completedTopicIds: string[];
}

function pushId(map: Map<number, string[]>, key: number, id: string): void {
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

export function calendarMonth(data: AppData, year: number, month: number, now: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay()); // back up to the Sunday on/before the 1st
  const today = startOfDay(now);

  const dueByDay = new Map<number, string[]>();
  const completedByDay = new Map<number, string[]>();
  const overdueToday: string[] = [];

  for (const t of activeTopics(data)) {
    const due = nextDueDate(t);
    if (due !== undefined) pushId(dueByDay, startOfDay(due), t.id);
    if (badgeState(t, now) === 'Overdue') overdueToday.push(t.id);
    for (const rev of t.revisionHistory) pushId(completedByDay, startOfDay(rev.timestamp), t.id);
  }

  const cells: CalendarDay[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    const day = startOfDay(cursor.getTime());
    cells.push({
      day,
      inMonth: cursor.getMonth() === month,
      dueTopicIds: dueByDay.get(day) ?? [],
      overdueTopicIds: day === today ? overdueToday : [],
      completedTopicIds: completedByDay.get(day) ?? [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}
