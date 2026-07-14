import { describe, it, expect } from 'vitest';
import { search } from './search';
import type { AppData } from '@/lib/domain/types';

function data(): AppData {
  return {
    subjectOrder: ['s1'],
    subjects: { s1: { id: 's1', name: 'Fluid Mechanics', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
    chapters: { c1: { id: 'c1', subjectId: 's1', name: 'Pipe Flow', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
    topics: {
      t1: { id: 't1', chapterId: 'c1', title: 'Bernoulli Equation', notes: 'energy conservation', order: 0, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
      t2: { id: 't2', chapterId: 'c1', title: 'Reynolds Number', notes: 'mentions bernoulli in passing', order: 1, difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0 },
    },
    tags: { g1: { id: 'g1', name: 'Formula', color: '#000', icon: 'Sigma', order: 0 } },
    tagOrder: ['g1'],
  };
}

describe('search', () => {
  it('returns nothing for an empty query', () => {
    expect(search('', data())).toEqual([]);
  });
  it('ranks a title match above a notes-only match', () => {
    const res = search('bernoulli', data());
    const ids = res.filter((r) => r.kind === 'topic').map((r) => r.id);
    expect(ids[0]).toBe('t1'); // title match beats t2's notes mention
    expect(ids).toContain('t2');
  });
  it('finds subjects, chapters, and tags', () => {
    expect(search('fluid', data()).some((r) => r.kind === 'subject')).toBe(true);
    expect(search('pipe', data()).some((r) => r.kind === 'chapter')).toBe(true);
    const tag = search('formula', data()).find((r) => r.kind === 'tag');
    expect(tag?.href).toBe('/filtered');
  });
  it('excludes archived entities', () => {
    const d = data();
    d.topics.t1.archivedAt = 1;
    expect(search('bernoulli', d).some((r) => r.id === 't1')).toBe(false);
  });
});
