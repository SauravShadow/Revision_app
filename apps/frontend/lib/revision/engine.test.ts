import { describe, it, expect } from 'vitest';
import {
  totalRevisions, lastRevisedAt, nextDueDate, suggestedNextDate, daysSince,
  badgeState, relativeLabel, inGoodStanding, markRevised,
  deleteRevision, updateRevisionTimestamp,
} from './engine';
import type { Topic, Revision } from '@revision-app/shared';

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
  it('is undefined without a plan, regardless of history', () => {
    expect(nextDueDate({ revisionHistory: [] })).toBeUndefined();
    expect(nextDueDate({ revisionHistory: [rev(at('2026-07-01'))], plannedAt: null })).toBeUndefined();
  });
  it('returns the planned date', () => {
    const now = at('2026-07-01');
    expect(nextDueDate({ revisionHistory: [rev(now)], plannedAt: now + 5 * DAY })).toBe(now + 5 * DAY);
  });
});

describe('suggestedNextDate', () => {
  it('adds the ladder interval after the last revision', () => {
    const now = at('2026-07-01');
    expect(suggestedNextDate([])).toBeUndefined();
    expect(suggestedNextDate([rev(now)])).toBe(now + 1 * DAY); // 1 revision -> 1 day
    expect(suggestedNextDate([rev(now), rev(now)])).toBe(now + 3 * DAY); // 2 -> 3 days
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
  it('NeverRevised for empty history without a plan', () => {
    expect(badgeState({ revisionHistory: [] }, at('2026-07-05'))).toBe('NeverRevised');
  });
  it('Unplanned for history without a plan', () => {
    const last = at('2026-07-01');
    expect(badgeState({ revisionHistory: [rev(last)], plannedAt: null }, at('2026-07-05'))).toBe('Unplanned');
  });
  it('RecentlyRevised right after revising with a plan ahead', () => {
    const now = at('2026-07-05');
    expect(badgeState({ revisionHistory: [rev(now)], plannedAt: now + 7 * DAY }, now)).toBe('RecentlyRevised');
  });
  it('DueToday when the planned date is today', () => {
    const last = at('2026-07-01');
    expect(badgeState({ revisionHistory: [rev(last)], plannedAt: at('2026-07-02') }, at('2026-07-02'))).toBe('DueToday');
  });
  it('Overdue when past the planned date', () => {
    const last = at('2026-07-01');
    expect(badgeState({ revisionHistory: [rev(last)], plannedAt: at('2026-07-02') }, at('2026-07-10'))).toBe('Overdue');
  });
  it('DueTomorrow one day before the planned date', () => {
    const last = at('2026-07-01');
    expect(badgeState({ revisionHistory: [rev(last), rev(last)], plannedAt: at('2026-07-04') }, at('2026-07-03'))).toBe('DueTomorrow');
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
  it('false when overdue, due today, never revised, or unplanned', () => {
    const last = at('2026-07-01');
    expect(inGoodStanding({ revisionHistory: [] }, at('2026-07-05'))).toBe(false);
    expect(inGoodStanding({ revisionHistory: [rev(last)], plannedAt: at('2026-07-02') }, at('2026-07-10'))).toBe(false);
    expect(inGoodStanding({ revisionHistory: [rev(last)], plannedAt: null }, at('2026-07-05'))).toBe(false);
    expect(inGoodStanding({ revisionHistory: [rev(last)], plannedAt: at('2026-07-08') }, at('2026-07-01'))).toBe(true);
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

  it('clears the plan — revising fulfils it', () => {
    const now = at('2026-07-05');
    const t = { ...baseTopic([]), plannedAt: now };
    expect(markRevised(t, now).plannedAt).toBeNull();
  });
});

describe('deleteRevision', () => {
  it('removes the entry with the given id and bumps updatedAt', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = deleteRevision(t, 'r1', 999);
    expect(out.revisionHistory).toEqual([{ id: 'r2', timestamp: 200 }]);
    expect(out.updatedAt).toBe(999);
  });

  it('returns the topic unchanged for an unknown id', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    expect(deleteRevision(t, 'nope', 999)).toBe(t);
  });

  it('deleting the latest entry shifts lastRevisedAt', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = deleteRevision(t, 'r2', 999);
    expect(lastRevisedAt(out.revisionHistory)).toBe(100);
  });

  it('deleting the only entry returns the topic to never-revised', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    const out = deleteRevision(t, 'r1', 999);
    expect(out.revisionHistory).toEqual([]);
    expect(lastRevisedAt(out.revisionHistory)).toBeUndefined();
  });
});

describe('updateRevisionTimestamp', () => {
  it('changes the timestamp and re-sorts ascending', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }, { id: 'r2', timestamp: 200 }]);
    const out = updateRevisionTimestamp(t, 'r1', 300, 1000);
    expect(out.revisionHistory.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(lastRevisedAt(out.revisionHistory)).toBe(300);
    expect(out.updatedAt).toBe(1000);
  });

  it('clamps a future timestamp to now', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    const out = updateRevisionTimestamp(t, 'r1', 5000, 1000);
    expect(out.revisionHistory[0].timestamp).toBe(1000);
  });

  it('returns the topic unchanged for an unknown id', () => {
    const t = baseTopic([{ id: 'r1', timestamp: 100 }]);
    expect(updateRevisionTimestamp(t, 'nope', 300, 1000)).toBe(t);
  });
});
