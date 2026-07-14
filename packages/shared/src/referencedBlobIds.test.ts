import { describe, it, expect } from 'vitest';
import { referencedBlobIds } from './referencedBlobIds';
import type { AppData } from './types';

function emptyData(): AppData {
  return { subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] };
}

describe('referencedBlobIds', () => {
  it('returns an empty set for null data', () => {
    expect(referencedBlobIds(null)).toEqual(new Set());
  });

  it('collects ids from attachment URLs matching /api/files/<id>', () => {
    const data = emptyData();
    data.topics['t1'] = {
      id: 't1', chapterId: 'c1', title: 'Topic', notes: '', order: 0,
      difficulty: 'Easy', priority: 'Low', revisionHistory: [], createdAt: 0, updatedAt: 0,
      attachments: [
        { id: 'a1', name: 'x.png', kind: 'image', url: '/api/files/blob-1', createdAt: 0 },
        { id: 'a2', name: 'ext', kind: 'link', url: 'https://example.com/x', createdAt: 0 },
      ],
    };
    expect(referencedBlobIds(data)).toEqual(new Set(['blob-1']));
  });
});
