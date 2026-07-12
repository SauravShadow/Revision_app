import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { badgeState } from '@/lib/revision/engine';

export type StatusFilter =
  | 'needs-revision' | 'never-revised' | 'bookmarked'
  | 'has-flashcards' | 'has-attachments';

export interface ActiveFilters {
  tagIds: string[];
  statuses: StatusFilter[];
}

export function hasActiveFilters(f: ActiveFilters): boolean {
  return f.tagIds.length > 0 || f.statuses.length > 0;
}

export function topicMatchesStatus(topic: Topic, status: StatusFilter, now: number): boolean {
  switch (status) {
    case 'needs-revision': {
      const b = badgeState(topic.revisionHistory, now);
      return b === 'Overdue' || b === 'DueToday';
    }
    case 'never-revised': return topic.revisionHistory.length === 0;
    case 'bookmarked': return !!topic.bookmarkedAt;
    case 'has-flashcards': return (topic.flashcards?.length ?? 0) > 0;
    case 'has-attachments': return (topic.attachments?.length ?? 0) > 0;
  }
}

export function topicMatchesFilters(topic: Topic, f: ActiveFilters, now: number): boolean {
  if (topic.archivedAt) return false;
  if (!f.statuses.every((s) => topicMatchesStatus(topic, s, now))) return false;
  const tagIds = topic.tagIds ?? [];
  if (!f.tagIds.every((id) => tagIds.includes(id))) return false;
  return true;
}

export function matchingTopics(
  data: AppData, f: ActiveFilters, now: number,
  scope?: { subjectId?: string; chapterId?: string },
): { topic: Topic; chapter?: Chapter; subject?: Subject }[] {
  const out: { topic: Topic; chapter?: Chapter; subject?: Subject }[] = [];
  for (const topic of Object.values(data.topics)) {
    const chapter = data.chapters[topic.chapterId];
    if (scope?.chapterId && topic.chapterId !== scope.chapterId) continue;
    if (scope?.subjectId && chapter?.subjectId !== scope.subjectId) continue;
    if (chapter?.archivedAt) continue;
    const subject = chapter ? data.subjects[chapter.subjectId] : undefined;
    if (subject?.archivedAt) continue;
    if (topicMatchesFilters(topic, f, now)) out.push({ topic, chapter, subject });
  }
  return out;
}
