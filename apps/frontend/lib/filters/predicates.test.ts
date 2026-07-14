import { describe, it, expect } from 'vitest';
import { topicMatchesFilters, hasActiveFilters, matchingTopics } from './predicates';
import type { AppData, Topic } from '@revision-app/shared';

const now = new Date('2026-07-10T12:00:00Z').getTime();

const topic = (over: Partial<Topic>): Topic => ({
  id: 't', chapterId: 'c', title: 'T', notes: '', order: 0,
  difficulty: 'Medium', priority: 'Medium', revisionHistory: [], createdAt: 0, updatedAt: 0, ...over,
});

describe('filter predicates', () => {
  it('hasActiveFilters reflects any active chip', () => {
    expect(hasActiveFilters({ tagIds: [], statuses: [] })).toBe(false);
    expect(hasActiveFilters({ tagIds: ['x'], statuses: [] })).toBe(true);
  });

  it('never-revised status matches an unrevised topic', () => {
    expect(topicMatchesFilters(topic({}), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(true);
    expect(topicMatchesFilters(topic({ revisionHistory: [{ id: 'r', timestamp: now }] }), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('AND semantics across a tag and a status', () => {
    const t = topic({ tagIds: ['formula'] });
    expect(topicMatchesFilters(t, { tagIds: ['formula'], statuses: ['never-revised'] }, now)).toBe(true);
    expect(topicMatchesFilters(t, { tagIds: ['other'], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('archived topics never match', () => {
    expect(topicMatchesFilters(topic({ archivedAt: 1 }), { tagIds: [], statuses: ['never-revised'] }, now)).toBe(false);
  });

  it('matchingTopics returns matches with context, scoped optionally', () => {
    const data: AppData = {
      subjectOrder: ['s1'],
      subjects: { s1: { id: 's1', name: 'S', color: '#000', icon: 'X', order: 0, chapterIds: ['c1'] } },
      chapters: { c1: { id: 'c1', subjectId: 's1', name: 'C', order: 0, difficulty: 'Medium', priority: 'Medium', topicIds: ['t1', 't2'] } },
      topics: {
        t1: topic({ id: 't1', chapterId: 'c1', attachments: [{ id: 'a1', name: 'f.png', kind: 'image', url: '/api/files/a1', createdAt: 1 }] }),
        t2: topic({ id: 't2', chapterId: 'c1' }),
      },
      tags: {},
      tagOrder: [],
    };
    const res = matchingTopics(data, { tagIds: [], statuses: ['has-attachments'] }, now);
    expect(res).toHaveLength(1);
    expect(res[0].topic.id).toBe('t1');
    expect(res[0].subject?.id).toBe('s1');
    expect(matchingTopics(data, { tagIds: [], statuses: ['has-attachments'] }, now, { chapterId: 'cX' })).toHaveLength(0);
  });
});
