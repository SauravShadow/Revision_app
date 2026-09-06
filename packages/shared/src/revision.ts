// Pure spaced-repetition math — single source of truth for both the browser
// engine (apps/frontend/lib/revision) and content-service stats derivation.
import type { AppData, Revision, Topic } from './types';

export const LADDER: readonly number[] = [1, 3, 7, 16, 35, 60, 90];
export const DAY_MS = 24 * 60 * 60 * 1000;

export function nextInterval(revisionCount: number): number {
  if (revisionCount <= 0) return LADDER[0];
  const idx = Math.min(revisionCount - 1, LADDER.length - 1);
  return LADDER[idx];
}

/**
 * How much to shorten the next suggested interval based on the last quiz
 * result. 1 = no change. Absent or empty scores never shorten.
 */
export function scoreFactor(score?: { correct: number; total: number }): number {
  if (!score || score.total <= 0) return 1;
  const ratio = score.correct / score.total;
  if (ratio >= 0.8) return 1;
  if (ratio >= 0.5) return 0.5;
  return 0.25;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function lastRevisedAt(h: Revision[]): number | undefined {
  return h.length === 0 ? undefined : h[h.length - 1].timestamp;
}

// A topic-shaped value the scheduler can read. Topic satisfies this.
export interface Plannable {
  revisionHistory: Revision[];
  plannedAt?: number | null;
}

// Manual-first: a topic is due only when the user planned it.
export function nextDueDate(t: Plannable): number | undefined {
  return t.plannedAt ?? undefined;
}

// The old ladder-derived date, demoted to a suggestion for the plan-next UI.
// A weak self-graded quiz score pulls the suggestion earlier; it never pushes
// it later, and never suggests less than one day out.
export function suggestedNextDate(h: Revision[]): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  const base = nextInterval(h.length);
  const days = Math.max(1, Math.floor(base * scoreFactor(h[h.length - 1].score)));
  return last + days * DAY_MS;
}

export function daysSince(h: Revision[], now: number): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return Math.floor((now - last) / DAY_MS);
}

export type BadgeState =
  | 'NeverRevised' | 'Unplanned' | 'Overdue' | 'DueToday'
  | 'DueTomorrow' | 'RecentlyRevised' | 'Upcoming';

export function badgeState(t: Plannable, now: number): BadgeState {
  const due = nextDueDate(t);
  if (due === undefined) return t.revisionHistory.length === 0 ? 'NeverRevised' : 'Unplanned';
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (dayDiff < 0) return 'Overdue';
  if (dayDiff === 0) return 'DueToday';
  const since = daysSince(t.revisionHistory, now);
  if (since !== undefined && since <= 1) return 'RecentlyRevised';
  if (dayDiff === 1) return 'DueTomorrow';
  return 'Upcoming';
}

export function activeTopics(data: AppData): Topic[] {
  return Object.values(data.topics).filter((t) => {
    if (t.archivedAt) return false;
    const chapter = data.chapters[t.chapterId];
    if (!chapter || chapter.archivedAt) return false;
    const subject = data.subjects[chapter.subjectId];
    return !!subject && !subject.archivedAt;
  });
}

function stepDayBack(ts: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  return startOfDay(d.getTime());
}

export function currentStreak(data: AppData, now: number): number {
  const days = new Set<number>();
  for (const topic of activeTopics(data)) {
    for (const rev of topic.revisionHistory) days.add(startOfDay(rev.timestamp));
  }
  const today = startOfDay(now);
  let anchor: number;
  if (days.has(today)) anchor = today;
  else if (days.has(stepDayBack(today))) anchor = stepDayBack(today);
  else return 0;

  let streak = 0;
  let cursor = anchor;
  while (days.has(cursor)) {
    streak += 1;
    // DST-safe day stepping: advance the local calendar date backward, then snap to local midnight.
    cursor = stepDayBack(cursor);
  }
  return streak;
}
