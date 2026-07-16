import type { AppData } from '@revision-app/shared';
import { badgeState, inGoodStanding, lastRevisedAt } from '@/lib/revision/engine';
import { DAY_MS } from './day';
import { activeTopics } from './topics';

export interface OverallStats {
  totalTopics: number;
  completionPct: number;
  neverRevised: number;
  dueToday: number;
  overdue: number;
  avgRevisionsPerTopic: number;
  avgDaysBetween?: number;
}

export interface TopicRevisionRank {
  topicId: string;
  title: string;
  subjectId: string;
  chapterId: string;
  count: number;
  lastRevised?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function overallStats(data: AppData, now: number): OverallStats {
  const topics = activeTopics(data);
  const total = topics.length;
  if (total === 0) {
    return { totalTopics: 0, completionPct: 0, neverRevised: 0, dueToday: 0, overdue: 0, avgRevisionsPerTopic: 0 };
  }

  let good = 0;
  let neverRevised = 0;
  let dueToday = 0;
  let overdue = 0;
  let totalRevisions = 0;
  let gapSum = 0;
  let gapCount = 0;

  for (const t of topics) {
    const h = t.revisionHistory;
    if (inGoodStanding(h, now)) good += 1;
    if (h.length === 0) neverRevised += 1;
    const state = badgeState(h, now);
    if (state === 'DueToday') dueToday += 1;
    if (state === 'Overdue') overdue += 1;
    totalRevisions += h.length;
    for (let i = 1; i < h.length; i++) {
      gapSum += (h[i].timestamp - h[i - 1].timestamp) / DAY_MS;
      gapCount += 1;
    }
  }

  return {
    totalTopics: total,
    completionPct: Math.round((good / total) * 100),
    neverRevised,
    dueToday,
    overdue,
    avgRevisionsPerTopic: round1(totalRevisions / total),
    avgDaysBetween: gapCount === 0 ? undefined : round1(gapSum / gapCount),
  };
}

export function topicsByRevisionCount(data: AppData, limit = 5): { most: TopicRevisionRank[]; least: TopicRevisionRank[] } {
  const ranks: TopicRevisionRank[] = [];
  for (const t of activeTopics(data)) {
    const chapter = data.chapters[t.chapterId];
    if (!chapter) continue;
    ranks.push({
      topicId: t.id,
      title: t.title,
      subjectId: chapter.subjectId,
      chapterId: t.chapterId,
      count: t.revisionHistory.length,
      lastRevised: lastRevisedAt(t.revisionHistory),
    });
  }

  const most = [...ranks]
    .sort((a, b) => b.count - a.count || (b.lastRevised ?? 0) - (a.lastRevised ?? 0))
    .slice(0, limit);

  const least = ranks
    .filter((r) => r.count > 0)
    .sort((a, b) => a.count - b.count || (b.lastRevised ?? 0) - (a.lastRevised ?? 0))
    .slice(0, limit);

  return { most, least };
}
