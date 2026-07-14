import { describe, it, expect } from 'vitest';
import { normalizeData } from './normalize';

describe('normalizeData', () => {
  it('backfills built-in tags when tagOrder is absent (pre-tags snapshot)', () => {
    const out = normalizeData({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
    expect(out.tagOrder.length).toBeGreaterThan(0);
    expect(Object.keys(out.tags).sort()).toEqual([...out.tagOrder].sort());
  });

  it('keeps deliberately-emptied tags', () => {
    const out = normalizeData({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [], tags: {}, tagOrder: [] });
    expect(out.tagOrder).toEqual([]);
    expect(out.tags).toEqual({});
  });

  it('fills every missing collection on a degenerate payload', () => {
    const out = normalizeData({});
    expect(out.subjects).toEqual({});
    expect(out.chapters).toEqual({});
    expect(out.topics).toEqual({});
    expect(out.subjectOrder).toEqual([]);
  });

  it('returns a full AppData for null', () => {
    const out = normalizeData(null);
    expect(out.subjectOrder).toEqual([]);
    expect(out.tagOrder.length).toBeGreaterThan(0);
  });
});
