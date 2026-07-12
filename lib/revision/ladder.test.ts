import { describe, it, expect } from 'vitest';
import { LADDER, nextInterval } from './ladder';

describe('nextInterval', () => {
  it('returns first step for a never-revised topic', () => {
    expect(nextInterval(0)).toBe(1);
  });
  it('walks the ladder by revision count', () => {
    expect(nextInterval(1)).toBe(1);
    expect(nextInterval(2)).toBe(3);
    expect(nextInterval(3)).toBe(7);
  });
  it('clamps to the last ladder step', () => {
    expect(nextInterval(999)).toBe(LADDER[LADDER.length - 1]);
    expect(nextInterval(999)).toBe(90);
  });
});
