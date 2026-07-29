import type { AppData } from '@revision-app/shared';
import { badgeState, inGoodStanding, lastRevisedAt } from './engine';

// Aggregate revision status of a subject, most-urgent-wins, for the avatar ring
// on SubjectCard (Phase 5). overdue > due > recent > none.
export type SubjectStatus = 'overdue' | 'due' | 'recent' | 'none';

export function subjectStatus(data: AppData, subjectId: string, now: number): SubjectStatus {
  const subject = data.subjects[subjectId];
  if (!subject) return 'none';
  let due = false;
  let recent = false;
  for (const cid of subject.chapterIds) {
    const chapter = data.chapters[cid];
    if (!chapter || chapter.archivedAt) continue;
    for (const tid of chapter.topicIds) {
      const t = data.topics[tid];
      if (!t || t.archivedAt) continue;
      const b = badgeState(t, now);
      if (b === 'Overdue') return 'overdue';
      if (b === 'DueToday') due = true;
      else if (b === 'RecentlyRevised') recent = true;
    }
  }
  return due ? 'due' : recent ? 'recent' : 'none';
}

export function chapterProgress(data: AppData, chapterId: string, now: number): number {
  const chapter = data.chapters[chapterId];
  if (!chapter) return 0;
  const topics = chapter.topicIds
    .map((tid) => data.topics[tid])
    .filter((t) => t && !t.archivedAt);
  if (topics.length === 0) return 0;
  const good = topics.filter((t) => inGoodStanding(t, now)).length;
  return Math.round((good / topics.length) * 100);
}

export function subjectProgress(data: AppData, subjectId: string, now: number): number {
  const subject = data.subjects[subjectId];
  if (!subject) return 0;
  const chapters = subject.chapterIds
    .map((cid) => data.chapters[cid])
    .filter((c) => c && !c.archivedAt);
  if (chapters.length === 0) return 0;
  const total = chapters.reduce((sum, c) => sum + chapterProgress(data, c.id, now), 0);
  return Math.round(total / chapters.length);
}

export function subjectStats(
  data: AppData, subjectId: string, now: number,
): { chapterCount: number; pending: number; lastRevised: number | undefined } {
  const subject = data.subjects[subjectId];
  if (!subject) return { chapterCount: 0, pending: 0, lastRevised: undefined };
  let pending = 0;
  let lastRevised: number | undefined;
  let chapterCount = 0;
  for (const cid of subject.chapterIds) {
    const chapter = data.chapters[cid];
    if (!chapter || chapter.archivedAt) continue;
    chapterCount += 1;
    for (const tid of chapter.topicIds) {
      const t = data.topics[tid];
      if (!t || t.archivedAt) continue;
      if (!inGoodStanding(t, now)) pending += 1;
      const lr = lastRevisedAt(t.revisionHistory);
      if (lr !== undefined && (lastRevised === undefined || lr > lastRevised)) lastRevised = lr;
    }
  }
  return { chapterCount, pending, lastRevised };
}
