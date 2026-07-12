import { describe, it, expect } from 'vitest';
import { chapterProgress, subjectProgress } from './progress';
import type { AppData } from '@/lib/domain/types';

const now = new Date('2026-07-10T12:00:00Z').getTime();

function fixture(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'A', notes: '', order: 0, difficulty: 'Medium', priority: 'Medium', revisionHistory: [{ id: 'r', timestamp: now }], createdAt: 0, updatedAt: now },
      t2: { id: 't2', chapterId: 'c1', title: 'B', notes: '', order: 1, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
  };
}

describe('progress', () => {
  it('chapterProgress = % of topics in good standing', () => {
    // t1 revised now (good), t2 never revised (not good) -> 50%
    expect(chapterProgress(fixture(), 'c1', now)).toBe(50);
  });
  it('empty chapter is 0%', () => {
    const data = fixture();
    data.chapters.c1.topicIds = [];
    expect(chapterProgress(data, 'c1', now)).toBe(0);
  });
  it('subjectProgress averages its chapters', () => {
    expect(subjectProgress(fixture(), 's1', now)).toBe(50);
  });
});
