import { describe, it, expect } from 'vitest';
import { emptyHistory, record, undo, redo, MAX_HISTORY } from './history';

describe('history', () => {
  it('record pushes prev onto past and clears future', () => {
    const h = { past: [1], future: [9] };
    expect(record(h, 2)).toEqual({ past: [1, 2], future: [] });
  });

  it('undo returns null on empty past', () => {
    expect(undo(emptyHistory<number>(), 5)).toBeNull();
  });

  it('undo moves present to future and pops past', () => {
    const h = { past: [1, 2], future: [] as number[] };
    const res = undo(h, 3);
    expect(res).toEqual({ history: { past: [1], future: [3] }, present: 2 });
  });

  it('redo is the mirror of undo', () => {
    const h = { past: [1], future: [3] };
    const res = redo(h, 2);
    expect(res).toEqual({ history: { past: [1, 2], future: [] }, present: 3 });
  });

  it('record caps depth at MAX_HISTORY', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < MAX_HISTORY + 10; i++) h = record(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(10); // oldest 10 dropped
  });
});
