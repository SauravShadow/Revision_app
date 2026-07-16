import { describe, it, expect } from 'vitest';
import type { AppData, Revision } from '@revision-app/shared';
import { currentStreak, longestStreak } from './streak';

const now = new Date(2026, 6, 15, 12, 0, 0).getTime(); // 2026-07-15
function at(y: number, m: number, d: number): number { return new Date(y, m, d, 10, 0, 0).getTime(); }

function data(history: Revision[], archived = false): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: history, createdAt: 0, updatedAt: 0, ...(archived ? { archivedAt: 1 } : {}) },
    },
    tags: {}, tagOrder: [],
  };
}
const rev = (ts: number, i = 0): Revision => ({ id: `r${ts}-${i}`, timestamp: ts });

describe('currentStreak', () => {
  it('is 0 with no history', () => expect(currentStreak(data([]), now)).toBe(0));

  it('counts consecutive days ending today', () => {
    const h = [rev(at(2026, 6, 13)), rev(at(2026, 6, 14)), rev(at(2026, 6, 15))];
    expect(currentStreak(data(h), now)).toBe(3);
  });

  it('still counts when the most recent day is yesterday (today not yet revised)', () => {
    const h = [rev(at(2026, 6, 13)), rev(at(2026, 6, 14))];
    expect(currentStreak(data(h), now)).toBe(2);
  });

  it('breaks when the last revision is older than yesterday', () => {
    const h = [rev(at(2026, 6, 10)), rev(at(2026, 6, 11))];
    expect(currentStreak(data(h), now)).toBe(0);
  });

  it('ignores archived topics', () => {
    const h = [rev(at(2026, 6, 15))];
    expect(currentStreak(data(h, true), now)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest historical run', () => {
    const h = [
      rev(at(2026, 6, 1), 1), rev(at(2026, 6, 2), 2),                 // run of 2
      rev(at(2026, 6, 10), 3), rev(at(2026, 6, 11), 4), rev(at(2026, 6, 12), 5), // run of 3
    ];
    expect(longestStreak(data(h))).toBe(3);
  });

  it('is 0 with no history', () => expect(longestStreak(data([]))).toBe(0));
});
