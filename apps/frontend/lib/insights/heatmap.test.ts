import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { revisionCountsByDay } from './heatmap';

// Local-time anchors so start-of-day math is timezone-stable.
const now = new Date(2026, 6, 15, 12, 0, 0).getTime();     // 2026-07-15 noon
const today = new Date(2026, 6, 15, 22, 0, 0).getTime();   // same day, 10pm
const twoDaysAgo = new Date(2026, 6, 13, 9, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r1', timestamp: today }, { id: 'r2', timestamp: twoDaysAgo }], createdAt: 0, updatedAt: today },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'r3', timestamp: today }], createdAt: 0, updatedAt: today, archivedAt: 1 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('revisionCountsByDay', () => {
  it('returns one dense entry per day, oldest to newest', () => {
    const out = revisionCountsByDay(fixture(), 7, now);
    expect(out).toHaveLength(7);
    expect(out[0].day).toBeLessThan(out[6].day);
    expect(out[6].day).toBe(new Date(2026, 6, 15).getTime()); // last entry is today
  });

  it('buckets a late-evening revision on its local day and excludes archived topics', () => {
    const out = revisionCountsByDay(fixture(), 7, now);
    const byDay = new Map(out.map((d) => [d.day, d.count]));
    expect(byDay.get(new Date(2026, 6, 15).getTime())).toBe(1); // t1 today only (t2 archived)
    expect(byDay.get(new Date(2026, 6, 13).getTime())).toBe(1); // t1 two days ago
    expect(byDay.get(new Date(2026, 6, 14).getTime())).toBe(0); // zero-count day present
  });
});
