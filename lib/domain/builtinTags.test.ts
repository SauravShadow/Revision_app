import { describe, it, expect } from 'vitest';
import { BUILTIN_TAGS, makeBuiltinTags } from './builtinTags';

describe('builtin tags', () => {
  it('makeBuiltinTags returns one tag per builtin with matching order', () => {
    const { tags, tagOrder } = makeBuiltinTags();
    expect(tagOrder).toHaveLength(BUILTIN_TAGS.length);
    expect(Object.keys(tags)).toHaveLength(BUILTIN_TAGS.length);
    expect(tagOrder.map((id) => tags[id].name)).toEqual(BUILTIN_TAGS.map((t) => t.name));
  });
});
