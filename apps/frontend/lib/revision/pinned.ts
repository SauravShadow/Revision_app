import type { AppData, Topic } from '@revision-app/shared';

// A topic is "pinned" — floated to the top of its list — when it is bookmarked
// or marked High priority (Phase 6).
export function isPinnedTopic(topic: Topic): boolean {
  return topic.bookmarkedAt !== undefined || topic.priority === 'High';
}

/**
 * Stable display ordering: pinned topics first (in their existing relative
 * order), then the rest (likewise). Purely a view concern — drag-reorder still
 * persists the raw topicIds order by id, so this never fights DnD.
 */
export function pinnedFirst(ids: string[], topics: AppData['topics']): string[] {
  const pinned: string[] = [];
  const rest: string[] = [];
  for (const id of ids) {
    const t = topics[id];
    (t && isPinnedTopic(t) ? pinned : rest).push(id);
  }
  return [...pinned, ...rest];
}
