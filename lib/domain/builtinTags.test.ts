import { describe, it, expect } from 'vitest';
import { BUILTIN_TAGS, makeBuiltinTags, withBuiltinTagsIfMissing } from './builtinTags';
import type { AppData } from './types';

const emptyData = (): AppData => ({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });

describe('builtin tags', () => {
  it('makeBuiltinTags returns one tag per builtin with matching order', () => {
    const { tags, tagOrder } = makeBuiltinTags();
    expect(tagOrder).toHaveLength(BUILTIN_TAGS.length);
    expect(Object.keys(tags)).toHaveLength(BUILTIN_TAGS.length);
    expect(tagOrder.map((id) => tags[id].name)).toEqual(BUILTIN_TAGS.map((t) => t.name));
  });
  it('backfills built-ins only when tagOrder is absent', () => {
    const old = emptyData(); // no tagOrder field
    expect(withBuiltinTagsIfMissing(old).tagOrder).toHaveLength(BUILTIN_TAGS.length);
    const emptied: AppData = { ...emptyData(), tags: {}, tagOrder: [] };
    expect(withBuiltinTagsIfMissing(emptied).tagOrder).toEqual([]); // user emptied — untouched
  });
});
