import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { overallStats, topicsByRevisionCount } from './rankings';

const now = new Date(2026, 6, 15, 12, 0, 0).getTime();
const day = (d: number) => new Date(2026, 6, d, 10, 0, 0).getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1', 's2'],
    subjects: {
      s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] },
      s2: { id: 's2', name: 'S2 (archived)', color: '#000', icon: 'X', order: 1, chapterIds: ['c2'], archivedAt: 1 },
    },
    chapters: {
      c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2', 't3'] },
      c2: { id: 'c2', subjectId: 's2', name: 'C2', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t4'] },
    },
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
      // parent subject archived (non-cascading), topic itself has no archivedAt
      t4: { id: 't4', chapterId: 'c2', title: 'D', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium',
        revisionHistory: [{ id: 'd1', timestamp: day(14) }, { id: 'd2', timestamp: day(14) }, { id: 'd3', timestamp: day(14) }], createdAt: 0, updatedAt: 0 },
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

  it('excludes a topic whose parent subject is archived, even though the topic itself is not', () => {
    const s = overallStats(fixture(), now);
    // t4 has 3 revisions; if it leaked in, totalTopics would be 4 and avgRevisionsPerTopic would rise.
    expect(s.totalTopics).toBe(3);
    expect(s.avgRevisionsPerTopic).toBe(1);
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

  it('excludes a topic whose parent subject is archived, even though the topic itself is not', () => {
    const { most } = topicsByRevisionCount(fixture());
    // t4 has 3 revisions (the highest count); if it leaked in it would rank first.
    expect(most.map((r) => r.topicId)).not.toContain('t4');
  });
});
