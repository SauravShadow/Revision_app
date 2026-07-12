import type { AppData } from '@/lib/domain/types';
import { inGoodStanding, lastRevisedAt } from './engine';

export function chapterProgress(data: AppData, chapterId: string, now: number): number {
  const chapter = data.chapters[chapterId];
  if (!chapter || chapter.topicIds.length === 0) return 0;
  const good = chapter.topicIds.filter((tid) => {
    const t = data.topics[tid];
    return t && inGoodStanding(t.revisionHistory, now);
  }).length;
  return Math.round((good / chapter.topicIds.length) * 100);
}

export function subjectProgress(data: AppData, subjectId: string, now: number): number {
  const subject = data.subjects[subjectId];
  if (!subject || subject.chapterIds.length === 0) return 0;
  const total = subject.chapterIds.reduce((sum, cid) => sum + chapterProgress(data, cid, now), 0);
  return Math.round(total / subject.chapterIds.length);
}

export function subjectStats(
  data: AppData, subjectId: string, now: number,
): { chapterCount: number; pending: number; lastRevised: number | undefined } {
  const subject = data.subjects[subjectId];
  if (!subject) return { chapterCount: 0, pending: 0, lastRevised: undefined };
  let pending = 0;
  let lastRevised: number | undefined;
  for (const cid of subject.chapterIds) {
    const chapter = data.chapters[cid];
    if (!chapter) continue;
    for (const tid of chapter.topicIds) {
      const t = data.topics[tid];
      if (!t) continue;
      if (!inGoodStanding(t.revisionHistory, now)) pending += 1;
      const lr = lastRevisedAt(t.revisionHistory);
      if (lr !== undefined && (lastRevised === undefined || lr > lastRevised)) lastRevised = lr;
    }
  }
  return { chapterCount: subject.chapterIds.length, pending, lastRevised };
}
