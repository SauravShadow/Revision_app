import type { AppData } from '@revision-app/shared';
import { startOfDay, addDays } from './day';

export interface DayCount {
  day: number;
  count: number;
}

export function revisionCountsByDay(data: AppData, rangeDays: number, now: number): DayCount[] {
  const today = startOfDay(now);
  const start = addDays(today, -(rangeDays - 1));

  const counts = new Map<number, number>();
  for (const topic of Object.values(data.topics)) {
    if (topic.archivedAt) continue;
    for (const rev of topic.revisionHistory) {
      const day = startOfDay(rev.timestamp);
      if (day < start || day > today) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  const out: DayCount[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const day = addDays(start, i);
    out.push({ day, count: counts.get(day) ?? 0 });
  }
  return out;
}
