import { describe, it, expect } from 'vitest';
import {
  totalRevisions, lastRevisedAt, nextDueDate, daysSince,
  badgeState, relativeLabel, inGoodStanding, markRevised,
} from './engine';
import type { Topic, Revision } from '@/lib/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const at = (isoDay: string) => new Date(isoDay + 'T12:00:00Z').getTime();
const rev = (ts: number): Revision => ({ id: 'r', timestamp: ts });

const baseTopic = (history: Revision[]): Topic => ({
  id: 't', chapterId: 'c', title: 'X', notes: '', order: 0,
  difficulty: 'Medium', priority: 'Medium',
  revisionHistory: history, createdAt: 0, updatedAt: 0,
});

describe('engine counts', () => {
  it('totalRevisions and lastRevisedAt', () => {
    expect(totalRevisions([])).toBe(0);
    expect(lastRevisedAt([])).toBeUndefined();
    const h = [rev(100), rev(200)];
    expect(totalRevisions(h)).toBe(2);
    expect(lastRevisedAt(h)).toBe(200);
  });
});

describe('nextDueDate', () => {
  it('is undefined when never revised', () => {
    expect(nextDueDate([])).toBeUndefined();
  });
  it('adds the ladder interval after the last revision', () => {
    const now = at('2026-07-01');
    expect(nextDueDate([rev(now)])).toBe(now + 1 * DAY); // 1 revision -> 1 day
    expect(nextDueDate([rev(now), rev(now)])).toBe(now + 3 * DAY); // 2 -> 3 days
  });
});

describe('daysSince', () => {
  it('is undefined when never revised', () => {
    expect(daysSince([], at('2026-07-05'))).toBeUndefined();
  });
  it('counts whole days since last revision', () => {
    const last = at('2026-07-01');
    expect(daysSince([rev(last)], last + 3 * DAY)).toBe(3);
  });
});

describe('badgeState', () => {
  it('NeverRevised for empty history', () => {
    expect(badgeState([], at('2026-07-05'))).toBe('NeverRevised');
  });
  it('RecentlyRevised right after revising', () => {
    const now = at('2026-07-05');
    expect(badgeState([rev(now)], now)).toBe('RecentlyRevised');
  });
  it('DueToday when the due date is today', () => {
    const last = at('2026-07-01');           // 1 revision -> due +1 day
    expect(badgeState([rev(last)], at('2026-07-02'))).toBe('DueToday');
  });
  it('Overdue when past the due date', () => {
    const last = at('2026-07-01');
    expect(badgeState([rev(last)], at('2026-07-10'))).toBe('Overdue');
  });
  it('DueTomorrow one day before due', () => {
    const last = at('2026-07-01');           // 2 revisions -> due +3 days = Jul 4
    expect(badgeState([rev(last), rev(last)], at('2026-07-03'))).toBe('DueTomorrow');
  });
});

describe('relativeLabel', () => {
  it('Today / Yesterday / N days ago', () => {
    const now = at('2026-07-10');
    expect(relativeLabel(now, now)).toBe('Today');
    expect(relativeLabel(now - 1 * DAY, now)).toBe('Yesterday');
    expect(relativeLabel(now - 3 * DAY, now)).toBe('3 days ago');
    expect(relativeLabel(now - 8 * DAY, now)).toBe('1 week ago');
  });
});

describe('inGoodStanding', () => {
  it('false when overdue, due today, or never revised', () => {
    const last = at('2026-07-01');
    expect(inGoodStanding([], at('2026-07-05'))).toBe(false);
    expect(inGoodStanding([rev(last)], at('2026-07-10'))).toBe(false);
    expect(inGoodStanding([rev(last)], at('2026-07-01'))).toBe(true);
  });
});

describe('markRevised', () => {
  it('appends a revision and bumps updatedAt without mutating input', () => {
    const now = at('2026-07-05');
    const t = baseTopic([]);
    const next = markRevised(t, now);
    expect(t.revisionHistory).toHaveLength(0);      // input untouched
    expect(next.revisionHistory).toHaveLength(1);
    expect(next.revisionHistory[0].timestamp).toBe(now);
    expect(next.updatedAt).toBe(now);
  });
});
