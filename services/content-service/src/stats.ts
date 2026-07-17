// Pure derivation of per-user stats from an AppData blob. All day bucketing
// is UTC (see Global Constraints in the plan/spec).
import type { AppData, SubjectCoverage } from '@revision-app/shared';
import { activeTopics, nextDueDate, currentStreak } from '@revision-app/shared';

export interface DerivedStats {
  totalTopics: number;
  completedTopics: number;
  streakDays: number;
  dueHistogram: Record<string, number>;
  subjectCoverage: SubjectCoverage[];
}

export function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function deriveStats(data: AppData, now: number): DerivedStats {
  const topics = activeTopics(data);
  const dueHistogram: Record<string, number> = {};
  const perSubject = new Map<string, { total: number; revised: number }>();

  // Seed coverage with every active subject so a subject with zero topics
  // still shows up in the heatmap.
  for (const id of data.subjectOrder) {
    const subject = data.subjects[id];
    if (subject && !subject.archivedAt) perSubject.set(subject.name, { total: 0, revised: 0 });
  }

  let completed = 0;
  for (const t of topics) {
    const revised = t.revisionHistory.length > 0;
    if (revised) completed += 1;
    const due = nextDueDate(t.revisionHistory);
    if (due !== undefined) {
      const key = utcDayKey(due);
      dueHistogram[key] = (dueHistogram[key] ?? 0) + 1;
    }
    const subjectName = data.subjects[data.chapters[t.chapterId].subjectId].name;
    const cov = perSubject.get(subjectName) ?? { total: 0, revised: 0 };
    cov.total += 1;
    if (revised) cov.revised += 1;
    perSubject.set(subjectName, cov);
  }

  return {
    totalTopics: topics.length,
    completedTopics: completed,
    streakDays: currentStreak(data, now),
    dueHistogram,
    subjectCoverage: [...perSubject.entries()].map(([subject, c]) => ({ subject, ...c })),
  };
}

export function deriveActivity(data: AppData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of activeTopics(data)) {
    for (const r of t.revisionHistory) {
      const key = utcDayKey(r.timestamp);
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

export function dueCounts(hist: Record<string, number>, now: number): { dueToday: number; overdue: number } {
  const today = utcDayKey(now);
  let dueToday = 0;
  let overdue = 0;
  for (const [day, count] of Object.entries(hist)) {
    if (day === today) dueToday += count;
    else if (day < today) overdue += count; // ISO date strings compare lexicographically
  }
  return { dueToday, overdue };
}
