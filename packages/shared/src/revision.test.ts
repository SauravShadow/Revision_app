import { describe, it, expect } from 'vitest';
import {
  LADDER, DAY_MS, nextInterval, nextDueDate, badgeState, activeTopics, currentStreak, startOfDay,
} from './revision';
import type { AppData, Revision, Topic } from './types';

const rev = (daysAgo: number, now: number): Revision => ({ id: `r${daysAgo}`, timestamp: now - daysAgo * DAY_MS });

function topic(id: string, chapterId: string, history: Revision[], archivedAt?: number): Topic {
  return {
    id, chapterId, title: id, notes: '', order: 0, difficulty: 'Easy', priority: 'Low',
    revisionHistory: history, createdAt: 0, updatedAt: 0, ...(archivedAt ? { archivedAt } : {}),
  };
}

function appData(topics: Topic[]): AppData {
  return {
    subjects: { s1: { id: 's1', name: 'Soil', color: '', icon: '', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Ch1', order: 0, difficulty: 'Easy', priority: 'Low', topicIds: topics.map((t) => t.id) } },
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
    subjectOrder: ['s1'], tags: {}, tagOrder: [],
  };
}

describe('revision math', () => {
  it('walks the interval ladder', () => {
    expect(nextInterval(0)).toBe(LADDER[0]);
    expect(nextInterval(1)).toBe(1);
    expect(nextInterval(2)).toBe(3);
    expect(nextInterval(99)).toBe(90);
  });

  it('computes next due date from the last revision', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const h = [rev(2, now)]; // 1 revision → +1 day interval, so due yesterday
    expect(nextDueDate(h)).toBe(now - 2 * DAY_MS + 1 * DAY_MS);
  });

  it('classifies badge states', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(badgeState([], now)).toBe('NeverRevised');
    expect(badgeState([rev(3, now)], now)).toBe('Overdue');   // due 2 days ago
    expect(badgeState([rev(1, now)], now)).toBe('DueToday');  // 1 rev, +1d
  });

  it('activeTopics skips archived topics, chapters, and subjects', () => {
    const now = Date.now();
    const data = appData([topic('t1', 'c1', []), topic('t2', 'c1', [], now)]);
    expect(activeTopics(data).map((t) => t.id)).toEqual(['t1']);
    data.chapters.c1.archivedAt = now;
    expect(activeTopics(data)).toEqual([]);
  });

  it('counts a streak of consecutive revised days ending today or yesterday', () => {
    const now = Date.now();
    const data = appData([topic('t1', 'c1', [rev(2, now), rev(1, now), rev(0, now)])]);
    expect(currentStreak(data, now)).toBe(3);
    const stale = appData([topic('t1', 'c1', [rev(5, now)])]);
    expect(currentStreak(stale, now)).toBe(0);
  });

  it('counts streaks correctly across a DST boundary (spring-forward)', () => {
    // Regression test for DST-unsafe anchor check bug.
    // US Eastern spring-forward: 2026-03-08 (clocks jump from 2:00 AM EST to 3:00 AM EDT at UTC-5 to UTC-4).
    // The old anchor check `days.has(today - DAY_MS)` is vulnerable:
    // - today (March 9) = 2026-03-09 00:00:00 EDT (UTC-4) = 2026-03-09T04:00:00Z
    // - today - DAY_MS = 2026-03-09T04:00:00Z - 24h = 2026-03-08T04:00:00Z
    // - When interpreted in local time: 2026-03-08T04:00:00Z is 01:00 AM EST (UTC-5, before the 2 AM transition)
    // - startOfDay(today - DAY_MS) would set hours to 0, yielding 2026-03-08T00:00:00 EST = 2026-03-08T05:00:00Z
    // - But the actual revision's startOfDay on March 8 is 00:00 EDT = 04:00 UTC (after interpreting with the correct EDT offset)
    // - These don't match, so the old code would fail to find yesterday and incorrectly return 0.
    // The fixed code uses stepDayBack() which respects calendar day boundaries and correctly finds the revision.

    // Save original TZ and restore it after the test
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';

      // Create a revision on 2026-03-08 (the DST transition day), at a time well after 3 AM EDT
      // to ensure it's unambiguously in the post-transition period
      const marchEightRevisionTime = new Date('2026-03-08T15:00:00').getTime(); // 3 PM local on March 8
      const marchNineNoon = new Date('2026-03-09T12:00:00').getTime(); // Noon on March 9

      const data = appData([topic('t1', 'c1', [{ id: 'r1', timestamp: marchEightRevisionTime }])]);
      const streak = currentStreak(data, marchNineNoon);

      // The streak should be 1 (yesterday's single revision should be counted).
      // With the old buggy anchor check `days.has(today - DAY_MS)`, this would incorrectly return 0.
      expect(streak).toBe(1);
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
