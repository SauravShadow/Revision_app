import { describe, it, expect } from 'vitest';
import { makeId } from './id';

describe('makeId', () => {
  it('returns a non-empty string', () => {
    expect(typeof makeId()).toBe('string');
    expect(makeId().length).toBeGreaterThan(0);
  });
  it('returns unique values', () => {
    expect(makeId()).not.toBe(makeId());
  });
});
