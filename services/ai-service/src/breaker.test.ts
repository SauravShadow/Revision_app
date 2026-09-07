import { describe, it, expect, beforeEach } from 'vitest';
import { isOpen, trip, reset, COOL_OFF_MS } from './breaker';

beforeEach(() => { reset(); });

describe('provider circuit breaker', () => {
  it('is closed initially', () => {
    expect(isOpen()).toBe(false);
  });

  it('opens once tripped', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now)).toBe(true);
  });

  it('stays open for the whole cool-off window', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now + COOL_OFF_MS - 1)).toBe(true);
  });

  it('closes itself once the window elapses', () => {
    const now = 1_000_000;
    trip(now);
    expect(isOpen(now + COOL_OFF_MS)).toBe(false);
  });

  it('re-tripping extends the window', () => {
    trip(1_000_000);
    trip(1_000_000 + COOL_OFF_MS - 1);
    expect(isOpen(1_000_000 + COOL_OFF_MS + 1)).toBe(true);
  });
});
