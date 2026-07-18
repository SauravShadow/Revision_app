import { it, expect, describe } from 'vitest';
import type { AppData, Topic } from '@revision-app/shared';
import { isPinnedTopic, pinnedFirst } from './pinned';

const topic = (id: string, extra: Partial<Topic> = {}): Topic =>
  ({ id, chapterId: 'c', title: id, priority: 'Medium', revisionHistory: [], ...extra }) as Topic;

describe('isPinnedTopic', () => {
  it('is true for bookmarked or high-priority topics', () => {
    expect(isPinnedTopic(topic('a', { bookmarkedAt: 1 }))).toBe(true);
    expect(isPinnedTopic(topic('b', { priority: 'High' }))).toBe(true);
    expect(isPinnedTopic(topic('c'))).toBe(false);
    expect(isPinnedTopic(topic('d', { priority: 'Low' }))).toBe(false);
  });
});

describe('pinnedFirst', () => {
  it('floats pinned topics to the top, preserving relative order within each group', () => {
    const topics: Record<string, Topic> = {
      a: topic('a'),
      b: topic('b', { bookmarkedAt: 1 }),
      c: topic('c'),
      d: topic('d', { priority: 'High' }),
    };
    // input order a,b,c,d -> pinned [b,d] first (in order), then rest [a,c]
    expect(pinnedFirst(['a', 'b', 'c', 'd'], topics as unknown as AppData['topics'])).toEqual(['b', 'd', 'a', 'c']);
  });

  it('is a no-op when nothing is pinned', () => {
    const topics = { a: topic('a'), b: topic('b') };
    expect(pinnedFirst(['a', 'b'], topics as unknown as AppData['topics'])).toEqual(['a', 'b']);
  });

  it('skips ids missing from the topics map', () => {
    const topics = { a: topic('a', { bookmarkedAt: 1 }) };
    expect(pinnedFirst(['a', 'ghost'], topics as unknown as AppData['topics'])).toEqual(['a', 'ghost']);
  });
});
