import { it, expect, describe } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import {
  QUICK_FILTERS,
  topicMatchesQuick,
  subjectMatchesQuick,
  subjectQuickCounts,
  topicQuickCounts,
} from './quickFilters';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const rev = (daysAgo: number): Revision => ({ id: `r${daysAgo}`, timestamp: NOW - daysAgo * DAY });

// Minimal topic factory — only the fields the predicates read.
function topic(id: string, chapterId: string, extra: Partial<AppData['topics'][string]> = {}) {
  return { id, chapterId, name: id, revisionHistory: [], tagIds: [], ...extra } as AppData['topics'][string];
}

// badgeState reference (packages/shared): planned today -> DueToday, planned 2 days ago -> Overdue.
const dueExtra = { revisionHistory: [rev(1)], plannedAt: NOW };
const overdueExtra = { revisionHistory: [rev(3)], plannedAt: NOW - 2 * DAY };

describe('topicMatchesQuick', () => {
  it('all matches every topic', () => {
    expect(topicMatchesQuick(topic('t', 'c'), 'all', NOW)).toBe(true);
  });

  it('not-revised matches only topics with empty history', () => {
    expect(topicMatchesQuick(topic('t', 'c', { revisionHistory: [] }), 'not-revised', NOW)).toBe(true);
    expect(topicMatchesQuick(topic('t', 'c', dueExtra), 'not-revised', NOW)).toBe(false);
  });

  it('due matches DueToday, overdue matches Overdue, and they do not overlap', () => {
    const due = topic('t', 'c', dueExtra);
    const over = topic('t', 'c', overdueExtra);
    expect(topicMatchesQuick(due, 'due', NOW)).toBe(true);
    expect(topicMatchesQuick(due, 'overdue', NOW)).toBe(false);
    expect(topicMatchesQuick(over, 'overdue', NOW)).toBe(true);
    expect(topicMatchesQuick(over, 'due', NOW)).toBe(false);
  });

  it('bookmarked matches only topics with a bookmarkedAt', () => {
    expect(topicMatchesQuick(topic('t', 'c', { bookmarkedAt: NOW }), 'bookmarked', NOW)).toBe(true);
    expect(topicMatchesQuick(topic('t', 'c'), 'bookmarked', NOW)).toBe(false);
  });
});

// data: subject S1 (chapter c1) has one overdue topic; S2 (c2) has one never-revised topic.
function makeData(): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'S1' }, s2: { id: 's2', name: 'S2' } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C1' }, c2: { id: 'c2', subjectId: 's2', name: 'C2' } },
    topics: {
      t1: topic('t1', 'c1', overdueExtra),
      t2: topic('t2', 'c2', { revisionHistory: [] }),
    },
    subjectOrder: ['s1', 's2'],
  } as unknown as AppData;
}

describe('subjectMatchesQuick', () => {
  it('all matches any non-archived subject', () => {
    const d = makeData();
    expect(subjectMatchesQuick(d, 's1', 'all', NOW)).toBe(true);
    expect(subjectMatchesQuick(d, 's2', 'all', NOW)).toBe(true);
  });

  it('a status matches only subjects that contain a matching active topic', () => {
    const d = makeData();
    expect(subjectMatchesQuick(d, 's1', 'overdue', NOW)).toBe(true);
    expect(subjectMatchesQuick(d, 's2', 'overdue', NOW)).toBe(false);
    expect(subjectMatchesQuick(d, 's2', 'not-revised', NOW)).toBe(true);
  });

  it('ignores topics under an archived chapter (non-cascading archive)', () => {
    const d = makeData();
    d.chapters.c1.archivedAt = NOW; // archives the chapter holding the overdue topic
    expect(subjectMatchesQuick(d, 's1', 'overdue', NOW)).toBe(false);
  });
});

describe('subjectQuickCounts', () => {
  it('counts matching subjects per filter, with all = every non-archived subject', () => {
    const counts = subjectQuickCounts(makeData(), NOW);
    expect(counts.all).toBe(2);
    expect(counts.overdue).toBe(1);
    expect(counts['not-revised']).toBe(1);
    expect(counts.due).toBe(0);
    expect(counts.bookmarked).toBe(0);
    expect(QUICK_FILTERS.every((k) => k in counts)).toBe(true);
  });
});

describe('topicQuickCounts', () => {
  it('counts topics per quick filter', () => {
    const topics = [
      topic('a', 'c1'),                                  // never revised
      topic('b', 'c1', { bookmarkedAt: NOW }),           // bookmarked, never revised
      topic('c', 'c1', dueExtra),                        // planned today => due
    ];
    const counts = topicQuickCounts(topics, NOW);
    expect(counts.all).toBe(3);
    expect(counts['not-revised']).toBe(2);
    expect(counts.bookmarked).toBe(1);
    expect(counts.due).toBe(1);
  });

  it('returns all-zero counts for an empty list', () => {
    const counts = topicQuickCounts([], NOW);
    for (const k of QUICK_FILTERS) expect(counts[k]).toBe(0);
  });
});
