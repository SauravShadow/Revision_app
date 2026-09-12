import { describe, it, expect } from 'vitest';
import { appDataSchema } from './schema';

// Zod strips unknown keys, and content-service persists `parsed.data`, not
// `req.body`. Any field missing from these schemas is silently dropped on the
// way to Postgres while every other test still passes. These round-trips are
// the guard: add a field to the types, add it here.
function appData(topic: Record<string, unknown>) {
  return {
    subjects: {}, chapters: {}, subjectOrder: [], tags: {}, tagOrder: [],
    topics: {
      t1: {
        id: 't1', chapterId: 'c1', title: 'T', notes: '', order: 0,
        difficulty: 'Easy', priority: 'Low', revisionHistory: [],
        createdAt: 0, updatedAt: 0, ...topic,
      },
    },
  };
}

describe('appDataSchema round-trip', () => {
  it('preserves a quiz score on a revision', () => {
    const parsed = appDataSchema.parse(appData({
      revisionHistory: [{ id: 'r1', timestamp: 1, score: { correct: 3, total: 5 } }],
    }));
    expect(parsed.topics.t1.revisionHistory[0]).toEqual({
      id: 'r1', timestamp: 1, score: { correct: 3, total: 5 },
    });
  });

  it('preserves flashcard provenance', () => {
    const parsed = appDataSchema.parse(appData({
      flashcards: [{ id: 'f1', front: 'Q', back: 'A', createdAt: 0, source: 'generated' }],
    }));
    expect(parsed.topics.t1.flashcards?.[0]).toEqual({
      id: 'f1', front: 'Q', back: 'A', createdAt: 0, source: 'generated',
    });
  });

  it('accepts a manual source', () => {
    const parsed = appDataSchema.parse(appData({
      flashcards: [{ id: 'f1', front: 'Q', back: 'A', createdAt: 0, source: 'manual' }],
    }));
    expect(parsed.topics.t1.flashcards?.[0].source).toBe('manual');
  });

  it('still parses legacy records and invents no keys for them', () => {
    const parsed = appDataSchema.parse(appData({
      revisionHistory: [{ id: 'r1', timestamp: 1 }],
      flashcards: [{ id: 'f1', front: 'Q', back: 'A', createdAt: 0 }],
    }));
    expect(Object.keys(parsed.topics.t1.revisionHistory[0])).toEqual(['id', 'timestamp']);
    expect(Object.keys(parsed.topics.t1.flashcards![0])).toEqual(['id', 'front', 'back', 'createdAt']);
  });

  it('rejects a source outside the known vocabulary', () => {
    const result = appDataSchema.safeParse(appData({
      flashcards: [{ id: 'f1', front: 'Q', back: 'A', createdAt: 0, source: 'imported' }],
    }));
    expect(result.success).toBe(false);
  });
});
