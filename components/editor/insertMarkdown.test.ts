import { describe, it, expect } from 'vitest';
import { wrapSelection, insertAt } from './insertMarkdown';

describe('insert helpers', () => {
  it('wrapSelection wraps the selected range', () => {
    const r = wrapSelection('abc', 0, 3, '**'); // "abc" -> "**abc**"
    expect(r.text).toBe('**abc**');
    expect(r.cursor).toBe(5);
  });
  it('wrapSelection with no selection inserts the markers with caret between', () => {
    const r = wrapSelection('ab', 2, 2, '**');
    expect(r.text).toBe('ab****');
    expect(r.cursor).toBe(4);
  });
  it('insertAt inserts a block snippet at the caret', () => {
    const r = insertAt('ab', 2, '\n```\ncode\n```\n');
    expect(r.text).toBe('ab\n```\ncode\n```\n');
    expect(r.cursor).toBe(r.text.length);
  });
});
