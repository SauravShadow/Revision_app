import type { AppData } from '@revision-app/shared';
import { startOfDay, addDays } from './day';
import { activeTopics } from './topics';

function revisedDays(data: AppData): Set<number> {
  const days = new Set<number>();
  for (const topic of activeTopics(data)) {
    for (const rev of topic.revisionHistory) days.add(startOfDay(rev.timestamp));
  }
  return days;
}

export function currentStreak(data: AppData, now: number): number {
  const days = revisedDays(data);
  const today = startOfDay(now);
  let anchor: number;
  if (days.has(today)) anchor = today;
  else if (days.has(addDays(today, -1))) anchor = addDays(today, -1);
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(data: AppData): number {
  const days = [...revisedDays(data)].sort((a, b) => a - b);
  if (days.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === addDays(days[i - 1], 1)) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }
  return longest;
}
