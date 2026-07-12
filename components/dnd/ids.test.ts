import { describe, it, expect } from 'vitest';
import { dragId, nodeId, parseId } from './ids';

describe('dnd ids', () => {
  it('round-trips a draggable id', () => {
    expect(parseId(dragId('topic', 'abc'))).toEqual({ kind: 'topic', id: 'abc' });
  });
  it('round-trips a tree node id', () => {
    expect(parseId(nodeId('chapter', 'xyz'))).toEqual({ kind: 'chapter-node', id: 'xyz' });
  });
  it('keeps ids containing colons intact', () => {
    expect(parseId(dragId('subject', 'a:b:c'))).toEqual({ kind: 'subject', id: 'a:b:c' });
  });
});
