import { describe, it, expect } from 'vitest';
import type { AppData } from '@revision-app/shared';
import { activeTopics } from './topics';

function baseTopic(id: string, chapterId: string, archivedAt?: number) {
  return {
    id,
    chapterId,
    title: id,
    notes: '',
    order: 0,
    difficulty: 'Medium' as const,
    priority: 'Medium' as const,
    revisionHistory: [],
    createdAt: 0,
    updatedAt: 0,
    ...(archivedAt !== undefined ? { archivedAt } : {}),
  };
}

function fixture(): AppData {
  return {
    subjectOrder: ['s1', 's2'],
    subjects: {
      s1: { id: 's1', name: 'S1', color: '#000', icon: 'X', order: 0, chapterIds: ['c1', 'c2'] },
      s2: { id: 's2', name: 'S2 (archived)', color: '#000', icon: 'X', order: 1, chapterIds: ['c3'], archivedAt: 1 },
    },
    chapters: {
      c1: { id: 'c1', subjectId: 's1', name: 'C1', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] },
      c2: { id: 'c2', subjectId: 's1', name: 'C2 (archived)', order: 1, difficulty: 'Medium', priority: 'Medium', topicIds: ['t3'], archivedAt: 1 },
      c3: { id: 'c3', subjectId: 's2', name: 'C3', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t4'] },
    },
    topics: {
      t1: baseTopic('t1', 'c1'), // plain, active
      t2: baseTopic('t2', 'c1', 1), // topic itself archived
      t3: baseTopic('t3', 'c2'), // chapter archived
      t4: baseTopic('t4', 'c3'), // subject archived
      t5: baseTopic('t5', 'missing-chapter'), // chapter missing from map
    },
    tags: {},
    tagOrder: [],
  };
}

describe('activeTopics', () => {
  it('includes a plain non-archived topic', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id)).toContain('t1');
  });

  it('excludes a topic with its own archivedAt', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id)).not.toContain('t2');
  });

  it('excludes a topic whose chapter is archived', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id)).not.toContain('t3');
  });

  it('excludes a topic whose subject is archived', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id)).not.toContain('t4');
  });

  it('excludes a topic whose chapter is missing from the map', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id)).not.toContain('t5');
  });

  it('returns exactly the active set', () => {
    const result = activeTopics(fixture());
    expect(result.map((t) => t.id).sort()).toEqual(['t1']);
  });
});
