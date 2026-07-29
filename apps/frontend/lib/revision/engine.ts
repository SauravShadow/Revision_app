import type { Plannable, Revision, Topic } from '@revision-app/shared';
import { makeId } from '@revision-app/shared';
import {
  startOfDay, lastRevisedAt, nextDueDate, suggestedNextDate, daysSince, badgeState, DAY_MS,
} from '@revision-app/shared';
export {
  startOfDay, lastRevisedAt, nextDueDate, suggestedNextDate, daysSince, badgeState,
} from '@revision-app/shared';
export type { BadgeState, Plannable } from '@revision-app/shared';

export function totalRevisions(h: Revision[]): number {
  return h.length;
}

export function relativeLabel(ts: number, now: number): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

export function inGoodStanding(t: Plannable, now: number): boolean {
  const s = badgeState(t, now);
  return s !== 'Overdue' && s !== 'DueToday' && s !== 'NeverRevised' && s !== 'Unplanned';
}

// Revising fulfils the current plan; the plan-next dialog sets the next one.
export function markRevised(topic: Topic, now: number): Topic {
  const revision: Revision = { id: makeId(), timestamp: now };
  return {
    ...topic,
    revisionHistory: [...topic.revisionHistory, revision],
    plannedAt: null,
    updatedAt: now,
  };
}

export function deleteRevision(topic: Topic, revisionId: string, now: number): Topic {
  if (!topic.revisionHistory.some((r) => r.id === revisionId)) return topic;
  return {
    ...topic,
    revisionHistory: topic.revisionHistory.filter((r) => r.id !== revisionId),
    updatedAt: now,
  };
}

// Clamps to now (a future "last revised" breaks days-since/badge math) and
// re-sorts: the engine reads h[h.length - 1] as the latest revision.
export function updateRevisionTimestamp(topic: Topic, revisionId: string, timestamp: number, now: number): Topic {
  if (!topic.revisionHistory.some((r) => r.id === revisionId)) return topic;
  const clamped = Math.min(timestamp, now);
  const revisionHistory = topic.revisionHistory
    .map((r) => (r.id === revisionId ? { ...r, timestamp: clamped } : r))
    .sort((a, b) => a.timestamp - b.timestamp);
  return { ...topic, revisionHistory, updatedAt: now };
}
