import type { Revision, Topic } from '@revision-app/shared';
import { makeId } from '@revision-app/shared';
import { nextInterval } from './ladder';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function totalRevisions(h: Revision[]): number {
  return h.length;
}

export function lastRevisedAt(h: Revision[]): number | undefined {
  return h.length === 0 ? undefined : h[h.length - 1].timestamp;
}

export function nextDueDate(h: Revision[]): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return last + nextInterval(h.length) * DAY_MS;
}

export function daysSince(h: Revision[], now: number): number | undefined {
  const last = lastRevisedAt(h);
  if (last === undefined) return undefined;
  return Math.floor((now - last) / DAY_MS);
}

export type BadgeState =
  | 'NeverRevised' | 'Overdue' | 'DueToday'
  | 'DueTomorrow' | 'RecentlyRevised' | 'Upcoming';

export function badgeState(h: Revision[], now: number): BadgeState {
  const due = nextDueDate(h);
  if (due === undefined) return 'NeverRevised';
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (dayDiff < 0) return 'Overdue';
  if (dayDiff === 0) return 'DueToday';
  const since = daysSince(h, now);
  if (since !== undefined && since <= 1) return 'RecentlyRevised';
  if (dayDiff === 1) return 'DueTomorrow';
  return 'Upcoming';
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

export function inGoodStanding(h: Revision[], now: number): boolean {
  const s = badgeState(h, now);
  return s !== 'Overdue' && s !== 'DueToday' && s !== 'NeverRevised';
}

export function markRevised(topic: Topic, now: number): Topic {
  const revision: Revision = { id: makeId(), timestamp: now };
  return {
    ...topic,
    revisionHistory: [...topic.revisionHistory, revision],
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
