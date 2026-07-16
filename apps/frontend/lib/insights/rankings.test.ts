import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { overallStats, topicsByRevisionCount } from './rankings';

const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
const day = (d: number) => new Date(2026, 6, d, 10, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2', 't3'] } },
    topics: {
      // revised twice, most recently day 14 -> in good standing
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'a1', timestamp: day(12) }, { id: 'a2', timestamp: day(14) }], createdAt: 0, updatedAt: 0 },
      // revised once
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'b1', timestamp: day(14) }], createdAt: 0, updatedAt: 0 },
      // never revised
      t3: { id: 't3', chapterId: 'c1', title: 'C', notes: '', order: 2, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
    tags: {}, tagOrder: [],
  };
}

describe('overallStats', () => {
  it('reports totals, never-revised, and averages', () => {
    const s = overallStats(fixture(), now);
    expect(s.totalTopics).toBe(3);
    expect(s.neverRevised).toBe(1);
    expect(s.avgRevisionsPerTopic).toBe(1); // (2 + 1 + 0) / 3
    expect(s.avgDaysBetween).toBe(2);       // only t1 has a gap: day14 - day12 = 2 days
  });

  it('is all zeros for empty data', () => {
    const empty: AppData = { subjectOrder: [], subjects: {}, chapters: {}, topics: {}, tags: {}, tagOrder: [] };
    const s = overallStats(empty, now);
    expect(s.totalTopics).toBe(0);
    expect(s.completionPct).toBe(0);
    expect(s.avgDaysBetween).toBeUndefined();
  });
});

describe('topicsByRevisionCount', () => {
  it('ranks most by count desc and excludes never-revised from least', () => {
    const { most, least } = topicsByRevisionCount(fixture());
    expect(most.map((r) => r.topicId)).toEqual(['t1', 't2', 't3']); // desc by count; t3 (count 0) sorts last but is still listed
    expect(most[0].topicId).toBe('t1');
    expect(least.map((r) => r.topicId)).toEqual(['t2', 't1']); // ascending by count; t3 excluded (never revised)
    expect(least.every((r) => r.count > 0)).toBe(true);
    expect(most[0].subjectId).toBe('s1');
  });
});
