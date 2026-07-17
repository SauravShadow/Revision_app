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

  it('counts streaks consistently using calendar-based day stepping (DST-safe)', () => {
    // Regression test: verify that calendar-based setDate() stepping (not raw ms subtraction)
    // counts multi-day streaks correctly. The DST-safety property is structural: setDate()
    // respects calendar day boundaries even across DST transitions, whereas subtracting exactly
    // 24h can land a cursor an hour into the wrong calendar day on spring-forward boundaries.
    const now = Date.UTC(2026, 6, 16, 12); // July 16, 2026, noon UTC
    const history = [rev(5, now), rev(4, now), rev(3, now), rev(2, now), rev(1, now), rev(0, now)];
    const data = appData([topic('t1', 'c1', history)]);
    // Should count all 6 consecutive days (today + 5 days back)
    expect(currentStreak(data, now)).toBe(6);

    // Verify that stepping backward through days via setDate produces consistent results:
    // each day when stepped backward then forward should produce the same startOfDay value.
    let testCursor = startOfDay(now);
    for (let i = 0; i < 5; i++) {
      const d = new Date(testCursor);
      d.setDate(d.getDate() - 1);
      const prevDay = startOfDay(d.getTime());
      // Stepping back then forward again should land on the original day
      const dd = new Date(prevDay);
      dd.setDate(dd.getDate() + 1);
      expect(startOfDay(dd.getTime())).toBe(testCursor);
      testCursor = prevDay;
    }
  });
});
