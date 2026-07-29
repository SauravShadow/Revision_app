import { describe, it, expect } from 'vitest';
import {
  LADDER, DAY_MS, nextInterval, nextDueDate, suggestedNextDate, badgeState, activeTopics, currentStreak, startOfDay,
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

  it('suggestedNextDate keeps the ladder math from the last revision', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const h = [rev(2, now)]; // 1 revision → +1 day interval, so suggested yesterday
    expect(suggestedNextDate(h)).toBe(now - 2 * DAY_MS + 1 * DAY_MS);
    expect(suggestedNextDate([rev(2, now), rev(1, now)])).toBe(now - 1 * DAY_MS + 3 * DAY_MS); // 2 revs → +3d
    expect(suggestedNextDate([])).toBeUndefined();
  });

  it('classifies badge states against the planned date', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const h = [rev(10, now)];
    expect(badgeState({ revisionHistory: [] }, now)).toBe('NeverRevised');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(now - DAY_MS) }, now)).toBe('Overdue');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(now) }, now)).toBe('DueToday');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(now + DAY_MS) }, now)).toBe('DueTomorrow');
    expect(badgeState({ revisionHistory: h, plannedAt: startOfDay(now + 5 * DAY_MS) }, now)).toBe('Upcoming');
  });

  it('nextDueDate returns plannedAt and ignores the ladder', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const planned = startOfDay(now + 5 * DAY_MS);
    expect(nextDueDate({ revisionHistory: [rev(1, now)], plannedAt: planned })).toBe(planned);
  });

  it('nextDueDate returns undefined when plannedAt is null or undefined', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(nextDueDate({ revisionHistory: [rev(1, now)], plannedAt: null })).toBeUndefined();
    expect(nextDueDate({ revisionHistory: [rev(1, now)] })).toBeUndefined();
  });

  it('distinguishes NeverRevised from Unplanned', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(badgeState({ revisionHistory: [], plannedAt: null }, now)).toBe('NeverRevised');
    expect(badgeState({ revisionHistory: [rev(3, now)], plannedAt: null }, now)).toBe('Unplanned');
    expect(badgeState({ revisionHistory: [rev(3, now)] }, now)).toBe('Unplanned');
  });

  it('returns RecentlyRevised when revised within a day and planned ahead', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(badgeState({ revisionHistory: [rev(1, now)], plannedAt: startOfDay(now + 7 * DAY_MS) }, now)).toBe('RecentlyRevised');
  });

  it('rates a planned but never-revised topic by its plan, not NeverRevised', () => {
    const now = Date.UTC(2026, 6, 16, 12);
    expect(badgeState({ revisionHistory: [], plannedAt: startOfDay(now) }, now)).toBe('DueToday');
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
    // US Eastern spring-forward: 2026-03-08 (clocks jump from 2:00 AM EST to 3:00 AM EDT; UTC-5 becomes UTC-4).
    // The old anchor check `days.has(today - DAY_MS)` does raw UTC timestamp subtraction (24h = 86.4M ms).
    // This fails to account for calendar day boundaries when DST transitions occurs: subtracting 24 hours
    // from midnight EDT March 9 (2026-03-09T04:00:00Z) gives 2026-03-08T04:00:00Z, but that UTC time
    // corresponds to midnight EDT March 8 only if the entire day of March 8 is in EDT—not true when the
    // day spans both EST and EDT. The fix uses stepDayBack(), which correctly steps back one calendar day
    // in local time (respecting DST rules) then snaps to midnight, ensuring anchor matches startOfDay(revision).

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
      if (originalTZ === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTZ;
      }
    }
  });
});
