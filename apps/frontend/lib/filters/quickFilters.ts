import type { AppData, Topic } from '@revision-app/shared';
import { badgeState } from '@/lib/revision/engine';
import { activeTopics } from '@/lib/insights/topics';

// Prominent single-select quick filters shown as chips on the subject/chapter
// lists (Phase 1). All predicates derive from the existing revision engine.
export const QUICK_FILTERS = ['all', 'due', 'overdue', 'bookmarked', 'not-revised'] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number];

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: 'All',
  due: 'Due',
  overdue: 'Overdue',
  bookmarked: 'Bookmarked',
  'not-revised': 'Not revised',
};

/** Does a single topic satisfy the given quick filter? */
export function topicMatchesQuick(topic: Topic, qf: QuickFilter, now: number): boolean {
  switch (qf) {
    case 'all': return true;
    case 'due': return badgeState(topic, now) === 'DueToday';
    case 'overdue': return badgeState(topic, now) === 'Overdue';
    case 'bookmarked': return topic.bookmarkedAt !== undefined;
    case 'not-revised': return topic.revisionHistory.length === 0;
  }
}

/** A subject matches when it is shown at all (`all`) or holds ≥1 active topic that matches. */
export function subjectMatchesQuick(data: AppData, subjectId: string, qf: QuickFilter, now: number): boolean {
  const subject = data.subjects[subjectId];
  if (!subject || subject.archivedAt) return false;
  if (qf === 'all') return true;
  return activeTopics(data).some(
    (t) => data.chapters[t.chapterId]?.subjectId === subjectId && topicMatchesQuick(t, qf, now),
  );
}

/** Live chip counts: how many non-archived subjects match each quick filter. */
export function subjectQuickCounts(data: AppData, now: number): Record<QuickFilter, number> {
  const counts = Object.fromEntries(QUICK_FILTERS.map((k) => [k, 0])) as Record<QuickFilter, number>;
  for (const subjectId of Object.keys(data.subjects)) {
    for (const qf of QUICK_FILTERS) {
      if (subjectMatchesQuick(data, subjectId, qf, now)) counts[qf] += 1;
    }
  }
  return counts;
}
