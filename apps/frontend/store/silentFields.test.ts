import { describe, it, expect } from 'vitest';
import { preserveSilentFields } from './silentFields';
import type { AppData, Topic } from '@revision-app/shared';

function topic(id: string, notes: string, revisions = 0): Topic {
  return {
    id, chapterId: 'c1', title: id, notes, order: 0,
    difficulty: 'Medium', priority: 'Medium',
    revisionHistory: Array.from({ length: revisions }, (_, i) => ({ id: `r${i}`, timestamp: i })),
    createdAt: 1, updatedAt: 1,
  };
}

function data(topics: Topic[]): AppData {
  return {
    subjects: {}, chapters: {}, subjectOrder: [], tags: {}, tagOrder: [],
    topics: Object.fromEntries(topics.map((t) => [t.id, t])),
  };
}

describe('preserveSilentFields', () => {
  it('keeps present notes and revisionHistory for topics in both states', () => {
    const restored = data([topic('t1', 'old', 0)]);
    const present = data([topic('t1', 'new typing', 2)]);
    const out = preserveSilentFields(restored, present);
    expect(out.topics.t1.notes).toBe('new typing');
    expect(out.topics.t1.revisionHistory).toHaveLength(2);
  });

  it('leaves topics untouched when absent from the present state', () => {
    const restored = data([topic('t1', 'old')]);
    const out = preserveSilentFields(restored, data([]));
    expect(out.topics.t1.notes).toBe('old');
  });

  it('does not resurrect topics deleted from the restored state', () => {
    const out = preserveSilentFields(data([]), data([topic('t1', 'x')]));
    expect(out.topics.t1).toBeUndefined();
  });
});
