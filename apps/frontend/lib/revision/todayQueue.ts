import type { AppData, Chapter, Subject, Topic } from '@revision-app/shared';
import { badgeState } from '@/lib/revision/engine';
import { activeTopics } from '@/lib/insights/topics';

// "Today's queue" (product extra #1): the topics a student should revise now —
// everything Overdue or Due Today, overdue first. Pure surfacing of existing
// badge state; the home page renders it and offers one-tap mark-revised.
export type QueueState = 'Overdue' | 'DueToday';

export interface QueueItem {
  topic: Topic;
  chapter?: Chapter;
  subject?: Subject;
  state: QueueState;
}

const RANK: Record<QueueState, number> = { Overdue: 0, DueToday: 1 };

export function todayQueue(data: AppData, now: number): QueueItem[] {
  const items: QueueItem[] = [];
  for (const topic of activeTopics(data)) {
    const state = badgeState(topic, now);
    if (state !== 'Overdue' && state !== 'DueToday') continue;
    const chapter = data.chapters[topic.chapterId];
    const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
    items.push({ topic, chapter, subject, state });
  }
  // Stable sort keeps insertion order within each state; overdue outranks due-today.
  items.sort((a, b) => RANK[a.state] - RANK[b.state]);
  return items;
}
